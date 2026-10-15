CREATE TABLE IF NOT EXISTS didar_supplier (
 id text PRIMARY KEY, name text NOT NULL, active boolean NOT NULL DEFAULT true, native_id text UNIQUE
);
CREATE TABLE IF NOT EXISTS didar_product (
 id text PRIMARY KEY, title text NOT NULL, category text NOT NULL, description text NOT NULL DEFAULT '',
 purity integer NOT NULL CHECK(purity BETWEEN 1 AND 1000), native_id text UNIQUE, active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS didar_offer (
 id text PRIMARY KEY, product_id text NOT NULL REFERENCES didar_product, supplier_id text NOT NULL REFERENCES didar_supplier,
 weight_mg integer NOT NULL CHECK(weight_mg BETWEEN 1 AND 1000000), quantity integer NOT NULL CHECK(quantity >= 0),
 labor_irr bigint NOT NULL CHECK(labor_irr >= 0), margin_bps integer NOT NULL CHECK(margin_bps BETWEEN 0 AND 10000),
 version integer NOT NULL DEFAULT 1, native_id text UNIQUE,
 UNIQUE(product_id,supplier_id,weight_mg)
);
CREATE TABLE IF NOT EXISTS didar_rate (
 id integer PRIMARY KEY CHECK(id=1), rate_irr bigint NOT NULL CHECK(rate_irr > 0), tax_bps integer NOT NULL CHECK(tax_bps BETWEEN 0 AND 10000),
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS didar_user (
 id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, password text NOT NULL,
 role text NOT NULL CHECK(role IN ('customer','supplier','admin')), supplier_id text REFERENCES didar_supplier,
 CHECK((role='supplier') = (supplier_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS didar_session (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES didar_user, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS didar_login_attempt (
 key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, reset_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS didar_order (
 id text PRIMARY KEY, customer_id text NOT NULL REFERENCES didar_user, idempotency_key text NOT NULL,
 total_irr bigint NOT NULL CHECK(total_irr>0), status text NOT NULL CHECK(status IN ('pending','paid','failed','expired')),
 address jsonb NOT NULL, rate_snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes', UNIQUE(customer_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS didar_order_line (
 id text PRIMARY KEY, order_id text NOT NULL REFERENCES didar_order, offer_id text NOT NULL REFERENCES didar_offer,
 supplier_id text NOT NULL REFERENCES didar_supplier, title text NOT NULL, weight_mg integer NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0), breakdown jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS didar_audit (
 id bigserial PRIMARY KEY, actor_id text REFERENCES didar_user, action text NOT NULL, details jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS didar_order_customer ON didar_order(customer_id,created_at);
CREATE INDEX IF NOT EXISTS didar_line_supplier ON didar_order_line(supplier_id);

-- Additive Didar migrations preserve the original delivery ledger and reservations.
ALTER TABLE didar_supplier ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved' CHECK(status IN ('pending','approved','rejected'));
CREATE TABLE IF NOT EXISTS didar_category (
 id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE,
 parent_id text REFERENCES didar_category, CHECK(parent_id IS NULL OR parent_id<>id)
);
CREATE TABLE IF NOT EXISTS didar_collection (
 id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE
);
ALTER TABLE didar_product ADD COLUMN IF NOT EXISTS category_id text REFERENCES didar_category;
ALTER TABLE didar_product ADD COLUMN IF NOT EXISTS reference text NOT NULL DEFAULT '';
ALTER TABLE didar_product ADD COLUMN IF NOT EXISTS jewelry_type text NOT NULL DEFAULT '';
ALTER TABLE didar_product ADD COLUMN IF NOT EXISTS min_weight_mg integer CHECK(min_weight_mg BETWEEN 1 AND 1000000);
ALTER TABLE didar_product ADD COLUMN IF NOT EXISTS max_weight_mg integer CHECK(max_weight_mg BETWEEN 1 AND 1000000);
ALTER TABLE didar_product ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true;
ALTER TABLE didar_offer ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE didar_offer ADD COLUMN IF NOT EXISTS labor_mode text NOT NULL DEFAULT 'fixed' CHECK(labor_mode IN ('fixed','percent'));
ALTER TABLE didar_offer ADD COLUMN IF NOT EXISTS labor_bps integer NOT NULL DEFAULT 0 CHECK(labor_bps BETWEEN 0 AND 10000);
ALTER TABLE didar_offer ADD COLUMN IF NOT EXISTS terms text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS didar_collection_product (
 collection_id text NOT NULL REFERENCES didar_collection ON DELETE CASCADE,
 product_id text NOT NULL REFERENCES didar_product ON DELETE CASCADE, PRIMARY KEY(collection_id,product_id)
);
-- Small validated image bytes live with PostgreSQL backups, never in executable public paths.
CREATE TABLE IF NOT EXISTS didar_product_image (
 id text PRIMARY KEY, product_id text NOT NULL REFERENCES didar_product ON DELETE CASCADE,
 mime_type text NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/webp')),
 data bytea NOT NULL CHECK(octet_length(data)<=786432), alt text NOT NULL DEFAULT '', position integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS didar_image_product ON didar_product_image(product_id,position);
CREATE TABLE IF NOT EXISTS didar_product_request (
 id text PRIMARY KEY, supplier_id text NOT NULL REFERENCES didar_supplier, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reason text NOT NULL DEFAULT '', product_id text REFERENCES didar_product, reviewed_by text REFERENCES didar_user,
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
