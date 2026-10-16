BEGIN;
SELECT pg_advisory_xact_lock(hashtext('didar:finance-schema'));
CREATE TABLE IF NOT EXISTS didar_fin_request (
 id text PRIMARY KEY, sale_event_id text NOT NULL UNIQUE REFERENCES didar_fin_event(id),supplier_id text NOT NULL REFERENCES didar_supplier(id),
 gold_ug bigint NOT NULL CHECK(gold_ug>0), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS didar_fin_command (
 key text PRIMARY KEY,event_id text NOT NULL REFERENCES didar_fin_event(id),payload jsonb NOT NULL);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['didar_fin_request','didar_fin_command'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=t||'_immutable' AND tgrelid=t::regclass) THEN
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION didar_fin_immutable()',t||'_immutable',t);
 END IF; END LOOP;END $$;
INSERT INTO didar_fin_request(id,sale_event_id,supplier_id,gold_ug)
 SELECT id,id,supplier_id,gold_ug FROM didar_fin_event WHERE kind='SALE_EXPOSURE' AND gold_ug>0 ON CONFLICT DO NOTHING;
COMMIT;
