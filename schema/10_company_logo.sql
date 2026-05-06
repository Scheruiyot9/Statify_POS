-- Add logo_url to companies for tenant branding
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
