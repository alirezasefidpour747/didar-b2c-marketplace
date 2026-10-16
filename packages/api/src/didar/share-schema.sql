-- Phase 2C: extensible curated share pages, ordered references, first-party visits.
CREATE TABLE IF NOT EXISTS didar_share_page (
 id text PRIMARY KEY, supplier_id text NOT NULL REFERENCES didar_storefront(supplier_id),
 slug text NOT NULL CHECK(slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120), intro text NOT NULL DEFAULT '' CHECK(length(intro)<=2000),
 published boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL REFERENCES didar_user(id),updated_by text NOT NULL REFERENCES didar_user(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(supplier_id,slug)
);
CREATE TABLE IF NOT EXISTS didar_share_product (
 page_id text NOT NULL REFERENCES didar_share_page(id) ON DELETE CASCADE,
 product_id text NOT NULL REFERENCES didar_product(id), position integer NOT NULL CHECK(position BETWEEN 0 AND 19),
 PRIMARY KEY(page_id,product_id),UNIQUE(page_id,position)
);
CREATE INDEX IF NOT EXISTS didar_share_product_product_idx ON didar_share_product(product_id);
CREATE TABLE IF NOT EXISTS didar_share_visit (
 id text PRIMARY KEY,token_hash text UNIQUE NOT NULL,page_id text NOT NULL REFERENCES didar_share_page(id),
 context_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days'
);
CREATE INDEX IF NOT EXISTS didar_share_visit_page_idx ON didar_share_visit(page_id,created_at);
CREATE INDEX IF NOT EXISTS didar_share_visit_context_idx ON didar_share_visit(context_hash,created_at);
ALTER TABLE didar_order ADD COLUMN IF NOT EXISTS share_page_id text REFERENCES didar_share_page(id);
ALTER TABLE didar_order ADD COLUMN IF NOT EXISTS share_visit_id text REFERENCES didar_share_visit(id);
CREATE INDEX IF NOT EXISTS didar_order_share_idx ON didar_order(share_page_id,status);
CREATE OR REPLACE FUNCTION didar_share_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.supplier_id<>OLD.supplier_id OR NEW.slug<>OLD.slug OR NEW.created_by<>OLD.created_by THEN RAISE EXCEPTION 'CONFLICT_STABLE_SHARE'; END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_share_identity_guard ON didar_share_page;
CREATE TRIGGER didar_share_identity_guard BEFORE UPDATE ON didar_share_page FOR EACH ROW EXECUTE FUNCTION didar_share_identity_guard();
CREATE OR REPLACE FUNCTION didar_order_share_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.share_page_id IS DISTINCT FROM OLD.share_page_id OR NEW.share_visit_id IS DISTINCT FROM OLD.share_visit_id THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_ATTRIBUTION'; END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_order_share_guard ON didar_order;
CREATE TRIGGER didar_order_share_guard BEFORE UPDATE ON didar_order FOR EACH ROW EXECUTE FUNCTION didar_order_share_guard();

ALTER TABLE didar_share_page ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'CURATED' CHECK(kind IN ('CURATED','PRODUCT'));
