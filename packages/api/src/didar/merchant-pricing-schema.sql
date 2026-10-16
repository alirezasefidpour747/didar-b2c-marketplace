-- Issue #6: additive merchant commercial classification and immutable approved pricing.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('didar:merchant-pricing'));
CREATE TABLE IF NOT EXISTS didar_merchant_type (
 code text PRIMARY KEY CHECK(code ~ '^[A-Z][A-Z0-9_]{1,59}$'),name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 150),
 active boolean NOT NULL DEFAULT true,version int NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO didar_merchant_type(code,name) VALUES('LEGACY_UNCLASSIFIED','قدیمی؛ در انتظار تعیین نوع'),('MANUFACTURER','تولیدکننده'),('RETAILER','خرده‌فروش') ON CONFLICT DO NOTHING;
ALTER TABLE didar_supplier ADD COLUMN IF NOT EXISTS commercial_type text NOT NULL DEFAULT 'LEGACY_UNCLASSIFIED' REFERENCES didar_merchant_type(code);
ALTER TABLE didar_supplier ADD COLUMN IF NOT EXISTS pricing_revision int NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS didar_merchant_tax_policy (
 id text PRIMARY KEY,code text NOT NULL UNIQUE CHECK(code ~ '^[a-z][a-z0-9_]{1,79}$'),name text NOT NULL,active boolean NOT NULL DEFAULT true,revision int NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS didar_merchant_tax_version (
 id text PRIMARY KEY,policy_id text NOT NULL REFERENCES didar_merchant_tax_policy(id),number int NOT NULL,
 bps int NOT NULL CHECK(bps BETWEEN 0 AND 10000),taxable_components text[] NOT NULL CHECK(taxable_components <@ ARRAY['gold','making','distribution','retail','credit']::text[]),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected')),actor_id text NOT NULL REFERENCES didar_user(id),reviewed_by text REFERENCES didar_user(id),reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,UNIQUE(policy_id,number),CHECK(status<>'approved' OR reviewed_by IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS didar_merchant_profile (
 id text PRIMARY KEY,code text NOT NULL UNIQUE CHECK(code ~ '^[a-z][a-z0-9_]{1,79}$'),name text NOT NULL,description text NOT NULL DEFAULT '',
 merchant_types text[] NOT NULL CHECK(cardinality(merchant_types) BETWEEN 1 AND 30 AND NOT ('LEGACY_UNCLASSIFIED'=ANY(merchant_types))),
 active boolean NOT NULL DEFAULT true,revision int NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE didar_merchant_type ADD COLUMN IF NOT EXISTS recommended_profile_id text REFERENCES didar_merchant_profile(id);
CREATE TABLE IF NOT EXISTS didar_merchant_profile_version (
 id text PRIMARY KEY,profile_id text NOT NULL REFERENCES didar_merchant_profile(id),number int NOT NULL,merchant_types text[] NOT NULL,
 tax_version_id text NOT NULL REFERENCES didar_merchant_tax_version(id),rounding_step int NOT NULL CHECK(rounding_step BETWEEN 1 AND 1000000),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected')),actor_id text NOT NULL REFERENCES didar_user(id),reviewed_by text REFERENCES didar_user(id),reason text NOT NULL,
 making_source text NOT NULL DEFAULT 'OFFER' CHECK(making_source='OFFER'),created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,
 UNIQUE(profile_id,number),CHECK(status<>'approved' OR reviewed_by IS NOT NULL)
);
CREATE OR REPLACE FUNCTION didar_merchant_rule_valid(r jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text;v jsonb;
BEGIN
 IF r IS NULL OR NOT (r ?& ARRAY['mode','basis','value']) THEN RETURN false; END IF;
 IF NOT coalesce(jsonb_typeof(r)='object' AND r->>'mode'=ANY(ARRAY['PERCENT','FIXED_IRR']) AND r->>'basis'=ANY(ARRAY['GOLD_BASE_750_IRR','MAKING_IRR','GOLD_PLUS_MAKING_IRR','FIXED_IRR']) AND (r->>'value') ~ '^\d{1,13}$',false) THEN RETURN false; END IF;
 IF r->>'mode'='PERCENT' THEN RETURN r->>'basis'<>'FIXED_IRR' AND (r->>'value')::numeric BETWEEN 0 AND 10000; END IF;
 RETURN r->>'basis'='FIXED_IRR' AND (r->>'value')::numeric BETWEEN 0 AND 1000000000000;
END $$;
CREATE TABLE IF NOT EXISTS didar_merchant_profile_rule (
 version_id text NOT NULL REFERENCES didar_merchant_profile_version(id),code text NOT NULL CHECK(code ~ '^[a-z][a-z0-9_]{1,59}$'),
 component text NOT NULL CHECK(component IN ('distribution','retail','credit')),rule jsonb NOT NULL,PRIMARY KEY(version_id,code),
 CHECK(rule ?& ARRAY['payer','recipient','scope','application_mode']),
 CHECK(rule->>'payer'=ANY(ARRAY['CUSTOMER','MERCHANT','DIDAR'])),CHECK(rule->>'recipient'=ANY(ARRAY['DIDAR','THIRD_PARTY'])),
 CHECK(NOT (rule->>'payer'='DIDAR' AND rule->>'recipient'='DIDAR')),
 CHECK(rule->>'scope'=ANY(ARRAY['ITEM','ORDER'])),CHECK(rule->>'application_mode'=ANY(ARRAY['ALWAYS','CREDIT_ONLY','CASH_ONLY','BY_PAYMENT_METHOD','DISABLED'])),
 CHECK((rule->>'application_mode'='BY_PAYMENT_METHOD' AND didar_merchant_rule_valid(rule->'cash_rule') AND didar_merchant_rule_valid(rule->'credit_rule')) OR (rule->>'application_mode'<>'BY_PAYMENT_METHOD' AND didar_merchant_rule_valid(rule))),
 CHECK(rule->>'scope'<>'ORDER' OR (rule->>'service_key' ~ '^[a-z][a-z0-9_]{1,59}$' AND ((rule->>'application_mode'='BY_PAYMENT_METHOD' AND rule->'cash_rule'->>'mode'='FIXED_IRR' AND rule->'credit_rule'->>'mode'='FIXED_IRR') OR (rule->>'application_mode'<>'BY_PAYMENT_METHOD' AND rule->>'mode'='FIXED_IRR'))))
);
ALTER TABLE didar_merchant_profile_rule DROP CONSTRAINT IF EXISTS didar_profile_rule_complete;
ALTER TABLE didar_merchant_profile_rule ADD CONSTRAINT didar_profile_rule_complete CHECK(coalesce(
 rule->>'payer'=ANY(ARRAY['CUSTOMER','MERCHANT','DIDAR']) AND rule->>'recipient'=ANY(ARRAY['DIDAR','THIRD_PARTY'])
 AND rule->>'scope'=ANY(ARRAY['ITEM','ORDER']) AND rule->>'application_mode'=ANY(ARRAY['ALWAYS','CREDIT_ONLY','CASH_ONLY','BY_PAYMENT_METHOD','DISABLED'])
 AND (rule->>'scope'<>'ORDER' OR (rule ? 'service_key' AND jsonb_typeof(rule->'service_key')='string')),
 false));
CREATE TABLE IF NOT EXISTS didar_merchant_assignment (
 id text PRIMARY KEY,supplier_id text NOT NULL REFERENCES didar_supplier(id),profile_version_id text NOT NULL REFERENCES didar_merchant_profile_version(id),
 effective_from timestamptz NOT NULL,effective_to timestamptz,cancelled boolean NOT NULL DEFAULT false,
 actor_id text NOT NULL REFERENCES didar_user(id),reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(effective_to IS NULL OR effective_to>effective_from)
);
CREATE INDEX IF NOT EXISTS didar_merchant_assignment_effective ON didar_merchant_assignment(supplier_id,effective_from,effective_to) WHERE NOT cancelled;
CREATE TABLE IF NOT EXISTS didar_merchant_pricing_event (
 id bigserial PRIMARY KEY,actor_id text NOT NULL REFERENCES didar_user(id),action text NOT NULL,entity_id text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION didar_merchant_pricing_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v record;t record;who text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('didar:merchant-pricing'));
 IF TG_OP='DELETE' OR TG_TABLE_NAME='didar_merchant_pricing_event' THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_PRICING_HISTORY'; END IF;
 IF TG_TABLE_NAME='didar_merchant_profile_rule' THEN
  IF TG_OP='UPDATE' AND (NEW.version_id<>OLD.version_id OR NEW.code<>OLD.code OR NEW.component<>OLD.component) THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_PRICING_VERSION'; END IF;
  SELECT status INTO who FROM didar_merchant_profile_version WHERE id=NEW.version_id;
  IF who<>'draft' THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_PRICING_VERSION'; END IF;
 ELSIF TG_TABLE_NAME IN ('didar_merchant_tax_version','didar_merchant_profile_version') THEN
  IF TG_OP='UPDATE' AND OLD.status<>'draft' THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_PRICING_VERSION'; END IF;
  IF NEW.status='approved' THEN
   IF NOT EXISTS(SELECT 1 FROM didar_user WHERE id=NEW.reviewed_by AND role='admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   IF TG_TABLE_NAME='didar_merchant_profile_version' THEN
    IF cardinality(NEW.merchant_types)<1 OR EXISTS(SELECT 1 FROM unnest(NEW.merchant_types) x WHERE NOT EXISTS(SELECT 1 FROM didar_merchant_type WHERE code=x AND active AND code<>'LEGACY_UNCLASSIFIED')) THEN RAISE EXCEPTION 'INVALID_MERCHANT_TYPE'; END IF;
    IF NOT EXISTS(SELECT 1 FROM didar_merchant_tax_version tv JOIN didar_merchant_tax_policy tp ON tp.id=tv.policy_id WHERE tv.id=NEW.tax_version_id AND tv.status='approved' AND tp.active) THEN RAISE EXCEPTION 'INVALID_APPROVED_TAX_POLICY'; END IF;
    IF (SELECT count(*) FROM didar_merchant_profile_rule WHERE version_id=NEW.id AND code IN ('distribution','retail','credit') AND component=code AND rule->>'scope'='ITEM')<>3 THEN RAISE EXCEPTION 'INVALID_PROFILE_COMPONENTS'; END IF;
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME='didar_merchant_assignment' THEN
  IF NOT EXISTS(SELECT 1 FROM didar_user WHERE id=NEW.actor_id AND role='admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.supplier_id<>OLD.supplier_id OR NEW.profile_version_id<>OLD.profile_version_id OR NEW.effective_from<>OLD.effective_from OR NEW.actor_id<>OLD.actor_id OR NEW.reason<>OLD.reason OR NEW.created_at<>OLD.created_at OR (OLD.cancelled AND NOT NEW.cancelled) OR (NEW.cancelled AND NOT OLD.cancelled AND OLD.effective_from<=clock_timestamp()) OR NEW.effective_to<clock_timestamp()-interval '5 seconds' OR (OLD.effective_to IS NOT NULL AND (NEW.effective_to IS NULL OR NEW.effective_to>OLD.effective_to))) THEN RAISE EXCEPTION 'CONFLICT_PRICING_ASSIGNMENT_HISTORY'; END IF;
  IF NEW.cancelled OR TG_OP='UPDATE' THEN RETURN NEW; END IF;
  SELECT pv.*,p.active INTO v FROM didar_merchant_profile_version pv JOIN didar_merchant_profile p ON p.id=pv.profile_id WHERE pv.id=NEW.profile_version_id;
  SELECT commercial_type INTO who FROM didar_supplier WHERE id=NEW.supplier_id;
  IF v.status IS DISTINCT FROM 'approved' OR NOT v.active OR NOT (who=ANY(v.merchant_types)) OR NOT EXISTS(SELECT 1 FROM didar_merchant_type WHERE code=who AND active) THEN RAISE EXCEPTION 'INVALID_MERCHANT_PROFILE'; END IF;
  IF EXISTS(SELECT 1 FROM didar_merchant_assignment a WHERE a.supplier_id=NEW.supplier_id AND NOT a.cancelled AND a.id<>NEW.id AND tstzrange(a.effective_from,a.effective_to,'[)') && tstzrange(NEW.effective_from,NEW.effective_to,'[)')) THEN RAISE EXCEPTION 'CONFLICT_PROFILE_OVERLAP'; END IF;
 ELSIF TG_TABLE_NAME='didar_merchant_profile' THEN
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.code<>OLD.code) THEN RAISE EXCEPTION 'INVALID_PRICING_IDENTITY'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(NEW.merchant_types) x WHERE NOT EXISTS(SELECT 1 FROM didar_merchant_type WHERE code=x AND active)) THEN RAISE EXCEPTION 'INVALID_MERCHANT_TYPE'; END IF;
 ELSIF TG_TABLE_NAME='didar_merchant_tax_policy' THEN
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.code<>OLD.code) THEN RAISE EXCEPTION 'INVALID_PRICING_IDENTITY'; END IF;
 ELSIF TG_TABLE_NAME='didar_merchant_type' THEN
  IF TG_OP='UPDATE' AND (NEW.code<>OLD.code OR (OLD.code='LEGACY_UNCLASSIFIED' AND NOT NEW.active)) THEN RAISE EXCEPTION 'INVALID_PRICING_IDENTITY'; END IF;
  IF NEW.recommended_profile_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM didar_merchant_profile WHERE id=NEW.recommended_profile_id AND NEW.code=ANY(merchant_types)) THEN RAISE EXCEPTION 'INVALID_MERCHANT_PROFILE'; END IF;
 ELSIF TG_TABLE_NAME='didar_supplier' THEN
  IF NEW.commercial_type<>OLD.commercial_type AND EXISTS(SELECT 1 FROM didar_merchant_assignment a JOIN didar_merchant_profile_version pv ON pv.id=a.profile_version_id WHERE a.supplier_id=NEW.id AND NOT a.cancelled AND (a.effective_to IS NULL OR a.effective_to>clock_timestamp()) AND NOT (NEW.commercial_type=ANY(pv.merchant_types))) THEN RAISE EXCEPTION 'CONFLICT_MERCHANT_TYPE_ASSIGNMENT'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['didar_merchant_type','didar_merchant_profile','didar_merchant_tax_policy','didar_merchant_tax_version','didar_merchant_profile_version','didar_merchant_profile_rule','didar_merchant_assignment'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS didar_merchant_pricing_guard ON %I',tab);
 EXECUTE format('CREATE TRIGGER didar_merchant_pricing_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION didar_merchant_pricing_guard()',tab);
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS didar_merchant_pricing_history ON didar_merchant_pricing_event;
CREATE TRIGGER didar_merchant_pricing_history BEFORE UPDATE OR DELETE ON didar_merchant_pricing_event FOR EACH ROW EXECUTE FUNCTION didar_merchant_pricing_guard();
DROP TRIGGER IF EXISTS didar_supplier_pricing_type ON didar_supplier;
CREATE TRIGGER didar_supplier_pricing_type BEFORE UPDATE OF commercial_type ON didar_supplier FOR EACH ROW EXECUTE FUNCTION didar_merchant_pricing_guard();
ALTER TABLE didar_order ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'CASH' CHECK(payment_method IN ('CASH','CREDIT'));
ALTER TABLE didar_order ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION didar_order_pricing_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='didar_order' THEN
  IF NEW.total_irr IS DISTINCT FROM OLD.total_irr OR NEW.rate_snapshot IS DISTINCT FROM OLD.rate_snapshot OR NEW.pricing_snapshot IS DISTINCT FROM OLD.pricing_snapshot OR NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_ORDER_PRICING'; END IF;
 ELSE
  IF TG_OP='DELETE' THEN IF OLD.breakdown ? 'merchant_profile' THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_ORDER_PRICING'; ELSE RETURN OLD; END IF; END IF;
  IF NEW.breakdown IS DISTINCT FROM OLD.breakdown OR NEW.offer_id<>OLD.offer_id OR NEW.supplier_id<>OLD.supplier_id OR NEW.weight_mg<>OLD.weight_mg OR NEW.quantity<>OLD.quantity OR NEW.order_id<>OLD.order_id THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_ORDER_PRICING'; END IF;
 END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_order_pricing ON didar_order;
CREATE TRIGGER didar_order_pricing BEFORE UPDATE ON didar_order FOR EACH ROW EXECUTE FUNCTION didar_order_pricing_guard();
DROP TRIGGER IF EXISTS didar_order_line_pricing ON didar_order_line;
CREATE TRIGGER didar_order_line_pricing BEFORE UPDATE OR DELETE ON didar_order_line FOR EACH ROW EXECUTE FUNCTION didar_order_pricing_guard();
-- No defaults, commercial profile assignments, price changes, or historical projections are seeded.
COMMIT;
