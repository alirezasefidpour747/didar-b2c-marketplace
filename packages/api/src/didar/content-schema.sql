-- Phase 4: scoped content, immutable layout versions and publication intervals.
CREATE TABLE IF NOT EXISTS didar_content_operator(user_id text PRIMARY KEY REFERENCES didar_user(id),active boolean NOT NULL DEFAULT true,granted_by text NOT NULL REFERENCES didar_user(id));
DO $$ BEGIN
 ALTER TABLE didar_merchant_member DROP CONSTRAINT IF EXISTS didar_merchant_member_permission_check;
 ALTER TABLE didar_merchant_member ADD CONSTRAINT didar_merchant_member_permission_check CHECK(permission IN ('STOREFRONT','SHARE','ONBOARDING','CONTENT_EDIT','CONTENT_PUBLISH'));
END $$;
CREATE TABLE IF NOT EXISTS didar_content_page(
 id text PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('DIDAR_HOME','MERCHANT_HOME','CATEGORY_LANDING','COLLECTION_LANDING','MERCHANT_CURATED','DIDAR_CAMPAIGN','MERCHANT_CAMPAIGN')),
 supplier_id text REFERENCES didar_supplier(id),route_key text NOT NULL DEFAULT '',locale text NOT NULL DEFAULT 'fa' CHECK(locale='fa'),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),revision integer NOT NULL DEFAULT 1,created_by text NOT NULL REFERENCES didar_user(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind IN ('DIDAR_HOME','DIDAR_CAMPAIGN') AND supplier_id IS NULL) OR (kind IN ('MERCHANT_HOME','MERCHANT_CURATED','MERCHANT_CAMPAIGN') AND supplier_id IS NOT NULL) OR kind IN ('CATEGORY_LANDING','COLLECTION_LANDING'))
);
CREATE UNIQUE INDEX IF NOT EXISTS didar_content_page_route_idx ON didar_content_page(kind,coalesce(supplier_id,''),route_key,locale);
CREATE TABLE IF NOT EXISTS didar_content_version(
 id text PRIMARY KEY,page_id text NOT NULL REFERENCES didar_content_page(id),number integer NOT NULL CHECK(number>0),title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),blocks jsonb NOT NULL CHECK(jsonb_typeof(blocks)='array' AND jsonb_array_length(blocks)<=24),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected')),created_by text NOT NULL REFERENCES didar_user(id),reviewed_by text REFERENCES didar_user(id),review_reason text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,UNIQUE(page_id,number)
);
CREATE INDEX IF NOT EXISTS didar_content_version_page_idx ON didar_content_version(page_id,number DESC);
CREATE TABLE IF NOT EXISTS didar_content_publication(
 id text PRIMARY KEY,page_id text NOT NULL REFERENCES didar_content_page(id),version_id text NOT NULL REFERENCES didar_content_version(id),effective_from timestamptz NOT NULL,effective_to timestamptz,
 cancelled boolean NOT NULL DEFAULT false,created_by text NOT NULL REFERENCES didar_user(id),reason text NOT NULL CHECK(length(reason)>0),intent_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(effective_to IS NULL OR effective_to>=effective_from),UNIQUE(page_id,intent_key)
);
CREATE INDEX IF NOT EXISTS didar_content_publication_live_idx ON didar_content_publication(page_id,effective_from,effective_to) WHERE NOT cancelled;
CREATE TABLE IF NOT EXISTS didar_content_preset(code text PRIMARY KEY,name text NOT NULL,blocks jsonb NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected')),active boolean NOT NULL DEFAULT true,created_by text REFERENCES didar_user(id),reviewed_by text REFERENCES didar_user(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS didar_content_event(id bigserial PRIMARY KEY,actor_id text NOT NULL REFERENCES didar_user(id),page_id text REFERENCES didar_content_page(id),action text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS didar_content_event_page_idx ON didar_content_event(page_id,id DESC);
ALTER TABLE didar_media_asset ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'PRODUCT' CHECK(purpose IN ('PRODUCT','EDITORIAL'));
ALTER TABLE didar_media_asset ALTER COLUMN supplier_id DROP NOT NULL;
DO $$ DECLARE x record; BEGIN
 FOR x IN SELECT conname FROM pg_constraint WHERE conrelid='didar_media_asset'::regclass AND contype='c' AND (pg_get_constraintdef(oid) LIKE '%product_id IS NOT NULL%' OR pg_get_constraintdef(oid) LIKE '%source_mime%' OR pg_get_constraintdef(oid) LIKE '%original_bytes%') LOOP
 EXECUTE format('ALTER TABLE didar_media_asset DROP CONSTRAINT %I',x.conname);
 END LOOP;
 ALTER TABLE didar_media_asset ADD CONSTRAINT didar_media_asset_resource_check CHECK((purpose='PRODUCT' AND supplier_id IS NOT NULL AND (product_id IS NOT NULL OR request_id IS NOT NULL)) OR (purpose='EDITORIAL' AND product_id IS NULL AND request_id IS NULL));
 ALTER TABLE didar_media_asset ADD CONSTRAINT didar_media_asset_mime_check CHECK(source_mime IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm'));
 ALTER TABLE didar_media_asset ADD CONSTRAINT didar_media_asset_input_check CHECK(original_bytes>=16 AND original_bytes<=CASE WHEN source_mime LIKE 'video/%' THEN 20971520 ELSE 8388608 END);
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS didar_editorial_media_intent_idx ON didar_media_asset(coalesce(supplier_id,''),intent_key) WHERE purpose='EDITORIAL' AND intent_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS didar_media_video(asset_id text PRIMARY KEY REFERENCES didar_media_asset(id),data bytea NOT NULL CHECK(octet_length(data)<=20971520),mime_type text NOT NULL DEFAULT 'video/mp4' CHECK(mime_type='video/mp4'),width integer NOT NULL CHECK(width BETWEEN 2 AND 1920),height integer NOT NULL CHECK(height BETWEEN 2 AND 1920),duration_ms integer NOT NULL CHECK(duration_ms BETWEEN 1 AND 45000),validation jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS didar_content_asset(version_id text NOT NULL REFERENCES didar_content_version(id),asset_id text NOT NULL REFERENCES didar_media_asset(id),PRIMARY KEY(version_id,asset_id));
CREATE INDEX IF NOT EXISTS didar_content_asset_asset_idx ON didar_content_asset(asset_id,version_id);
CREATE OR REPLACE FUNCTION didar_content_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_CONTENT';END IF;
 IF TG_TABLE_NAME='didar_content_version' THEN
  IF NEW.id<>OLD.id OR NEW.page_id<>OLD.page_id OR NEW.number<>OLD.number OR NEW.blocks IS DISTINCT FROM OLD.blocks OR NEW.title<>OLD.title OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by OR OLD.status<>'draft' THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_CONTENT';END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.kind<>OLD.kind OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.route_key<>OLD.route_key OR NEW.locale<>OLD.locale OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by THEN RAISE EXCEPTION 'CONFLICT_STABLE_CONTENT_ROUTE';END IF;
 END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_content_page_guard ON didar_content_page;
CREATE TRIGGER didar_content_page_guard BEFORE UPDATE OR DELETE ON didar_content_page FOR EACH ROW EXECUTE FUNCTION didar_content_guard();
DROP TRIGGER IF EXISTS didar_content_version_guard ON didar_content_version;
CREATE TRIGGER didar_content_version_guard BEFORE UPDATE OR DELETE ON didar_content_version FOR EACH ROW EXECUTE FUNCTION didar_content_guard();
DROP TRIGGER IF EXISTS didar_content_event_guard ON didar_content_event;
CREATE TRIGGER didar_content_event_guard BEFORE UPDATE OR DELETE ON didar_content_event FOR EACH ROW EXECUTE FUNCTION didar_onboarding_immutable_event();
DROP TRIGGER IF EXISTS didar_media_video_guard ON didar_media_video;
CREATE TRIGGER didar_media_video_guard BEFORE UPDATE OR DELETE ON didar_media_video FOR EACH ROW EXECUTE FUNCTION didar_onboarding_immutable_event();
CREATE OR REPLACE FUNCTION didar_content_publication_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v record;BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_PUBLICATION';END IF;
 PERFORM 1 FROM didar_content_page WHERE id=NEW.page_id FOR UPDATE;
 SELECT page_id,status INTO v FROM didar_content_version WHERE id=NEW.version_id;
 IF v.page_id IS DISTINCT FROM NEW.page_id OR v.status<>'approved' THEN RAISE EXCEPTION 'INVALID_CONTENT_APPROVAL';END IF;
 IF TG_OP='UPDATE' AND (NEW.page_id<>OLD.page_id OR NEW.version_id<>OLD.version_id OR NEW.effective_from<>OLD.effective_from OR NEW.intent_key<>OLD.intent_key OR NEW.id<>OLD.id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.reason<>OLD.reason OR (OLD.cancelled AND NOT NEW.cancelled) OR (OLD.effective_to IS NOT NULL AND (NEW.effective_to IS NULL OR NEW.effective_to>OLD.effective_to))) THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_PUBLICATION';END IF;
 IF NOT NEW.cancelled AND EXISTS(SELECT 1 FROM didar_content_publication p WHERE p.page_id=NEW.page_id AND p.id<>NEW.id AND NOT p.cancelled AND tstzrange(p.effective_from,p.effective_to,'[)') && tstzrange(NEW.effective_from,NEW.effective_to,'[)')) THEN RAISE EXCEPTION 'CONFLICT_PUBLICATION_OVERLAP';END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_content_publication_guard ON didar_content_publication;
CREATE TRIGGER didar_content_publication_guard BEFORE INSERT OR UPDATE OR DELETE ON didar_content_publication FOR EACH ROW EXECUTE FUNCTION didar_content_publication_guard();
-- Approved assets are still private until an eligible page currently references them.
CREATE OR REPLACE FUNCTION didar_editorial_visible(aid text,sid text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM didar_content_asset ca JOIN didar_content_version v ON v.id=ca.version_id JOIN didar_content_page p ON p.id=v.page_id JOIN didar_content_publication pub ON pub.version_id=v.id AND pub.page_id=p.id JOIN didar_media_asset a ON a.id=ca.asset_id WHERE a.id=aid AND a.purpose='EDITORIAL' AND a.status='approved' AND v.status='approved' AND NOT pub.cancelled AND pub.effective_from<=now() AND (pub.effective_to IS NULL OR pub.effective_to>now()) AND (p.kind IN ('DIDAR_HOME','MERCHANT_HOME','DIDAR_CAMPAIGN','MERCHANT_CAMPAIGN') OR (p.kind='CATEGORY_LANDING' AND EXISTS(SELECT 1 FROM didar_category cat WHERE cat.slug=p.route_key AND cat.active)) OR (p.kind='COLLECTION_LANDING' AND EXISTS(SELECT 1 FROM didar_collection c WHERE c.slug=p.route_key AND c.active AND c.approved AND c.published AND (c.owner_supplier_id IS NULL OR c.owner_supplier_id=p.supplier_id OR (p.supplier_id IS NULL AND didar_global_supplier(c.owner_supplier_id))))) OR (p.kind='MERCHANT_CURATED' AND EXISTS(SELECT 1 FROM didar_share_page sp WHERE sp.slug=p.route_key AND sp.supplier_id=p.supplier_id AND sp.published))) AND ((sid IS NULL AND p.supplier_id IS NULL) OR (sid IS NOT NULL AND p.supplier_id=sid)) AND (a.supplier_id IS NOT DISTINCT FROM p.supplier_id OR (a.supplier_id IS NULL AND a.allow_shared)))
$$;

CREATE INDEX IF NOT EXISTS didar_content_page_owner_idx ON didar_content_page(supplier_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS didar_editorial_owner_idx ON didar_media_asset(supplier_id,created_at DESC) WHERE purpose='EDITORIAL';
CREATE OR REPLACE FUNCTION didar_content_preset_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR NEW.code<>OLD.code OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at<>OLD.created_at OR (OLD.status='approved' AND (NEW.name<>OLD.name OR NEW.blocks IS DISTINCT FROM OLD.blocks OR NEW.status<>OLD.status OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by)) THEN RAISE EXCEPTION 'CONFLICT_IMMUTABLE_PRESET';END IF;RETURN NEW; END $$;
DROP TRIGGER IF EXISTS didar_content_preset_guard ON didar_content_preset;
CREATE TRIGGER didar_content_preset_guard BEFORE UPDATE OR DELETE ON didar_content_preset FOR EACH ROW EXECUTE FUNCTION didar_content_preset_guard();
DROP TRIGGER IF EXISTS didar_content_asset_guard ON didar_content_asset;
CREATE TRIGGER didar_content_asset_guard BEFORE UPDATE OR DELETE ON didar_content_asset FOR EACH ROW EXECUTE FUNCTION didar_onboarding_immutable_event();
