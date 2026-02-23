-- Ensure uuid extension is enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Fix id column default
ALTER TABLE figures ALTER COLUMN id SET DEFAULT gen_random_uuid();
