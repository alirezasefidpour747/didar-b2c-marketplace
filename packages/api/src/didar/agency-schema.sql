-- CORE-03: additive opt-in sale roles; no historical role or financial backfill.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('didar:agency-schema'));
CREATE UNIQUE INDEX IF NOT EXISTS didar_fin_contract_id_supplier ON didar_fin_contract(id,supplier_id);
CREATE TABLE IF NOT EXISTS didar_sale_mandate (
 id text PRIMARY KEY, supplier_id text NOT NULL REFERENCES didar_supplier(id),
 version integer NOT NULL CHECK(version>0), mode text NOT NULL CHECK(mode IN ('AGENCY','DIRECT_DIDAR')),
 contract_id text NOT NULL REFERENCES didar_fin_contract(id),
 effective_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>effective_at),
 allocation_rule text NOT NULL CHECK(allocation_rule='COMPONENTS_V1'),
 rounding_limit_irr integer NOT NULL CHECK(rounding_limit_irr BETWEEN 0 AND 10000),
 beneficiaries jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(beneficiaries)='object'),
 reason text NOT NULL, actor_id text NOT NULL REFERENCES didar_user(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(supplier_id,version), FOREIGN KEY(contract_id,supplier_id) REFERENCES didar_fin_contract(id,supplier_id));
CREATE TABLE IF NOT EXISTS didar_sale_mandate_review (
 mandate_id text PRIMARY KEY REFERENCES didar_sale_mandate(id), approved boolean NOT NULL,
 actor_id text NOT NULL REFERENCES didar_user(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS didar_sale_mandate_revocation (
 mandate_id text PRIMARY KEY REFERENCES didar_sale_mandate(id), actor_id text NOT NULL REFERENCES didar_user(id),
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS didar_sale_role (
 line_id text PRIMARY KEY REFERENCES didar_fin_sale_terms(line_id), mandate_id text NOT NULL REFERENCES didar_sale_mandate(id),
 snapshot jsonb NOT NULL CHECK(snapshot->>'schema_version'='1'), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS didar_sale_role_mandate ON didar_sale_role(mandate_id);
CREATE SEQUENCE IF NOT EXISTS didar_sale_document_number;
CREATE TABLE IF NOT EXISTS didar_sale_document (
 id text PRIMARY KEY, number bigint NOT NULL DEFAULT nextval('didar_sale_document_number') UNIQUE,
 kind text NOT NULL CHECK(kind IN ('INVOICE','CREDIT')), order_id text NOT NULL REFERENCES didar_order(id),
 principal_id text NOT NULL, mode text NOT NULL CHECK(mode IN ('AGENCY','DIRECT_DIDAR')),
 original_document_id text REFERENCES didar_sale_document(id), source_event_id text UNIQUE REFERENCES didar_fin_event(id),
 snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='INVOICE' AND original_document_id IS NULL AND source_event_id IS NULL) OR
       (kind='CREDIT' AND original_document_id IS NOT NULL AND source_event_id IS NOT NULL)));
CREATE UNIQUE INDEX IF NOT EXISTS didar_sale_document_invoice ON didar_sale_document(order_id,principal_id) WHERE kind='INVOICE';
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['didar_sale_mandate','didar_sale_mandate_review','didar_sale_mandate_revocation','didar_sale_role','didar_sale_document'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=t||'_immutable' AND tgrelid=t::regclass) THEN
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION didar_fin_immutable()',t||'_immutable',t);
 END IF; END LOOP;
END $$;
COMMIT;
