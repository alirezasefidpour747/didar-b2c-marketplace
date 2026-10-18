-- CORE-03: explicit presentation authority, never ownership/resale or a second Offer.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('didar:curation-schema'));
CREATE TABLE IF NOT EXISTS didar_curation_agreement (
 id text PRIMARY KEY, store_supplier_id text NOT NULL REFERENCES didar_supplier(id),
 seller_supplier_id text NOT NULL REFERENCES didar_supplier(id), offer_id text NOT NULL REFERENCES didar_offer(id),
 version integer NOT NULL CHECK(version>0), effective_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at>effective_at), reason text NOT NULL,
 actor_id text NOT NULL REFERENCES didar_user(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(store_supplier_id<>seller_supplier_id), UNIQUE(store_supplier_id,offer_id,version));
CREATE TABLE IF NOT EXISTS didar_curation_review (
 agreement_id text PRIMARY KEY REFERENCES didar_curation_agreement(id), approved boolean NOT NULL,
 actor_id text NOT NULL REFERENCES didar_user(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS didar_curation_revocation (
 agreement_id text PRIMARY KEY REFERENCES didar_curation_agreement(id),
 actor_id text NOT NULL REFERENCES didar_user(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['didar_curation_agreement','didar_curation_review','didar_curation_revocation'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=t||'_immutable' AND tgrelid=t::regclass) THEN
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION didar_fin_immutable()',t||'_immutable',t);
 END IF; END LOOP;
END $$;
CREATE OR REPLACE FUNCTION didar_curated_offer(oid text,sid text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce(current_setting('didar.curation_enabled',true)='sandbox',false) AND sid IS NOT NULL AND EXISTS(
 SELECT 1 FROM didar_curation_agreement a JOIN didar_curation_review r ON r.agreement_id=a.id AND r.approved
 JOIN didar_offer o ON o.id=a.offer_id AND o.supplier_id=a.seller_supplier_id
 JOIN didar_supplier s ON s.id=a.seller_supplier_id AND s.active AND s.status='approved'
 JOIN didar_supplier st ON st.id=a.store_supplier_id AND st.active AND st.status='approved'
 JOIN didar_sale_mandate m ON m.supplier_id=s.id AND m.mode='AGENCY'
 JOIN didar_sale_mandate_review mr ON mr.mandate_id=m.id AND mr.approved
 WHERE a.offer_id=oid AND a.store_supplier_id=sid AND a.effective_at<=now() AND a.expires_at>now()
 AND didar_native_saleable_supplier(s.id) AND didar_native_saleable_supplier(st.id)
 AND NOT EXISTS(SELECT 1 FROM didar_curation_agreement newer WHERE newer.store_supplier_id=sid AND newer.offer_id=oid AND newer.version>a.version)
 AND NOT EXISTS(SELECT 1 FROM didar_curation_revocation rv WHERE rv.agreement_id=a.id)
 AND m.effective_at<=now() AND m.expires_at>now()
 AND NOT EXISTS(SELECT 1 FROM didar_sale_mandate newer WHERE newer.supplier_id=s.id AND newer.version>m.version)
 AND NOT EXISTS(SELECT 1 FROM didar_sale_mandate_revocation rv WHERE rv.mandate_id=m.id)
 AND m.contract_id=(SELECT c.id FROM didar_fin_contract c JOIN didar_fin_contract_review cr ON cr.contract_id=c.id AND cr.approved WHERE c.supplier_id=s.id AND c.effective_at<=now() ORDER BY c.effective_at DESC,c.version DESC LIMIT 1)
 );
$$;
CREATE OR REPLACE FUNCTION didar_scoped_offer(oid text,sid text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM didar_offer o JOIN didar_supplier s ON s.id=o.supplier_id
 WHERE o.id=oid AND o.active AND s.active AND s.status='approved' AND didar_native_saleable_supplier(s.id)
 AND ((sid IS NULL AND didar_global_supplier(s.id)) OR o.supplier_id=sid OR didar_curated_offer(o.id,sid)));
$$;
CREATE OR REPLACE FUNCTION didar_visible_product(pid text,sid text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=pid AND didar_scoped_offer(o.id,sid))
 OR (sid IS NULL AND NOT EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=pid AND NOT didar_global_supplier(o.supplier_id)) AND NOT EXISTS(SELECT 1 FROM didar_product_request r WHERE r.product_id=pid AND r.status='approved' AND r.payload->>'join_product_id' IS NULL AND NOT didar_global_supplier(r.supplier_id)));
$$;
CREATE OR REPLACE FUNCTION didar_media_visible(aid text,sid text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce((SELECT a.status='approved' AND (a.visibility='SHARED_MASTER' OR a.supplier_id=sid OR
 (sid IS NULL AND EXISTS(SELECT 1 FROM didar_supplier s WHERE s.id=a.supplier_id AND s.active AND s.status='approved' AND didar_global_supplier(s.id) AND EXISTS(SELECT 1 FROM didar_offer o WHERE o.supplier_id=s.id AND o.product_id=a.product_id AND o.active))) OR
 (a.purpose='PRODUCT' AND EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=a.product_id AND o.supplier_id=a.supplier_id AND o.active AND didar_curated_offer(o.id,sid)))) FROM didar_media_asset a WHERE a.id=aid),false);
$$;
COMMIT;
