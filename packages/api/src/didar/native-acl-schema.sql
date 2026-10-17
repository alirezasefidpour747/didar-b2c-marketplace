-- Optional explicit restrictions on existing native actors, never a second identity.
CREATE TABLE IF NOT EXISTS didar_native_acl (
 actor_type text NOT NULL CHECK(actor_type IN ('user','member')),
 actor_id text NOT NULL,
 rights jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(rights)='object'),
 active boolean NOT NULL DEFAULT true,
 updated_by text NOT NULL REFERENCES didar_user(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_type,actor_id)
);
