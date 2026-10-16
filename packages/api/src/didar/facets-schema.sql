-- Issue #5: additive classification over the existing master/collection/taxonomy/UID model.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('didar:facets-schema'));
CREATE TABLE IF NOT EXISTS didar_facet (
 code text PRIMARY KEY CHECK(code ~ '^[a-z][a-z0-9_]{1,59}$'),number int NOT NULL UNIQUE CHECK(number BETWEEN 1 AND 12),
 mode text NOT NULL CHECK(mode IN ('single_select','multi_select')),target text NOT NULL CHECK(target IN ('product','collection','merchandising')),
 active boolean NOT NULL DEFAULT true,visible boolean NOT NULL DEFAULT true,sort_order int NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 10000),version int NOT NULL DEFAULT 1,
 CHECK((code='market_tier' AND mode='single_select' AND target='product') OR code<>'market_tier'),
 CHECK((number=11 AND code='collection_type' AND target='collection') OR (number=12 AND code='merchandising' AND target='merchandising') OR (number<=10 AND target='product'))
);
CREATE TABLE IF NOT EXISTS didar_facet_value (
 id text PRIMARY KEY,facet_code text NOT NULL REFERENCES didar_facet(code),code text NOT NULL CHECK(code ~ '^[a-z][a-z0-9_]{1,79}$'),
 active boolean NOT NULL DEFAULT true,visible boolean NOT NULL DEFAULT true,evidence_required boolean NOT NULL DEFAULT false,
 sort_order int NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 10000),version int NOT NULL DEFAULT 1,
 UNIQUE(facet_code,code),UNIQUE(id,facet_code)
);
CREATE TABLE IF NOT EXISTS didar_catalog_translation (
 id text PRIMARY KEY,entity_type text NOT NULL CHECK(entity_type IN ('facet','value','collection','page')),entity_id text NOT NULL,
 locale text NOT NULL CHECK(locale IN ('fa','en','ar','fr')),label text NOT NULL CHECK(length(trim(label)) BETWEEN 2 AND 200 AND label !~ '[[:cntrl:]<>]'),
 status text NOT NULL CHECK(status IN ('draft','approved','rejected','retired')),source_ref text NOT NULL DEFAULT '',
 actor_id text REFERENCES didar_user(id),reviewed_by text REFERENCES didar_user(id),created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,
 CHECK(status<>'approved' OR reviewed_by IS NOT NULL OR source_ref LIKE 'spec:%')
);
CREATE OR REPLACE FUNCTION didar_translation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.entity_type<>OLD.entity_type OR NEW.entity_id<>OLD.entity_id OR NEW.locale<>OLD.locale OR NEW.label<>OLD.label OR NEW.source_ref<>OLD.source_ref) THEN RAISE EXCEPTION 'INVALID_TRANSLATION_IDENTITY'; END IF;
 IF NEW.status='approved' AND NEW.reviewed_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM didar_user WHERE id=NEW.reviewed_by AND role='admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_catalog_translation_validation ON didar_catalog_translation;
CREATE TRIGGER didar_catalog_translation_validation BEFORE INSERT OR UPDATE ON didar_catalog_translation FOR EACH ROW EXECUTE FUNCTION didar_translation_guard();
CREATE UNIQUE INDEX IF NOT EXISTS didar_catalog_approved_locale ON didar_catalog_translation(entity_type,entity_id,locale) WHERE status='approved';
CREATE INDEX IF NOT EXISTS didar_catalog_translation_entity ON didar_catalog_translation(entity_type,entity_id,created_at);
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS code text;
UPDATE didar_collection SET code='legacy.'||md5(id) WHERE code IS NULL;
ALTER TABLE didar_collection ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS didar_collection_code ON didar_collection(code);
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS type_id text REFERENCES didar_facet_value(id);
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS owner_supplier_id text REFERENCES didar_supplier(id);
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true;
ALTER TABLE didar_collection ALTER COLUMN published SET DEFAULT false;
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT true;
ALTER TABLE didar_collection ALTER COLUMN approved SET DEFAULT false;
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS legacy_public boolean NOT NULL DEFAULT true;
ALTER TABLE didar_collection ALTER COLUMN legacy_public SET DEFAULT false;
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 10000);
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS image_id text REFERENCES didar_product_image(id);
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS evidence text NOT NULL DEFAULT '';
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE didar_collection ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS didar_collection_type ON didar_collection(type_id);
CREATE INDEX IF NOT EXISTS didar_collection_product_master ON didar_collection_product(product_id,collection_id);
CREATE TABLE IF NOT EXISTS didar_product_facet_assignment (
 id text PRIMARY KEY,product_id text NOT NULL REFERENCES didar_product(id),value_id text NOT NULL,facet_code text NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','approved','rejected','retired')),supplier_id text REFERENCES didar_supplier(id),actor_id text NOT NULL REFERENCES didar_user(id),
 reviewed_by text REFERENCES didar_user(id),reviewed_at timestamptz,evidence text NOT NULL DEFAULT '',reason text NOT NULL DEFAULT '',
 starts_at timestamptz,ends_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version int NOT NULL DEFAULT 1,
 UNIQUE(product_id,value_id),FOREIGN KEY(value_id,facet_code) REFERENCES didar_facet_value(id,facet_code),
 CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at),CHECK(status<>'approved' OR reviewed_by IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS didar_single_approved_market_tier ON didar_product_facet_assignment(product_id) WHERE facet_code='market_tier' AND status='approved';
CREATE INDEX IF NOT EXISTS didar_facet_search ON didar_product_facet_assignment(value_id,product_id) WHERE status='approved';
CREATE INDEX IF NOT EXISTS didar_facet_product ON didar_product_facet_assignment(product_id,status);
CREATE TABLE IF NOT EXISTS didar_classification_event (
 id bigserial PRIMARY KEY,actor_id text REFERENCES didar_user(id),action text NOT NULL,entity_id text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION didar_classification_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_CLASSIFICATION_HISTORY'; END $$;
DROP TRIGGER IF EXISTS didar_classification_history ON didar_classification_event;
CREATE TRIGGER didar_classification_history BEFORE UPDATE OR DELETE ON didar_classification_event FOR EACH ROW EXECUTE FUNCTION didar_classification_event_guard();
CREATE TABLE IF NOT EXISTS didar_discovery_page (
 id text PRIMARY KEY,slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('lifestyle','occasion','heritage','curated')),query jsonb NOT NULL DEFAULT '{}',active boolean NOT NULL DEFAULT true,
 sort_order int NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 10000),starts_at timestamptz,ends_at timestamptz,version int NOT NULL DEFAULT 1,
 CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at)
);
ALTER TABLE didar_supplier_permission DROP CONSTRAINT IF EXISTS didar_supplier_permission_permission_check;
ALTER TABLE didar_supplier_permission ADD CONSTRAINT didar_supplier_permission_permission_check CHECK(permission IN (
 'REQUEST_PRODUCT_CREATION','CREATE_OWN_OFFER','EDIT_OWN_OFFER','EDIT_OWN_INVENTORY','EDIT_OWN_MAKING_CHARGE','CREATE_OWN_INTAKE','PAIR_OWN_RFID','UPDATE_OWN_FULFILLMENT','SUGGEST_OWN_CLASSIFICATION'));
CREATE OR REPLACE FUNCTION didar_facet_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='didar_facet' THEN
  IF NEW.code<>OLD.code OR NEW.number<>OLD.number OR NEW.mode<>OLD.mode OR NEW.target<>OLD.target THEN RAISE EXCEPTION 'INVALID_FACET_IDENTITY'; END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.code<>OLD.code OR NEW.facet_code<>OLD.facet_code OR (OLD.evidence_required AND NOT NEW.evidence_required) THEN RAISE EXCEPTION 'INVALID_FACET_IDENTITY'; END IF;
 END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_facet_identity ON didar_facet;
CREATE TRIGGER didar_facet_identity BEFORE UPDATE ON didar_facet FOR EACH ROW EXECUTE FUNCTION didar_facet_identity_guard();
DROP TRIGGER IF EXISTS didar_facet_value_identity ON didar_facet_value;
CREATE TRIGGER didar_facet_value_identity BEFORE UPDATE ON didar_facet_value FOR EACH ROW EXECUTE FUNCTION didar_facet_identity_guard();
CREATE OR REPLACE FUNCTION didar_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v record;reviewer text;paid bigint;
BEGIN
 PERFORM 1 FROM didar_product WHERE id=NEW.product_id FOR UPDATE;
 SELECT fv.*,f.target,f.mode,f.active facet_active INTO v FROM didar_facet_value fv JOIN didar_facet f ON f.code=fv.facet_code WHERE fv.id=NEW.value_id;
 IF v.target='collection' THEN RAISE EXCEPTION 'INVALID_FACET_TARGET'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.product_id<>OLD.product_id OR NEW.value_id<>OLD.value_id OR NEW.facet_code<>OLD.facet_code) THEN RAISE EXCEPTION 'INVALID_FACET_IDENTITY'; END IF;
 IF NEW.status='approved' THEN
  SELECT role INTO reviewer FROM didar_user WHERE id=NEW.reviewed_by;
  IF reviewer IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT v.active OR NOT v.facet_active OR NOT EXISTS(SELECT 1 FROM didar_catalog_translation WHERE entity_type='value' AND entity_id=v.id AND locale='fa' AND status='approved') THEN RAISE EXCEPTION 'INVALID_FACET_VALUE'; END IF;
  IF length(trim(NEW.reason))<5 OR ((v.evidence_required OR NEW.facet_code='heritage' OR v.code IN ('luxury','high_jewelry','limited_edition','best_seller')) AND length(trim(NEW.evidence))<10) THEN RAISE EXCEPTION 'INVALID_CLASSIFICATION_EVIDENCE'; END IF;
  IF v.mode='single_select' AND EXISTS(SELECT 1 FROM didar_product_facet_assignment a WHERE a.product_id=NEW.product_id AND a.facet_code=NEW.facet_code AND a.status='approved' AND a.id<>NEW.id) THEN RAISE EXCEPTION 'CONFLICT_FACET_CARDINALITY'; END IF;
  IF NEW.facet_code='merchandising' AND v.code='best_seller' THEN
   SELECT coalesce(sum(l.quantity),0) INTO paid FROM didar_order_line l JOIN didar_order o ON o.id=l.order_id JOIN didar_offer f ON f.id=l.offer_id WHERE f.product_id=NEW.product_id AND o.status='paid';
   IF paid<5 THEN RAISE EXCEPTION 'INVALID_BEST_SELLER_EVIDENCE'; END IF;
  END IF;
 END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_assignment_validation ON didar_product_facet_assignment;
CREATE TRIGGER didar_assignment_validation BEFORE INSERT OR UPDATE ON didar_product_facet_assignment FOR EACH ROW EXECUTE FUNCTION didar_assignment_guard();
CREATE OR REPLACE FUNCTION didar_collection_governance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.code<>OLD.code OR (NEW.legacy_public AND NOT OLD.legacy_public)) THEN RAISE EXCEPTION 'INVALID_COLLECTION_IDENTITY'; END IF;
 IF NEW.type_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM didar_facet_value WHERE id=NEW.type_id AND facet_code='collection_type') THEN RAISE EXCEPTION 'INVALID_COLLECTION_TYPE'; END IF;
 IF NEW.published AND NEW.approved AND NOT NEW.legacy_public AND NOT EXISTS(SELECT 1 FROM didar_facet_value v JOIN didar_facet f ON f.code=v.facet_code WHERE v.id=NEW.type_id AND v.active AND f.active AND v.facet_code='collection_type') THEN RAISE EXCEPTION 'INVALID_COLLECTION_TYPE'; END IF;
 IF NEW.published AND NEW.approved AND EXISTS(SELECT 1 FROM didar_facet_value WHERE id=NEW.type_id AND evidence_required) AND length(trim(NEW.evidence))<10 THEN RAISE EXCEPTION 'INVALID_COLLECTION_EVIDENCE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_collection_governance ON didar_collection;
CREATE TRIGGER didar_collection_governance BEFORE INSERT OR UPDATE ON didar_collection FOR EACH ROW EXECUTE FUNCTION didar_collection_governance_guard();
CREATE OR REPLACE VIEW didar_effective_classification AS
 SELECT a.product_id,a.value_id,a.facet_code,v.code,v.sort_order FROM didar_product_facet_assignment a JOIN didar_facet_value v ON v.id=a.value_id JOIN didar_facet f ON f.code=a.facet_code
 WHERE a.status='approved' AND v.active AND v.visible AND f.active AND f.visible AND (a.starts_at IS NULL OR a.starts_at<=now()) AND (a.ends_at IS NULL OR a.ends_at>now())
 AND EXISTS(SELECT 1 FROM didar_catalog_translation t WHERE t.entity_type='value' AND t.entity_id=v.id AND t.locale='fa' AND t.status='approved');
COMMIT;
