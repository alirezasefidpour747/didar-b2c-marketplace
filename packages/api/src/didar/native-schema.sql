-- Explicit one-to-one adapters; no copied credentials or parallel commercial records.
CREATE TABLE IF NOT EXISTS didar_native_actor (
 actor_type text NOT NULL CHECK(actor_type IN ('user','member')),
 actor_id text NOT NULL,
 user_id text NOT NULL REFERENCES didar_user(id),
 active boolean NOT NULL DEFAULT true,
 linked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_type,actor_id), UNIQUE(actor_type,user_id)
);
CREATE TABLE IF NOT EXISTS didar_native_seller (
 seller_id text PRIMARY KEY,
 supplier_id text NOT NULL UNIQUE REFERENCES didar_supplier(id),
 approved_by text NOT NULL REFERENCES didar_user(id),
 active boolean NOT NULL DEFAULT true,
 linked_at timestamptz NOT NULL DEFAULT now()
);
