import { afterAll, expect, test } from "bun:test";
import { Pool } from "../packages/api/node_modules/pg";
import { afterCommit, transaction, db } from "../packages/api/src/didar/db";
import {
  reconcileProductProjection,
  runProductProjections,
} from "../packages/api/src/didar/projection";

const database = new URL(
  process.env.DATABASE_URL || "postgres://invalid/invalid",
);
const enabled =
  process.env.DIDAR_DISPOSABLE_QA === "true" &&
  ["127.0.0.1", "localhost"].includes(database.hostname) &&
  database.pathname === "/didar_qa";
const qa = enabled ? test : test.skip;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  allowExitOnIdle: true,
});
const ids: string[] = [];
const fresh = async () => {
  const id = "projection-test-" + crypto.randomUUID();
  ids.push(id);
  await pool.query(
    `INSERT INTO didar_product(id,title,category,description,purity,active,published,approved)
    VALUES($1,'Projection authority','Other','Source fields',750,true,false,false)`,
    [id],
  );
  return id;
};
afterAll(async () => {
  if (enabled && ids.length)
    await pool.query("DELETE FROM didar_product WHERE id=ANY($1::text[])", [
      ids,
    ]);
  await pool.end();
});
qa(
  "projection source revision and job roll back on final canonical COMMIT failure; afterCommit never runs",
  async () => {
    const id = "projection-test-" + crypto.randomUUID();
    ids.push(id);
    const tag = "projection_commit_" + crypto.randomUUID().replaceAll("-", "");
    await pool.query(`CREATE FUNCTION ${tag}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.id='${id}' THEN RAISE EXCEPTION 'INJECTED_FINAL_COMMIT_FAILURE'; END IF; RETURN NEW; END $$;
    CREATE CONSTRAINT TRIGGER ${tag} AFTER INSERT ON didar_product DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${tag}()`);
    let called = false;
    try {
      await expect(
        transaction(async (c) => {
          await c.query(
            `INSERT INTO didar_product(id,title,category,description,purity) VALUES($1,'Final commit','Other','',750)`,
            [id],
          );
          afterCommit(c, async () => {
            called = true;
          });
        }),
      ).rejects.toThrow("INJECTED_FINAL_COMMIT_FAILURE");
      expect(called).toBe(false);
      expect(
        (
          await pool.query(
            "SELECT product_id FROM didar_product_projection_job WHERE product_id=$1",
            [id],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await pool.query(
            "SELECT id FROM product WHERE id='prod_didar_'||md5($1)",
            [id],
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      await pool.query(
        `DROP TRIGGER ${tag} ON didar_product; DROP FUNCTION ${tag}()`,
      );
    }
  },
);
qa(
  "latest revision wins reordered deliveries and source-row lock serializes concurrent writers",
  async () => {
    const id = await fresh();
    await pool.query(
      "UPDATE didar_product SET title='Revision two' WHERE id=$1",
      [id],
    );
    await pool.query(
      "UPDATE didar_product SET title='Revision three' WHERE id=$1",
      [id],
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const seen: string[] = [];
    const first = runProductProjections(null, {
      productId: id,
      limit: 1,
      write: async (_scope, p, rev) => {
        seen.push(p.title + ":" + rev);
        entered();
        await gate;
      },
    });
    await started;
    let editFinished = false;
    const edit = pool
      .query(
        "UPDATE didar_product SET title='Concurrent revision four' WHERE id=$1",
        [id],
      )
      .then(() => {
        editFinished = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(editFinished).toBe(false);
    release();
    await first;
    await edit;
    await runProductProjections(null, {
      productId: id,
      limit: 1,
      write: async (_scope, p, rev) => {
        seen.push(p.title + ":" + rev);
      },
    });
    expect(seen).toEqual(["Revision three:3", "Concurrent revision four:4"]);
    const state = (
      await pool.query(
        "SELECT source_revision,projected_revision FROM didar_product_projection WHERE product_id=$1",
        [id],
      )
    ).rows[0];
    expect(state).toEqual({ source_revision: "4", projected_revision: "4" });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int n FROM didar_product_projection_job WHERE product_id=$1 AND status='SUPERSEDED'",
          [id],
        )
      ).rows[0].n,
    ).toBe(2);
  },
);
qa(
  "forward projection has bounded retry, observable terminal failure and explicit latest-only reconciliation",
  async () => {
    const id = await fresh();
    for (let attempt = 0; attempt < 5; attempt++) {
      await pool.query(
        "UPDATE didar_product_projection_job SET available_at=now() WHERE product_id=$1",
        [id],
      );
      const result = await runProductProjections(null, {
        productId: id,
        limit: 1,
        write: async () => {
          throw Error("provider secret must not persist");
        },
      });
      expect(result[0].attempts).toBe(attempt + 1);
      expect(result[0].status).toBe(attempt === 4 ? "FAILED" : "RETRY");
    }
    expect(
      await runProductProjections(null, { productId: id, limit: 1 }),
    ).toEqual([]);
    expect(
      (
        await pool.query(
          "SELECT error_code FROM didar_product_projection_job WHERE product_id=$1",
          [id],
        )
      ).rows[0].error_code,
    ).toBe("NATIVE_PROJECTION_FAILED");
    await reconcileProductProjection(id);
    expect(
      (
        await runProductProjections(null, {
          productId: id,
          limit: 1,
          write: async () => {},
        })
      )[0].status,
    ).toBe("DONE");
    // Existing stable links cannot be redirected into a different native master.
    await expect(
      pool.query(
        "UPDATE didar_product SET native_id='foreign-id' WHERE id=$1",
        [id],
      ),
    ).rejects.toThrow("CONFLICT_IMMUTABLE_NATIVE_PRODUCT_LINK");
  },
);
qa(
  "first relevant edit links an untouched historical NULL native id without bulk backfill",
  async () => {
    const id = "projection-test-legacy-" + crypto.randomUUID();
    ids.push(id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Emulate an existing pre-migration row only in this disposable session.
      await client.query("SET LOCAL session_replication_role=replica");
      await client.query(
        "INSERT INTO didar_product(id,title,category,description,purity,native_id,public_key) VALUES($1,'Legacy unlinked','Other','',750,NULL,md5($1))",
        [id],
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    expect(
      (
        await pool.query(
          "SELECT product_id FROM didar_product_projection WHERE product_id=$1",
          [id],
        )
      ).rowCount,
    ).toBe(0);
    await pool.query(
      "UPDATE didar_product SET title='First governed edit' WHERE id=$1",
      [id],
    );
    const p = (
      await pool.query(
        "SELECT p.native_id,s.source_revision FROM didar_product p JOIN didar_product_projection s ON s.product_id=p.id WHERE p.id=$1",
        [id],
      )
    ).rows[0];
    expect(p.native_id).toMatch(/^prod_didar_[a-f0-9]{32}$/);
    expect(p.source_revision).toBe("1");
  },
);
qa(
  "post-commit optimization failure preserves committed source and durable pending work",
  async () => {
    const id = "projection-test-hook-" + crypto.randomUUID();
    ids.push(id);
    const result = await transaction(async (c) => {
      await c.query(
        "INSERT INTO didar_product(id,title,category,description,purity) VALUES($1,'Committed source','Other','',750)",
        [id],
      );
      afterCommit(c, async () => {
        throw Error("Injected callback process unavailable");
      });
      return { id };
    });
    expect(result.id).toBe(id);
    expect(
      (
        await pool.query(
          "SELECT j.status FROM didar_product_projection_job j JOIN didar_product p ON p.id=j.product_id WHERE p.id=$1",
          [id],
        )
      ).rows[0].status,
    ).toBe("PENDING");
  },
);
