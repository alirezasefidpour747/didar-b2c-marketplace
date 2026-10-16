-- Shared Issue #4/#5 taxonomy. Additive; preserve all existing IDs, publications and history.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('didar:category-tree'));
DROP TRIGGER IF EXISTS didar_product_taxonomy ON didar_product;
DROP TRIGGER IF EXISTS didar_category_taxonomy ON didar_category;
ALTER TABLE didar_product ADD COLUMN IF NOT EXISTS slug text NOT NULL DEFAULT 'product';
ALTER TABLE didar_product ADD COLUMN IF NOT EXISTS public_key text;
UPDATE didar_product SET public_key=md5(id) WHERE public_key IS NULL;
ALTER TABLE didar_product ALTER COLUMN public_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS didar_product_public_key ON didar_product(public_key);
ALTER TABLE didar_product ALTER COLUMN published SET DEFAULT false;
ALTER TABLE didar_category ADD COLUMN IF NOT EXISTS code text;
UPDATE didar_category SET code='legacy.' || md5(id) WHERE code IS NULL;
ALTER TABLE didar_category ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS didar_category_code ON didar_category(code);
ALTER TABLE didar_category ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'legacy' CHECK(kind IN ('legacy','family','category','subcategory'));
ALTER TABLE didar_category ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE didar_category ADD COLUMN IF NOT EXISTS labels jsonb NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS didar_category_parent_idx ON didar_category(parent_id);
CREATE INDEX IF NOT EXISTS didar_product_category_idx ON didar_product(category_id);
CREATE OR REPLACE FUNCTION didar_taxonomy_valid(leaf text) RETURNS boolean LANGUAGE sql VOLATILE AS $$
 SELECT EXISTS(SELECT 1 FROM didar_category s JOIN didar_category c ON c.id=s.parent_id JOIN didar_category f ON f.id=c.parent_id
 WHERE s.id=leaf AND s.kind='subcategory' AND c.kind='category' AND f.kind='family' AND f.parent_id IS NULL
 AND s.active AND c.active AND f.active AND NOT EXISTS(SELECT 1 FROM didar_category child WHERE child.parent_id=s.id)
 AND s.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND c.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND f.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
$$;
CREATE TABLE IF NOT EXISTS didar_taxonomy_review (
 product_id text PRIMARY KEY REFERENCES didar_product(id), category_id text, snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved')),
 recorded_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, resolved_by text REFERENCES didar_user(id)
);
-- Readiness exceptions preserve pre-existing public links without guessing an archival classification.
-- They never authorize a new/re-publication or a customer QR, and are not granted by the API.
INSERT INTO didar_taxonomy_review(product_id,category_id,snapshot)
 SELECT id,category_id,jsonb_build_object('published',published,'active',active,'approved',approved,'category',category,'category_id',category_id)
 FROM didar_product WHERE published AND NOT didar_taxonomy_valid(category_id) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION didar_legacy_ancestry_valid(leaf text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE current_id text:=leaf; seen text[]:='{}'; node record;
BEGIN
 IF leaf IS NULL THEN RETURN true; END IF;
 LOOP
 SELECT id,parent_id,slug,active INTO node FROM didar_category WHERE id=current_id;
 IF NOT FOUND OR node.id=ANY(seen) OR NOT node.active OR node.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN RETURN false; END IF;
 seen:=array_append(seen,node.id);
 IF node.parent_id IS NULL THEN RETURN true; END IF;
 current_id:=node.parent_id;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION didar_public_taxonomy(pid text,leaf text) RETURNS boolean LANGUAGE sql VOLATILE AS $$
 SELECT didar_taxonomy_valid(leaf) OR (didar_legacy_ancestry_valid(leaf) AND EXISTS(SELECT 1 FROM didar_taxonomy_review r WHERE r.product_id=pid AND r.status='pending' AND r.category_id IS NOT DISTINCT FROM leaf))
$$;
CREATE OR REPLACE FUNCTION didar_product_taxonomy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE legacy boolean:=false;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('didar:category-tree'));
 IF TG_OP='INSERT' THEN NEW.public_key:=coalesce(NEW.public_key,md5(NEW.id)); END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.public_key<>OLD.public_key THEN RAISE EXCEPTION 'INVALID_PRODUCT_ID'; END IF;
  legacy:=OLD.published AND OLD.active AND OLD.approved AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id AND didar_public_taxonomy(OLD.id,OLD.category_id);
 END IF;
 IF NEW.public_key !~ '^[a-f0-9]{32}$' THEN RAISE EXCEPTION 'INVALID_PRODUCT_ID'; END IF;
 IF NEW.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(NEW.slug)>100 THEN RAISE EXCEPTION 'INVALID_SLUG'; END IF;
 IF NEW.published AND NOT didar_taxonomy_valid(NEW.category_id) AND NOT legacy THEN RAISE EXCEPTION 'INVALID_PUBLICATION_TAXONOMY'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER didar_product_taxonomy BEFORE INSERT OR UPDATE ON didar_product FOR EACH ROW EXECUTE FUNCTION didar_product_taxonomy_guard();
CREATE OR REPLACE FUNCTION didar_category_tree_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_id text; seen text[]; parent_kind text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('didar:category-tree'));
 IF TG_OP<>'DELETE' THEN
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.code<>OLD.code) THEN RAISE EXCEPTION 'INVALID_CATEGORY_CODE'; END IF;
  IF NEW.code !~ '^[a-z0-9][a-z0-9.:-]{0,119}$' OR NEW.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(NEW.slug)>100 THEN RAISE EXCEPTION 'INVALID_SLUG'; END IF;
  SELECT kind INTO parent_kind FROM didar_category WHERE id=NEW.parent_id;
  IF (NEW.kind='family' AND NEW.parent_id IS NOT NULL) OR (NEW.kind='category' AND parent_kind IS DISTINCT FROM 'family') OR (NEW.kind='subcategory' AND parent_kind IS DISTINCT FROM 'category') THEN RAISE EXCEPTION 'INVALID_CATEGORY_RANK'; END IF;
  IF EXISTS(SELECT 1 FROM didar_category child WHERE child.parent_id=NEW.id AND child.kind<>'legacy' AND NOT ((NEW.kind='family' AND child.kind='category') OR (NEW.kind='category' AND child.kind='subcategory'))) THEN RAISE EXCEPTION 'INVALID_CATEGORY_RANK'; END IF;
  current_id:=NEW.parent_id;seen:=ARRAY[NEW.id];
  WHILE current_id IS NOT NULL LOOP
   IF current_id=ANY(seen) THEN RAISE EXCEPTION 'INVALID_CATEGORY_PARENT'; END IF;
   seen:=array_append(seen,current_id);
   SELECT parent_id INTO current_id FROM didar_category WHERE id=current_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CATEGORY_PARENT'; END IF;
  END LOOP;
 END IF;
 IF EXISTS(SELECT 1 FROM didar_product WHERE published AND NOT didar_public_taxonomy(id,category_id)) THEN RAISE EXCEPTION 'INVALID_PUBLICATION_TAXONOMY'; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER didar_category_taxonomy AFTER INSERT OR UPDATE OR DELETE ON didar_category FOR EACH ROW EXECUTE FUNCTION didar_category_tree_guard();
COMMIT;
