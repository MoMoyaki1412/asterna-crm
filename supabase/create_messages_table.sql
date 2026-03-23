-- =============================================
-- Asterna CRM: Messages Table
-- Run this SQL in your Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  sender      TEXT NOT NULL CHECK (sender IN ('admin', 'customer')),
  platform    TEXT NOT NULL DEFAULT 'crm' CHECK (platform IN ('crm', 'facebook', 'line', 'instagram', 'tiktok')),
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all access to authenticated users
CREATE POLICY "Allow all for authenticated" ON messages
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups by customer
CREATE INDEX IF NOT EXISTS messages_customer_id_idx ON messages (customer_id, created_at DESC);
