-- Additive Phase 1 migration. Legacy quantities and historical snapshots remain unchanged.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('didar:phase1-schema'));
ALTER TABLE didar_product ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}';
ALTER TABLE didar_product ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT true;
ALTER TABLE didar_offer ADD COLUMN IF NOT EXISTS stock_mode text NOT NULL DEFAULT 'legacy' CHECK(stock_mode IN ('legacy','itemized'));
ALTER TABLE didar_offer ADD COLUMN IF NOT EXISTS making_mode text CHECK(making_mode IN ('percent','fixed_gold'));
ALTER TABLE didar_offer ADD COLUMN IF NOT EXISTS making_bps int NOT NULL DEFAULT 0 CHECK(making_bps BETWEEN 0 AND 10000);
ALTER TABLE didar_offer ADD COLUMN IF NOT EXISTS making_weight_mg int NOT NULL DEFAULT 0 CHECK(making_weight_mg BETWEEN 0 AND 1000000);
ALTER TABLE didar_offer DROP CONSTRAINT IF EXISTS didar_offer_product_id_supplier_id_weight_mg_key;
CREATE UNIQUE INDEX IF NOT EXISTS didar_legacy_offer_unique ON didar_offer(product_id,supplier_id,weight_mg) WHERE stock_mode='legacy';
ALTER TABLE didar_order_line ADD COLUMN IF NOT EXISTS stock_mode text NOT NULL DEFAULT 'legacy' CHECK(stock_mode IN ('legacy','itemized'));
CREATE TABLE IF NOT EXISTS didar_pricing_policy (
 id bigserial PRIMARY KEY, distribution_bps int NOT NULL CHECK(distribution_bps BETWEEN 0 AND 10000),
 retail_bps int NOT NULL CHECK(retail_bps BETWEEN 0 AND 10000), vat_bps int NOT NULL CHECK(vat_bps BETWEEN 0 AND 10000),
 taxable_components text[] NOT NULL CHECK(taxable_components <@ ARRAY['gold','making','distribution','retail']::text[]),
 actor_id text REFERENCES didar_user(id), created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO didar_pricing_policy(distribution_bps,retail_bps,vat_bps,taxable_components)
 SELECT 300,700,1000,ARRAY['making','distribution','retail'] WHERE NOT EXISTS(SELECT 1 FROM didar_pricing_policy);
ALTER TABLE didar_rate ADD COLUMN IF NOT EXISTS pricing_policy_id bigint REFERENCES didar_pricing_policy(id);
UPDATE didar_rate SET pricing_policy_id=(SELECT min(id) FROM didar_pricing_policy) WHERE pricing_policy_id IS NULL;
CREATE TABLE IF NOT EXISTS didar_supplier_permission (
 supplier_id text REFERENCES didar_supplier(id), permission text CHECK(permission IN (
 'REQUEST_PRODUCT_CREATION','CREATE_OWN_OFFER','EDIT_OWN_OFFER','EDIT_OWN_INVENTORY',
 'EDIT_OWN_MAKING_CHARGE','CREATE_OWN_INTAKE','PAIR_OWN_RFID','UPDATE_OWN_FULFILLMENT')),
 granted boolean NOT NULL, actor_id text REFERENCES didar_user(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(supplier_id,permission));
CREATE TABLE IF NOT EXISTS didar_intake_policy (
 id bigserial PRIMARY KEY,tolerance_mg int NOT NULL CHECK(tolerance_mg BETWEEN 0 AND 1000),
 reason text NOT NULL,actor_id text REFERENCES didar_user(id),created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO didar_intake_policy(tolerance_mg,reason) SELECT 0,'Exact reconciliation required' WHERE NOT EXISTS(SELECT 1 FROM didar_intake_policy);
CREATE TABLE IF NOT EXISTS didar_intake_batch (
 id text PRIMARY KEY,supplier_id text NOT NULL REFERENCES didar_supplier(id),invoice_number text NOT NULL,
 tahesab_reference text NOT NULL DEFAULT '',received_at timestamptz NOT NULL,operator_id text NOT NULL REFERENCES didar_user(id),
 reference_purity int NOT NULL CHECK(reference_purity BETWEEN 1 AND 1000),notes text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','verified','posted')),version int NOT NULL DEFAULT 1,
 verification jsonb,created_at timestamptz NOT NULL DEFAULT now(),verified_at timestamptz,posted_at timestamptz,
 UNIQUE(supplier_id,invoice_number));
CREATE TABLE IF NOT EXISTS didar_intake_line (
 id text PRIMARY KEY,batch_id text NOT NULL REFERENCES didar_intake_batch(id),product_id text REFERENCES didar_product(id),
 description text NOT NULL,quantity int NOT NULL CHECK(quantity BETWEEN 1 AND 10000),total_weight_mg int NOT NULL CHECK(total_weight_mg BETWEEN 1 AND 100000000),
 purity int NOT NULL CHECK(purity BETWEEN 1 AND 1000),making_mode text NOT NULL CHECK(making_mode IN ('percent','fixed_gold')),
 making_bps int NOT NULL CHECK(making_bps BETWEEN 0 AND 10000),making_weight_mg int NOT NULL CHECK(making_weight_mg BETWEEN 0 AND 1000000),
 details jsonb NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS didar_inventory_item (
 id text PRIMARY KEY,uid text NOT NULL UNIQUE CHECK(uid ~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'),
 line_id text NOT NULL REFERENCES didar_intake_line(id),supplier_id text NOT NULL REFERENCES didar_supplier(id),
 product_id text REFERENCES didar_product(id),offer_id text REFERENCES didar_offer(id),
 weight_mg int NOT NULL CHECK(weight_mg BETWEEN 1 AND 1000000),purity int NOT NULL CHECK(purity BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','verified','available','reserved','sold','returned','withdrawn','void')),
 owner_descriptor text NOT NULL,custodian_descriptor text NOT NULL DEFAULT 'Didar single logical stock',
 actor_id text NOT NULL REFERENCES didar_user(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS didar_item_stock ON didar_inventory_item(offer_id,status,id);
CREATE TABLE IF NOT EXISTS didar_item_rfid_binding (
 id text PRIMARY KEY,item_id text NOT NULL REFERENCES didar_inventory_item(id),epc text NOT NULL CHECK(epc ~ '^[0-9A-F]{8,128}$' AND length(epc)%2=0),
 raw_value text NOT NULL,active boolean NOT NULL DEFAULT true,actor_id text NOT NULL REFERENCES didar_user(id),reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),ended_at timestamptz);
CREATE UNIQUE INDEX IF NOT EXISTS didar_active_epc ON didar_item_rfid_binding(epc) WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS didar_active_item_tag ON didar_item_rfid_binding(item_id) WHERE active;
CREATE TABLE IF NOT EXISTS didar_item_reservation (
 id text PRIMARY KEY,item_id text NOT NULL REFERENCES didar_inventory_item(id),order_line_id text NOT NULL REFERENCES didar_order_line(id),
 status text NOT NULL CHECK(status IN ('reserved','sold','released','returned')),expires_at timestamptz NOT NULL,
 fulfillment_status text NOT NULL DEFAULT 'allocated',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS didar_item_assigned_once ON didar_item_reservation(item_id) WHERE status IN ('reserved','sold');
CREATE TABLE IF NOT EXISTS didar_item_return (
 id text PRIMARY KEY,reservation_id text NOT NULL UNIQUE REFERENCES didar_item_reservation(id),reason text NOT NULL,
 status text NOT NULL CHECK(status IN ('requested','received','restocked','rejected')),actor_id text NOT NULL REFERENCES didar_user(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS didar_scan_session (
 id text PRIMARY KEY,supplier_id text REFERENCES didar_supplier(id),actor_id text NOT NULL REFERENCES didar_user(id),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),created_at timestamptz NOT NULL DEFAULT now(),closed_at timestamptz);
CREATE TABLE IF NOT EXISTS didar_scan_expected (
 session_id text REFERENCES didar_scan_session(id),item_id text REFERENCES didar_inventory_item(id),uid text NOT NULL,epc text,weight_mg int NOT NULL,
 PRIMARY KEY(session_id,item_id));
CREATE TABLE IF NOT EXISTS didar_scan_observation (
 id text PRIMARY KEY,session_id text NOT NULL REFERENCES didar_scan_session(id),token text NOT NULL,raw_value text NOT NULL,
 item_id text REFERENCES didar_inventory_item(id),classification text NOT NULL,read_count int NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),UNIQUE(session_id,token));
CREATE OR REPLACE FUNCTION didar_phase1_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l record; b record; o record; delta int;
BEGIN
 IF TG_TABLE_NAME='didar_pricing_policy' OR TG_TABLE_NAME='didar_intake_policy' THEN
   RAISE EXCEPTION 'CONFLICT_IMMUTABLE_POLICY' USING ERRCODE='23514';
 ELSIF TG_TABLE_NAME='didar_intake_batch' THEN
   IF OLD.status<>'draft' AND NEW.verification IS DISTINCT FROM OLD.verification THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_VERIFICATION' USING ERRCODE='23514'; END IF;
   IF NEW.status<>OLD.status AND NOT ((OLD.status='draft' AND NEW.status='verified') OR (OLD.status='verified' AND NEW.status='posted')) THEN RAISE EXCEPTION 'CONFLICT_BATCH_STATE' USING ERRCODE='23514'; END IF;
   IF OLD.status<>'draft' AND (NEW.supplier_id,NEW.invoice_number,NEW.reference_purity,NEW.notes,NEW.tahesab_reference,NEW.received_at) IS DISTINCT FROM
      (OLD.supplier_id,OLD.invoice_number,OLD.reference_purity,OLD.notes,OLD.tahesab_reference,OLD.received_at) THEN
      RAISE EXCEPTION 'CONFLICT_VERIFIED_BATCH' USING ERRCODE='23514'; END IF;
   RETURN NEW;
 ELSIF TG_TABLE_NAME='didar_intake_line' THEN
   SELECT * INTO b FROM didar_intake_batch WHERE id=COALESCE(NEW.batch_id,OLD.batch_id) FOR SHARE;
   IF b.status<>'draft' THEN RAISE EXCEPTION 'CONFLICT_VERIFIED_BATCH' USING ERRCODE='23514'; END IF;
   IF TG_OP='UPDATE' AND NEW.batch_id<>OLD.batch_id THEN RAISE EXCEPTION 'CONFLICT_SOURCE' USING ERRCODE='23514'; END IF;
   IF TG_OP='UPDATE' AND (NEW.product_id,NEW.purity) IS DISTINCT FROM (OLD.product_id,OLD.purity)
      AND EXISTS(SELECT 1 FROM didar_inventory_item WHERE line_id=OLD.id AND status<>'void') THEN
      RAISE EXCEPTION 'CONFLICT_ITEM_SOURCE' USING ERRCODE='23514'; END IF;
   RETURN NEW;
 ELSIF TG_TABLE_NAME='didar_inventory_item'  THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CONFLICT_PERMANENT_UID' USING ERRCODE='23514'; END IF;
   SELECT * INTO l FROM didar_intake_line WHERE id=NEW.line_id;
   SELECT * INTO b FROM didar_intake_batch WHERE id=l.batch_id;
   IF TG_OP='INSERT' AND (b.status<>'draft' OR NEW.status<>'draft' OR NEW.offer_id IS NOT NULL) THEN RAISE EXCEPTION 'INVALID_INITIAL_ITEM' USING ERRCODE='23514'; END IF;
   IF TG_OP='UPDATE' AND (NEW.uid<>OLD.uid OR NEW.line_id<>OLD.line_id OR NEW.supplier_id<>OLD.supplier_id OR (OLD.offer_id IS NOT NULL AND NEW.offer_id IS DISTINCT FROM OLD.offer_id) OR
      (b.status<>'draft' AND (NEW.weight_mg,NEW.purity,NEW.product_id) IS DISTINCT FROM (OLD.weight_mg,OLD.purity,OLD.product_id))) THEN
      RAISE EXCEPTION 'CONFLICT_PERMANENT_SOURCE' USING ERRCODE='23514'; END IF;
   IF NEW.supplier_id<>b.supplier_id OR NEW.purity<>l.purity OR NEW.product_id IS DISTINCT FROM l.product_id THEN
      RAISE EXCEPTION 'INVALID_ITEM_SOURCE' USING ERRCODE='23514'; END IF;
   IF TG_OP='UPDATE' AND NEW.status<>OLD.status AND NOT (
     (OLD.status='draft' AND NEW.status IN ('verified','void')) OR (OLD.status='verified' AND NEW.status='available') OR
     (OLD.status='available' AND NEW.status IN ('reserved','withdrawn')) OR (OLD.status='reserved' AND NEW.status IN ('sold','available')) OR
     (OLD.status='sold' AND NEW.status='returned') OR (OLD.status='returned' AND NEW.status='available') OR (OLD.status='withdrawn' AND NEW.status='available')) THEN
     RAISE EXCEPTION 'CONFLICT_ITEM_STATE' USING ERRCODE='23514'; END IF;
   IF NEW.status IN ('available','reserved','sold','returned','withdrawn') AND b.status NOT IN ('verified','posted') THEN RAISE EXCEPTION 'CONFLICT_UNVERIFIED_STOCK' USING ERRCODE='23514'; END IF;
   IF NEW.status IN ('available','reserved','sold','returned','withdrawn') AND NEW.offer_id IS NULL THEN RAISE EXCEPTION 'INVALID_ITEM_OFFER' USING ERRCODE='23514'; END IF;
   IF NEW.offer_id IS NOT NULL THEN
     SELECT * INTO o FROM didar_offer WHERE id=NEW.offer_id;
     IF o.stock_mode<>'itemized' OR (o.supplier_id,o.product_id,o.weight_mg) IS DISTINCT FROM (NEW.supplier_id,NEW.product_id,NEW.weight_mg) THEN
       RAISE EXCEPTION 'INVALID_ITEM_OFFER' USING ERRCODE='23514'; END IF;
   END IF;
   NEW.updated_at=now(); RETURN NEW;
 ELSIF TG_TABLE_NAME='didar_offer' THEN
   IF TG_OP='UPDATE' AND NEW.stock_mode<>OLD.stock_mode THEN RAISE EXCEPTION 'CONFLICT_STOCK_MODE' USING ERRCODE='23514'; END IF;
   IF NEW.stock_mode='itemized' AND ((TG_OP='INSERT' AND NEW.quantity<>0) OR
      (TG_OP='UPDATE' AND NEW.quantity<>OLD.quantity AND pg_trigger_depth()<2)) THEN
      RAISE EXCEPTION 'CONFLICT_DERIVED_STOCK' USING ERRCODE='23514'; END IF;
   RETURN NEW;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION didar_item_cache() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE delta int;
BEGIN
 delta=(CASE WHEN NEW.status='available' THEN 1 ELSE 0 END)-(CASE WHEN TG_OP='UPDATE' AND OLD.status='available' THEN 1 ELSE 0 END);
 IF NEW.offer_id IS NOT NULL AND delta<>0 THEN UPDATE didar_offer SET quantity=quantity+delta,version=version+1 WHERE id=NEW.offer_id; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_policy_immutable ON didar_pricing_policy;
CREATE TRIGGER didar_policy_immutable BEFORE UPDATE OR DELETE ON didar_pricing_policy FOR EACH ROW EXECUTE FUNCTION didar_phase1_guard();
DROP TRIGGER IF EXISTS didar_tolerance_immutable ON didar_intake_policy;
CREATE TRIGGER didar_tolerance_immutable BEFORE UPDATE OR DELETE ON didar_intake_policy FOR EACH ROW EXECUTE FUNCTION didar_phase1_guard();
DROP TRIGGER IF EXISTS didar_batch_guard ON didar_intake_batch;
CREATE TRIGGER didar_batch_guard BEFORE UPDATE ON didar_intake_batch FOR EACH ROW EXECUTE FUNCTION didar_phase1_guard();
DROP TRIGGER IF EXISTS didar_line_guard ON didar_intake_line;
CREATE TRIGGER didar_line_guard BEFORE INSERT OR UPDATE ON didar_intake_line FOR EACH ROW EXECUTE FUNCTION didar_phase1_guard();
DROP TRIGGER IF EXISTS didar_item_guard ON didar_inventory_item;
CREATE TRIGGER didar_item_guard BEFORE INSERT OR UPDATE OR DELETE ON didar_inventory_item FOR EACH ROW EXECUTE FUNCTION didar_phase1_guard();
DROP TRIGGER IF EXISTS didar_stock_cache ON didar_inventory_item;
CREATE TRIGGER didar_stock_cache AFTER INSERT OR UPDATE ON didar_inventory_item FOR EACH ROW EXECUTE FUNCTION didar_item_cache();
DROP TRIGGER IF EXISTS didar_offer_guard ON didar_offer;
CREATE TRIGGER didar_offer_guard BEFORE INSERT OR UPDATE ON didar_offer FOR EACH ROW EXECUTE FUNCTION didar_phase1_guard();
COMMIT;
