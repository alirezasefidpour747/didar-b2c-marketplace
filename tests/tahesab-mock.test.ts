import { test, expect } from "bun:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
test("Gate 4 standalone local mock enforces its own envelope, retries idempotently and persists across restart", async () => {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;
  await new Promise<void>((r) => server.close(() => r()));
  mkdirSync(".local", { recursive: true });
  const cwd = mkdtempSync(".local/mock-contract-"),
    url = "http://127.0.0.1:" + port;
  const start = () =>
    spawn(
      process.execPath.endsWith("bun") ? "node" : process.execPath,
      [resolve("scripts/tahesab-mock.mjs")],
      {
        cwd,
        env: { ...process.env, TAHESAB_MOCK_PORT: String(port) },
        stdio: "ignore",
      },
    );
  let child = start();
  const stop = async () => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise<void>((r) => child.once("exit", () => r()));
  };
  const ready = async () => {
    for (let n = 0; n < 60; n++) {
      try {
        if ((await fetch(url + "/health")).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("Local mock did not start");
  };
  const payload = {
    version: "didar-aggregate-v1",
    mode: "DRY_RUN",
    merchant: {
      id: "QA_S1",
      account_code: "QA_M",
      gold_code: "QA_G",
      rial_code: "QA_R",
      invoice_reference: "QA_INVOICE",
    },
    period: {
      start_at: "2026-10-15T00:00:00Z",
      end_at: "2026-10-16T00:00:00Z",
      timezone: "Asia/Tehran",
    },
    Factor_Code: "DIDAR_QA_" + "a".repeat(32),
    groups: [
      {
        event_type: "SALE_EXPOSURE",
        jalali_date: "1405/07/24",
        metal_basis: "FINE_GOLD_UG",
        purity: 750,
        instrument: "IRR",
        account: "QA_DEBIT",
        party_role: "DIDAR",
        debit: "1",
        credit: "0",
      },
      {
        event_type: "SALE_EXPOSURE",
        jalali_date: "1405/07/24",
        metal_basis: "FINE_GOLD_UG",
        purity: 750,
        instrument: "IRR",
        account: "QA_CREDIT",
        party_role: "MERCHANT",
        debit: "0",
        credit: "1",
      },
    ],
  };
  const send = (headers: any = {}) =>
    fetch(url + "/mock/aggregate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer DIDAR_LOCAL_MOCK_ONLY",
        DBname: "QA_DIDAR",
        ...headers,
      },
      body: JSON.stringify([payload.Factor_Code, 1, payload]),
    });
  try {
    await ready();
    expect((await send({ authorization: "Bearer invalid" })).status).toBe(401);
    expect((await send({ "x-didar-mock-outcome": "transient" })).status).toBe(
      503,
    );
    const a = await (await send()).json(),
      b = await (await send()).json();
    expect(a.state).toBe("acknowledged");
    expect(a).toEqual(b);
    expect(
      Object.keys(
        JSON.parse(
          readFileSync(
            resolve(cwd, ".local/tahesab-mock-documents.json"),
            "utf8",
          ),
        ),
      ),
    ).toHaveLength(1);
    await stop();
    child = start();
    await ready();
    expect(await (await send()).json()).toEqual(a);
  } finally {
    await stop();
  }
}, 15000);
