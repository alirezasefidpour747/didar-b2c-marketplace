BEGIN;
SELECT pg_advisory_xact_lock(hashtext('didar:finance-schema'));
CREATE TABLE IF NOT EXISTS didar_fin_journal (
 id text PRIMARY KEY,event_id text NOT NULL UNIQUE REFERENCES didar_fin_event(id),
 projection_version integer NOT NULL DEFAULT 1, basis text NOT NULL DEFAULT 'SANDBOX_PROVISIONAL',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS didar_fin_posting (
 id bigserial PRIMARY KEY,journal_id text NOT NULL REFERENCES didar_fin_journal(id),account text NOT NULL,
 party text NOT NULL DEFAULT 'DIDAR',instrument text NOT NULL CHECK(instrument IN ('IRR','GOLD_UG','MEMO_GOLD_UG')),
 delta bigint NOT NULL CHECK(delta<>0));
CREATE INDEX IF NOT EXISTS didar_fin_posting_journal ON didar_fin_posting(journal_id);
CREATE INDEX IF NOT EXISTS didar_fin_posting_account ON didar_fin_posting(party,account,instrument);
CREATE OR REPLACE FUNCTION didar_fin_posting_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM pg_advisory_xact_lock(hashtext('didar:financial-core')); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS didar_fin_posting_lock ON didar_fin_posting;
CREATE TRIGGER didar_fin_posting_lock BEFORE INSERT ON didar_fin_posting FOR EACH ROW EXECUTE FUNCTION didar_fin_posting_lock();
CREATE OR REPLACE FUNCTION didar_fin_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE jid text;
BEGIN
 IF TG_TABLE_NAME='didar_fin_journal' THEN jid=NEW.id; ELSE jid=NEW.journal_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM didar_fin_posting WHERE journal_id=jid) OR EXISTS(
 SELECT instrument FROM didar_fin_posting WHERE journal_id=jid GROUP BY instrument HAVING sum(delta)<>0 OR count(*)<2)
 THEN RAISE EXCEPTION 'CONFLICT_UNBALANCED_JOURNAL' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT account,party,instrument FROM didar_fin_posting WHERE account LIKE 'WALLET\_%' ESCAPE '\'
 GROUP BY account,party,instrument HAVING sum(delta)>0) THEN
 RAISE EXCEPTION 'CONFLICT_WALLET_OVERDRAFT' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['didar_fin_journal','didar_fin_posting'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=t||'_immutable' AND tgrelid=t::regclass) THEN
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION didar_fin_immutable()',t||'_immutable',t);
 END IF; END LOOP;END $$;
DROP TRIGGER IF EXISTS didar_fin_journal_balance ON didar_fin_journal;
CREATE CONSTRAINT TRIGGER didar_fin_journal_balance AFTER INSERT ON didar_fin_journal DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION didar_fin_balanced();
DROP TRIGGER IF EXISTS didar_fin_posting_balance ON didar_fin_posting;
CREATE CONSTRAINT TRIGGER didar_fin_posting_balance AFTER INSERT ON didar_fin_posting DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION didar_fin_balanced();
COMMIT;
