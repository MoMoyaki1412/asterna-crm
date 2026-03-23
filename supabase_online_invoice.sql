-- ====================================================
-- Asterna CRM — Online Invoice Setup Script
-- Run this in Supabase > SQL Editor > New Query
-- ====================================================

-- 1. ADD NEW COLUMNS TO orders TABLE
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS invoice_token UUID DEFAULT gen_random_uuid() UNIQUE;

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS payment_slip_url TEXT;

-- 2. CREATE PAYMENT SLIPS STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public) 
VALUES ('payment_slips', 'payment_slips', true) 
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for Public Upload & Read
CREATE POLICY "Public Upload to payment_slips" 
ON storage.objects FOR INSERT TO public 
WITH CHECK (bucket_id = 'payment_slips');

CREATE POLICY "Public Read from payment_slips" 
ON storage.objects FOR SELECT TO public 
USING (bucket_id = 'payment_slips');

-- 3. SECURE PUBLIC READ FUNCTION (RPC)
-- This function allows public access to ONLY the specific order associated with the token
CREATE OR REPLACE FUNCTION get_public_invoice(p_token UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_items json;
  v_bank record;
BEGIN
  -- Fetch the order if exists
  SELECT o.id, o.customer_name, o.order_date, o.status, o.total, o.shipping_cost, o.discount, o.payment_method, o.target_bank_id, o.items_summary, o.tracking, o.bill_type, o.expiry_date, o.invoice_token, o.payment_slip_url
  INTO v_order
  FROM orders o
  WHERE o.invoice_token = p_token;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Fetch Items
  SELECT json_agg(json_build_object(
    'product_name', p.name,
    'product_sku', p.sku,
    'qty', oi.qty,
    'price', oi.price_at_time
  )) INTO v_items
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id = v_order.id;

  -- Fetch Target Bank Account (if assigned, otherwise get the default active one)
  IF v_order.target_bank_id IS NOT NULL THEN
    SELECT bank_name, account_name, account_no INTO v_bank FROM bank_accounts WHERE id = v_order.target_bank_id;
  ELSE
    SELECT bank_name, account_name, account_no INTO v_bank FROM bank_accounts WHERE is_active = true LIMIT 1;
  END IF;

  RETURN json_build_object(
    'order', row_to_json(v_order),
    'items', COALESCE(v_items, '[]'::json),
    'bank', CASE WHEN v_bank IS NULL THEN NULL ELSE row_to_json(v_bank) END
  );
END;
$$;

-- 4. SECURE UPDATE SLIP FUNCTION (RPC)
-- Allows the checkout page to update the slip URL and immediately mark status as transferred
CREATE OR REPLACE FUNCTION update_invoice_slip(p_token UUID, p_slip_url TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE orders 
  SET payment_slip_url = p_slip_url, 
      status = 'transferred', 
      payment_method = 'bank_transfer'
  WHERE invoice_token = p_token AND status IN ('unpaid', 'draft', 'pending');
  
  RETURN FOUND;
END;
$$;
