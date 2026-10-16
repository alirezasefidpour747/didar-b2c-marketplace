BEGIN;
SELECT pg_advisory_xact_lock(hashtext('didar:finance-schema'));
CREATE TABLE IF NOT EXISTS didar_fin_account_mapping (
 id text PRIMARY KEY,supplier_id text NOT NULL REFERENCES didar_supplier(id),version integer NOT NULL,
 merchant_code text NOT NULL,gold_code text NOT NULL,rial_code text NOT NULL,invoice_reference text NOT NULL,
 db_alias text NOT NULL CHECK(db_alias LIKE 'QA_%'),reason text NOT NULL,actor_id text REFERENCES didar_user(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(supplier_id,version));
CREATE TABLE IF NOT EXISTS didar_fin_close (
 id text PRIMARY KEY,intent text NOT NULL UNIQUE,supplier_id text NOT NULL REFERENCES didar_supplier(id),mapping_id text NOT NULL REFERENCES didar_fin_account_mapping(id),
 start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,CHECK(start_at<end_at),factor_code text NOT NULL UNIQUE CHECK(length(factor_code)>=20),
 payload jsonb NOT NULL,payload_hash text NOT NULL,actor_id text REFERENCES didar_user(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS didar_fin_close_source (
 close_id text NOT NULL REFERENCES didar_fin_close(id),event_id text NOT NULL REFERENCES didar_fin_event(id),supplier_id text NOT NULL REFERENCES didar_supplier(id),PRIMARY KEY(event_id,supplier_id));
CREATE TABLE IF NOT EXISTS didar_fin_delivery_attempt (
 id bigserial PRIMARY KEY,close_id text NOT NULL REFERENCES didar_fin_close(id),state text NOT NULL CHECK(state IN ('pending','acknowledged','rejected','transient_error','missing','changed')),
 document_number text,payload_hash text,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
-- Deliberately mutable LOCAL MOCK database. Never the authoritative subledger.
CREATE TABLE IF NOT EXISTS didar_fin_mock_document (
 factor_code text PRIMARY KEY,document_number text NOT NULL UNIQUE,payload_hash text NOT NULL,payload jsonb NOT NULL,deleted boolean NOT NULL DEFAULT false);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['didar_fin_account_mapping','didar_fin_close','didar_fin_close_source','didar_fin_delivery_attempt'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=t||'_immutable' AND tgrelid=t::regclass) THEN EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION didar_fin_immutable()',t||'_immutable',t); END IF;END LOOP;END $$;
COMMIT;
