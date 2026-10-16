-- Issue #4: additive publication guard; identifiers, inventory and financial history stay intact.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('didar:category-tree'));
ALTER TABLE didar_product ADD COLUMN IF NOT EXISTS slug text NOT NULL DEFAULT 'product';
ALTER TABLE didar_product ALTER COLUMN published SET DEFAULT false;
CREATE INDEX IF NOT EXISTS didar_category_parent_idx ON didar_category(parent_id);
CREATE INDEX IF NOT EXISTS didar_product_category_idx ON didar_product(category_id);
CREATE OR REPLACE FUNCTION didar_taxonomy_valid(leaf text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE current_id text := leaf; seen text[] := '{}'; node record;
BEGIN
 IF leaf IS NULL OR EXISTS(SELECT 1 FROM didar_category WHERE parent_id=leaf) THEN RETURN false; END IF;
 LOOP
  SELECT id,parent_id,slug INTO node FROM didar_category WHERE id=current_id;
  IF NOT FOUND OR node.id=ANY(seen) OR node.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(node.slug)>100 THEN RETURN false; END IF;
  seen := array_append(seen,node.id);
  IF node.parent_id IS NULL THEN RETURN cardinality(seen)>=2; END IF;
  current_id := node.parent_id;
 END LOOP;
END $$;
-- A legacy master lacking a complete taxonomy becomes a retained draft, never an invented classification.
CREATE TABLE IF NOT EXISTS didar_taxonomy_migration_draft(product_id text PRIMARY KEY REFERENCES didar_product(id), previous_published boolean NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now());
INSERT INTO didar_taxonomy_migration_draft(product_id,previous_published)
 SELECT id,published FROM didar_product WHERE published AND NOT didar_taxonomy_valid(category_id) ON CONFLICT DO NOTHING;
UPDATE didar_product SET published=false WHERE published AND NOT didar_taxonomy_valid(category_id);
CREATE OR REPLACE FUNCTION didar_product_taxonomy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('didar:category-tree'));
 IF TG_OP='UPDATE' AND NEW.id<>OLD.id THEN RAISE EXCEPTION 'INVALID_PRODUCT_ID'; END IF;
 IF NEW.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(NEW.slug)>100 THEN RAISE EXCEPTION 'INVALID_SLUG'; END IF;
 IF NEW.published AND NOT didar_taxonomy_valid(NEW.category_id) THEN RAISE EXCEPTION 'INVALID_PUBLICATION_TAXONOMY'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS didar_product_taxonomy ON didar_product;
CREATE TRIGGER didar_product_taxonomy BEFORE INSERT OR UPDATE ON didar_product FOR EACH ROW EXECUTE FUNCTION didar_product_taxonomy_guard();
CREATE OR REPLACE FUNCTION didar_category_tree_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_id text; seen text[];
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('didar:category-tree'));
 IF TG_OP<>'DELETE' THEN
  IF NEW.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(NEW.slug)>100 THEN RAISE EXCEPTION 'INVALID_SLUG'; END IF;
  current_id:=NEW.parent_id; seen:=ARRAY[NEW.id];
  WHILE current_id IS NOT NULL LOOP
   IF current_id=ANY(seen) THEN RAISE EXCEPTION 'INVALID_CATEGORY_PARENT'; END IF;
   seen:=array_append(seen,current_id);
   SELECT parent_id INTO current_id FROM didar_category WHERE id=current_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CATEGORY_PARENT'; END IF;
  END LOOP;
 END IF;
 IF EXISTS(SELECT 1 FROM didar_product WHERE published AND NOT didar_taxonomy_valid(category_id)) THEN RAISE EXCEPTION 'INVALID_PUBLICATION_TAXONOMY'; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS didar_category_taxonomy ON didar_category;
CREATE TRIGGER didar_category_taxonomy AFTER INSERT OR UPDATE OR DELETE ON didar_category FOR EACH ROW EXECUTE FUNCTION didar_category_tree_guard();
COMMIT;
