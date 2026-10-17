-- Integrate native Seller lifecycle without copying stock, prices or history.
CREATE OR REPLACE FUNCTION didar_native_saleable_supplier(sid text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM didar_native_seller n WHERE n.supplier_id=sid)
 OR EXISTS(SELECT 1 FROM didar_native_seller n JOIN seller s ON s.id=n.seller_id
 WHERE n.supplier_id=sid AND n.active AND s.deleted_at IS NULL AND s.status='open')
$$;
-- A replay of an older migration must not downgrade CORE-03 visibility.
DO $replay$
BEGIN
 IF to_regclass('didar_curation_agreement') IS NULL THEN
  EXECUTE $definition$CREATE OR REPLACE FUNCTION didar_global_supplier(sid text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT didar_native_saleable_supplier(sid) AND NOT EXISTS(SELECT 1 FROM didar_storefront f
 WHERE f.supplier_id=sid AND (f.visibility<>'PUBLIC_MARKETPLACE' OR NOT f.published OR NOT f.approved))
$$;$definition$;
 END IF;
END $replay$;
-- A replay of an older migration must not downgrade CORE-03 visibility.
DO $replay$
BEGIN
 IF to_regclass('didar_curation_agreement') IS NULL THEN
  EXECUTE $definition$CREATE OR REPLACE FUNCTION didar_visible_product(pid text,sid text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM didar_offer o JOIN didar_supplier s ON s.id=o.supplier_id
 WHERE o.product_id=pid AND o.active AND s.active AND s.status='approved' AND didar_native_saleable_supplier(s.id)
 AND ((sid IS NULL AND didar_global_supplier(o.supplier_id)) OR o.supplier_id=sid))
 OR (sid IS NULL AND NOT EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=pid AND NOT didar_global_supplier(o.supplier_id)) AND NOT EXISTS(SELECT 1 FROM didar_product_request r WHERE r.product_id=pid AND r.status='approved' AND r.payload->>'join_product_id' IS NULL AND NOT didar_global_supplier(r.supplier_id)))
$$;$definition$;
 END IF;
END $replay$;
