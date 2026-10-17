-- Revisioned one-way projection. No historical Product, UID or financial backfill.
CREATE TABLE IF NOT EXISTS didar_product_projection (
  product_id text PRIMARY KEY REFERENCES didar_product(id) ON DELETE CASCADE,
  source_revision bigint NOT NULL CHECK (source_revision > 0),
  projected_revision bigint NOT NULL DEFAULT 0 CHECK (projected_revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (projected_revision <= source_revision)
);
CREATE TABLE IF NOT EXISTS didar_product_projection_job (
  product_id text NOT NULL REFERENCES didar_product(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK (revision > 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RETRY','DONE','SUPERSEDED','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  available_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(product_id,revision)
);
CREATE INDEX IF NOT EXISTS didar_projection_ready_idx ON didar_product_projection_job(available_at,product_id) WHERE status IN ('PENDING','RETRY');
CREATE OR REPLACE FUNCTION didar_product_projection_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.native_id IS NOT NULL AND NEW.native_id IS DISTINCT FROM OLD.native_id THEN
    RAISE EXCEPTION 'CONFLICT_IMMUTABLE_NATIVE_PRODUCT_LINK';
  END IF;
  IF NEW.native_id IS NULL THEN NEW.native_id := 'prod_didar_' || md5(NEW.id); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_product_projection_identity ON didar_product;
CREATE TRIGGER didar_product_projection_identity BEFORE INSERT OR UPDATE OF title,description,purity,reference,jewelry_type,min_weight_mg,max_weight_mg,active,published,approved,native_id ON didar_product FOR EACH ROW EXECUTE FUNCTION didar_product_projection_identity();
CREATE OR REPLACE FUNCTION didar_product_projection_enqueue() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_revision bigint;
BEGIN
  IF TG_OP='UPDATE' AND ROW(NEW.title,NEW.description,NEW.purity,NEW.reference,NEW.jewelry_type,NEW.min_weight_mg,NEW.max_weight_mg,NEW.active,NEW.published,NEW.approved,NEW.native_id)
    IS NOT DISTINCT FROM ROW(OLD.title,OLD.description,OLD.purity,OLD.reference,OLD.jewelry_type,OLD.min_weight_mg,OLD.max_weight_mg,OLD.active,OLD.published,OLD.approved,OLD.native_id) THEN RETURN NEW; END IF;
  INSERT INTO didar_product_projection(product_id,source_revision) VALUES(NEW.id,1)
    ON CONFLICT(product_id) DO UPDATE SET source_revision=didar_product_projection.source_revision+1,updated_at=now()
    RETURNING source_revision INTO next_revision;
  INSERT INTO didar_product_projection_job(product_id,revision) VALUES(NEW.id,next_revision);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_product_projection_enqueue ON didar_product;
CREATE TRIGGER didar_product_projection_enqueue AFTER INSERT OR UPDATE OF title,description,purity,reference,jewelry_type,min_weight_mg,max_weight_mg,active,published,approved,native_id ON didar_product FOR EACH ROW EXECUTE FUNCTION didar_product_projection_enqueue();
