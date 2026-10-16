-- Additive merchant access and storefront context. No changes to historical commerce rows.
CREATE TABLE IF NOT EXISTS didar_storefront (
 supplier_id text PRIMARY KEY REFERENCES didar_supplier(id),
 handle text UNIQUE NOT NULL CHECK(handle ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 intro text NOT NULL DEFAULT '' CHECK(length(intro)<=2000),
 contact text NOT NULL DEFAULT '' CHECK(length(contact)<=300),
 logo_image_id text REFERENCES didar_product_image(id) ON DELETE SET NULL,
 visibility text NOT NULL DEFAULT 'PUBLIC_MARKETPLACE' CHECK(visibility IN ('PUBLIC_MARKETPLACE','UNLISTED_LINK','INVITE_ONLY')),
 published boolean NOT NULL DEFAULT false, approved boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, created_by text REFERENCES didar_user(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS didar_merchant_member (
 supplier_id text NOT NULL REFERENCES didar_supplier(id), user_id text NOT NULL REFERENCES didar_user(id),
 permission text NOT NULL CHECK(permission IN ('STOREFRONT','SHARE','ONBOARDING','CONTENT_EDIT','CONTENT_PUBLISH')),
 active boolean NOT NULL DEFAULT true, granted_by text NOT NULL REFERENCES didar_user(id),
 PRIMARY KEY(supplier_id,user_id,permission)
);
CREATE INDEX IF NOT EXISTS didar_merchant_member_user_idx ON didar_merchant_member(user_id,supplier_id) WHERE active;
CREATE TABLE IF NOT EXISTS didar_store_invite (
 supplier_id text NOT NULL REFERENCES didar_supplier(id), user_id text NOT NULL REFERENCES didar_user(id),
 active boolean NOT NULL DEFAULT true, expires_at timestamptz NOT NULL,
 granted_by text NOT NULL REFERENCES didar_user(id), PRIMARY KEY(supplier_id,user_id)
);
CREATE TABLE IF NOT EXISTS didar_store_context (
 token_hash text PRIMARY KEY, supplier_id text NOT NULL REFERENCES didar_storefront(supplier_id),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours'
);
CREATE INDEX IF NOT EXISTS didar_store_context_expiry_idx ON didar_store_context(expires_at);
ALTER TABLE didar_order ADD COLUMN IF NOT EXISTS origin_supplier_id text REFERENCES didar_supplier(id);
ALTER TABLE didar_order ADD COLUMN IF NOT EXISTS storefront_snapshot jsonb;
CREATE INDEX IF NOT EXISTS didar_order_origin_idx ON didar_order(origin_supplier_id,created_at);
CREATE OR REPLACE FUNCTION didar_global_supplier(sid text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM didar_storefront f WHERE f.supplier_id=sid AND (f.visibility<>'PUBLIC_MARKETPLACE' OR NOT f.published OR NOT f.approved))
$$;
CREATE OR REPLACE FUNCTION didar_visible_product(pid text,sid text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM didar_offer o JOIN didar_supplier s ON s.id=o.supplier_id
 WHERE o.product_id=pid AND o.active AND s.active AND s.status='approved' AND
 ((sid IS NULL AND didar_global_supplier(o.supplier_id)) OR o.supplier_id=sid))
 OR (sid IS NULL AND NOT EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=pid AND NOT didar_global_supplier(o.supplier_id)) AND NOT EXISTS(SELECT 1 FROM didar_product_request r WHERE r.product_id=pid AND r.status='approved' AND r.payload->>'join_product_id' IS NULL AND NOT didar_global_supplier(r.supplier_id)))
$$;
CREATE OR REPLACE FUNCTION didar_storefront_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.handle IS DISTINCT FROM OLD.handle THEN RAISE EXCEPTION 'CONFLICT_STABLE_HANDLE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_storefront_identity_guard ON didar_storefront;
CREATE TRIGGER didar_storefront_identity_guard BEFORE UPDATE ON didar_storefront FOR EACH ROW EXECUTE FUNCTION didar_storefront_identity_guard();
CREATE OR REPLACE FUNCTION didar_order_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.origin_supplier_id IS DISTINCT FROM OLD.origin_supplier_id OR NEW.storefront_snapshot IS DISTINCT FROM OLD.storefront_snapshot THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_ORIGIN'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_order_origin_guard ON didar_order;
CREATE TRIGGER didar_order_origin_guard BEFORE UPDATE ON didar_order FOR EACH ROW EXECUTE FUNCTION didar_order_origin_guard();

CREATE INDEX IF NOT EXISTS didar_store_context_supplier_idx ON didar_store_context(supplier_id);
CREATE INDEX IF NOT EXISTS didar_store_invite_user_idx ON didar_store_invite(user_id,supplier_id);
