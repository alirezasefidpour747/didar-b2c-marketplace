-- Additive, repeatable extension migration. Never rebuild existing gold tables.
ALTER TABLE didar_rate ADD COLUMN IF NOT EXISTS fee_irr bigint NOT NULL DEFAULT 0 CHECK(fee_irr >= 0 AND fee_irr <= 1000000000000);
ALTER TABLE didar_rate ADD COLUMN IF NOT EXISTS rounding_step integer NOT NULL DEFAULT 1 CHECK(rounding_step BETWEEN 1 AND 1000000);
ALTER TABLE didar_rate ADD COLUMN IF NOT EXISTS default_margin_bps integer NOT NULL DEFAULT 700 CHECK(default_margin_bps BETWEEN 0 AND 10000);
ALTER TABLE didar_user ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
ALTER TABLE didar_user ADD COLUMN IF NOT EXISTS address jsonb NOT NULL DEFAULT '{}';
ALTER TABLE didar_order_line ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'allocated' CHECK(fulfillment_status IN ('allocated','preparing','dispatched','delivered'));
ALTER TABLE didar_order_line ADD COLUMN IF NOT EXISTS tracking_number text NOT NULL DEFAULT '';
ALTER TABLE didar_order_line ADD COLUMN IF NOT EXISTS carrier text NOT NULL DEFAULT '';
ALTER TABLE didar_order_line ADD COLUMN IF NOT EXISTS fulfillment_updated_at timestamptz;
CREATE TABLE IF NOT EXISTS didar_payment_attempt (
 id text PRIMARY KEY, order_id text NOT NULL UNIQUE REFERENCES didar_order(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK(provider IN ('sandbox','iranian-rial')),
 authority text NOT NULL UNIQUE, amount_irr bigint NOT NULL CHECK(amount_irr>0), currency text NOT NULL DEFAULT 'IRR' CHECK(currency='IRR'),
 status text NOT NULL DEFAULT 'initialized' CHECK(status IN ('initialized','success','failure','cancelled','expired')),
 reference text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 confirmed_at timestamptz
);
CREATE INDEX IF NOT EXISTS didar_payment_status ON didar_payment_attempt(status,expires_at);
