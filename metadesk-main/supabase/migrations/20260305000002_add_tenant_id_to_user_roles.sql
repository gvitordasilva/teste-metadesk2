-- Add tenant_id column to user_roles if not exists
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS tenant_id TEXT;
