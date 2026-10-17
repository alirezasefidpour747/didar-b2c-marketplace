-- Phase 3: preserve existing image IDs and product-request identities.
ALTER TABLE didar_product_request ADD COLUMN IF NOT EXISTS created_by text REFERENCES didar_user(id);
ALTER TABLE didar_product_request ADD COLUMN IF NOT EXISTS assisted_by_agent text REFERENCES didar_user(id);
CREATE TABLE IF NOT EXISTS didar_media_policy (
 id integer PRIMARY KEY CHECK(id=1),version integer NOT NULL DEFAULT 1,
 card_width integer NOT NULL DEFAULT 400 CHECK(card_width BETWEEN 160 AND 800),
 medium_width integer NOT NULL DEFAULT 900 CHECK(medium_width BETWEEN 400 AND 1600),
 zoom_width integer NOT NULL DEFAULT 1600 CHECK(zoom_width BETWEEN 800 AND 2400),
 quality integer NOT NULL DEFAULT 82 CHECK(quality BETWEEN 60 AND 90),
 CHECK(card_width<medium_width AND medium_width<zoom_width)
);
INSERT INTO didar_media_policy(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS didar_media_asset (
 id text PRIMARY KEY, supplier_id text NOT NULL REFERENCES didar_supplier(id),
 request_id text REFERENCES didar_product_request(id),product_id text REFERENCES didar_product(id),
 source_mime text NOT NULL CHECK(source_mime IN ('image/jpeg','image/png','image/webp')),
 source_width integer NOT NULL CHECK(source_width BETWEEN 1 AND 12000),source_height integer NOT NULL CHECK(source_height BETWEEN 1 AND 12000),
 original_bytes integer NOT NULL CHECK(original_bytes BETWEEN 16 AND 8388608),
 sanitized_data bytea NOT NULL CHECK(octet_length(sanitized_data)<=8388608),
 alt text NOT NULL CHECK(length(alt) BETWEEN 1 AND 300),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_by text NOT NULL REFERENCES didar_user(id),uploaded_by text NOT NULL REFERENCES didar_user(id),
 assisted_by_agent text REFERENCES didar_user(id),approved_by text REFERENCES didar_user(id),
 review_reason text NOT NULL DEFAULT '',policy_snapshot jsonb NOT NULL,receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,
 CHECK(product_id IS NOT NULL OR request_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS didar_media_asset_supplier_idx ON didar_media_asset(supplier_id,created_at);
CREATE INDEX IF NOT EXISTS didar_media_asset_request_idx ON didar_media_asset(request_id);
CREATE INDEX IF NOT EXISTS didar_media_asset_product_idx ON didar_media_asset(product_id);
CREATE TABLE IF NOT EXISTS didar_media_variant (
 asset_id text NOT NULL REFERENCES didar_media_asset(id),kind text NOT NULL CHECK(kind IN ('card','medium','zoom')),
 width integer NOT NULL CHECK(width BETWEEN 1 AND 2400),height integer NOT NULL CHECK(height BETWEEN 1 AND 12000),
 data bytea NOT NULL CHECK(octet_length(data)<=786432),mime_type text NOT NULL DEFAULT 'image/webp' CHECK(mime_type='image/webp'),
 PRIMARY KEY(asset_id,kind)
);
ALTER TABLE didar_product_image ADD COLUMN IF NOT EXISTS media_asset_id text REFERENCES didar_media_asset(id);
CREATE UNIQUE INDEX IF NOT EXISTS didar_product_image_media_idx ON didar_product_image(media_asset_id) WHERE media_asset_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS didar_onboarding_event (
 id bigserial PRIMARY KEY,supplier_id text NOT NULL REFERENCES didar_supplier(id),actor_id text NOT NULL REFERENCES didar_user(id),
 action text NOT NULL,request_id text REFERENCES didar_product_request(id),asset_id text REFERENCES didar_media_asset(id),
 details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS didar_onboarding_event_supplier_idx ON didar_onboarding_event(supplier_id,created_at);

ALTER TABLE didar_media_asset ADD COLUMN IF NOT EXISTS intent_key text;
ALTER TABLE didar_media_asset ADD COLUMN IF NOT EXISTS source_digest text;
CREATE UNIQUE INDEX IF NOT EXISTS didar_media_asset_intent_idx ON didar_media_asset(supplier_id,intent_key) WHERE intent_key IS NOT NULL;
ALTER TABLE didar_product_request ADD COLUMN IF NOT EXISTS client_request_key text;
CREATE UNIQUE INDEX IF NOT EXISTS didar_product_request_intent_idx ON didar_product_request(supplier_id,client_request_key) WHERE client_request_key IS NOT NULL;
ALTER TABLE didar_media_asset ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'MERCHANT_ONLY' CHECK(visibility IN ('MERCHANT_ONLY','SHARED_MASTER'));
ALTER TABLE didar_media_asset ADD COLUMN IF NOT EXISTS allow_shared boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION didar_onboarding_immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_ONBOARDING_EVENT'; END $$;
DROP TRIGGER IF EXISTS didar_onboarding_event_guard ON didar_onboarding_event;
CREATE TRIGGER didar_onboarding_event_guard BEFORE UPDATE OR DELETE ON didar_onboarding_event FOR EACH ROW EXECUTE FUNCTION didar_onboarding_immutable_event();
CREATE OR REPLACE FUNCTION didar_media_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)->>'purpose') IS DISTINCT FROM (to_jsonb(OLD)->>'purpose') OR (NEW.supplier_id,NEW.request_id,NEW.source_mime,NEW.source_width,NEW.source_height,NEW.original_bytes,NEW.sanitized_data,NEW.created_by,NEW.uploaded_by,NEW.assisted_by_agent,NEW.source_digest,NEW.intent_key,NEW.allow_shared,NEW.alt,NEW.policy_snapshot,NEW.receipt,NEW.id) IS DISTINCT FROM (OLD.supplier_id,OLD.request_id,OLD.source_mime,OLD.source_width,OLD.source_height,OLD.original_bytes,OLD.sanitized_data,OLD.created_by,OLD.uploaded_by,OLD.assisted_by_agent,OLD.source_digest,OLD.intent_key,OLD.allow_shared,OLD.alt,OLD.policy_snapshot,OLD.receipt,OLD.id) OR (OLD.product_id IS NOT NULL AND NEW.product_id IS DISTINCT FROM OLD.product_id) ) THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_MEDIA_SOURCE'; END IF;
 IF NEW.status='approved' AND ((coalesce(to_jsonb(NEW)->>'purpose','PRODUCT')='PRODUCT' AND NEW.product_id IS NULL) OR NEW.approved_by IS NULL OR (NEW.visibility='SHARED_MASTER' AND NOT NEW.allow_shared)) THEN RAISE EXCEPTION 'INVALID_MEDIA_APPROVAL'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_media_source_guard ON didar_media_asset;
CREATE TRIGGER didar_media_source_guard BEFORE INSERT OR UPDATE ON didar_media_asset FOR EACH ROW EXECUTE FUNCTION didar_media_source_guard();
-- A replay of an older migration must not downgrade CORE-03 visibility.
DO $replay$
BEGIN
 IF to_regclass('didar_curation_agreement') IS NULL THEN
  EXECUTE $definition$CREATE OR REPLACE FUNCTION didar_media_visible(aid text,sid text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce((SELECT a.status='approved' AND (a.visibility='SHARED_MASTER' OR a.supplier_id=sid OR (sid IS NULL AND EXISTS(SELECT 1 FROM didar_supplier s WHERE s.id=a.supplier_id AND s.active AND s.status='approved' AND didar_global_supplier(s.id) AND EXISTS(SELECT 1 FROM didar_offer o WHERE o.supplier_id=s.id AND o.product_id=a.product_id AND o.active)))) FROM didar_media_asset a WHERE a.id=aid),false)
$$;$definition$;
 END IF;
END $replay$;

-- A private merchant new-master approval cannot open a public discovery window before first intake.
-- A replay of an older migration must not downgrade CORE-03 visibility.
DO $replay$
BEGIN
 IF to_regclass('didar_curation_agreement') IS NULL THEN
  EXECUTE $definition$CREATE OR REPLACE FUNCTION didar_visible_product(pid text,sid text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM didar_offer o JOIN didar_supplier s ON s.id=o.supplier_id
 WHERE o.product_id=pid AND o.active AND s.active AND s.status='approved' AND
 ((sid IS NULL AND didar_global_supplier(o.supplier_id)) OR o.supplier_id=sid))
 OR (sid IS NULL AND NOT EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=pid AND NOT didar_global_supplier(o.supplier_id)) AND NOT EXISTS(SELECT 1 FROM didar_product_request r WHERE r.product_id=pid AND r.status='approved' AND r.payload->>'join_product_id' IS NULL AND NOT didar_global_supplier(r.supplier_id)))
$$;$definition$;
 END IF;
END $replay$;

DROP TRIGGER IF EXISTS didar_media_variant_guard ON didar_media_variant;
CREATE TRIGGER didar_media_variant_guard BEFORE UPDATE OR DELETE ON didar_media_variant FOR EACH ROW EXECUTE FUNCTION didar_onboarding_immutable_event();

ALTER TABLE didar_media_policy ADD COLUMN IF NOT EXISTS max_variant_bytes integer NOT NULL DEFAULT 786432 CHECK(max_variant_bytes BETWEEN 16384 AND 786432);
