-- =====================================================
-- Bank Accounts Table for Asterna CRM
-- =====================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
  id SERIAL PRIMARY KEY,
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  branch TEXT DEFAULT '',
  prompt_pay TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can READ
CREATE POLICY "auth_read_bank_accounts" ON bank_accounts
  FOR SELECT TO authenticated USING (true);

-- Only owners can INSERT / UPDATE / DELETE (use RLS or handle in app)
-- For simplicity, allow all authenticated for now — 
-- app-level check via can('manage_settings') will guard the UI
CREATE POLICY "auth_write_bank_accounts" ON bank_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Sample data
INSERT INTO bank_accounts (bank_name, account_name, account_number, branch, sort_order) VALUES
  ('ธนาคารกสิกรไทย (KBANK)', 'บริษัท แอสเทอร์นา จำกัด', 'XXX-X-XXXXX-X', 'สาขาสยามพารากอน', 1);

-- Add QR Code URL column (run this if table already exists)
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS qr_code_url TEXT DEFAULT '';

-- Create Supabase Storage bucket for QR codes (run once in Supabase dashboard)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('bank-qr-codes', 'bank-qr-codes', true);
-- CREATE POLICY "public_read_bank_qr" ON storage.objects FOR SELECT USING (bucket_id = 'bank-qr-codes');
-- CREATE POLICY "auth_upload_bank_qr" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bank-qr-codes');
-- CREATE POLICY "auth_delete_bank_qr" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'bank-qr-codes');
