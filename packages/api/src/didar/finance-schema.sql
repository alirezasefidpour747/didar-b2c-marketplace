-- Gate 1. Additive financial domain; never backfill/reprice historic orders.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('didar:finance-schema'));
CREATE TABLE IF NOT EXISTS didar_fin_contract (
 id text PRIMARY KEY, supplier_id text NOT NULL REFERENCES didar_supplier(id),
 version integer NOT NULL CHECK(version>0), mode text NOT NULL CHECK(mode IN ('GOLD_ONLY','RIAL_ONLY','MIXED')),
 gold_bps integer NOT NULL CHECK(gold_bps BETWEEN 0 AND 10000),
 ownership text NOT NULL CHECK(ownership IN ('CONSIGNMENT','BUY_TO_RESELL','DIDAR_OWNED')),
 effective_at timestamptz NOT NULL, due_days integer NOT NULL CHECK(due_days BETWEEN 0 AND 3650),
 reason text NOT NULL, actor_id text NOT NULL REFERENCES didar_user(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(supplier_id,version), CHECK((mode='GOLD_ONLY' AND gold_bps=10000) OR (mode='RIAL_ONLY' AND gold_bps=0) OR (mode='MIXED' AND gold_bps BETWEEN 1 AND 9999)));
CREATE TABLE IF NOT EXISTS didar_fin_contract_review (
 contract_id text PRIMARY KEY REFERENCES didar_fin_contract(id), approved boolean NOT NULL,
 actor_id text NOT NULL REFERENCES didar_user(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS didar_fin_event (
 id text PRIMARY KEY, intent text NOT NULL UNIQUE, kind text NOT NULL,
 supplier_id text REFERENCES didar_supplier(id), customer_id text REFERENCES didar_user(id),
 order_line_id text REFERENCES didar_order_line(id), reservation_id text REFERENCES didar_item_reservation(id),
 source_event_id text REFERENCES didar_fin_event(id), gold_ug bigint NOT NULL DEFAULT 0, irr bigint NOT NULL DEFAULT 0,
 snapshot jsonb NOT NULL, actor_id text REFERENCES didar_user(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS didar_fin_event_supplier ON didar_fin_event(supplier_id,created_at,id);
CREATE TABLE IF NOT EXISTS didar_fin_sale_terms (
 line_id text PRIMARY KEY REFERENCES didar_order_line(id), snapshot jsonb NOT NULL);
CREATE OR REPLACE FUNCTION didar_fin_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_FINANCE' USING ERRCODE='23514'; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['didar_fin_contract','didar_fin_contract_review','didar_fin_event','didar_fin_sale_terms'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=t||'_immutable' AND tgrelid=t::regclass) THEN
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION didar_fin_immutable()',t||'_immutable',t);
 END IF; END LOOP;
END $$;
COMMIT;
