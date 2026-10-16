BEGIN;
SELECT pg_advisory_xact_lock(hashtext('didar:finance-schema'));
CREATE TABLE IF NOT EXISTS didar_fin_uat_checkpoint (
 id text PRIMARY KEY,actor_id text NOT NULL REFERENCES didar_user(id),reviewed_revision text NOT NULL CHECK(reviewed_revision ~ '^[a-f0-9]{40}$'),
 report jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='didar_fin_uat_checkpoint_immutable' AND tgrelid='didar_fin_uat_checkpoint'::regclass) THEN
 CREATE TRIGGER didar_fin_uat_checkpoint_immutable BEFORE UPDATE OR DELETE ON didar_fin_uat_checkpoint FOR EACH ROW EXECUTE FUNCTION didar_fin_immutable();
 END IF;
END $$;
COMMIT;
