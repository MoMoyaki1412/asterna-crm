-- =================================================================
-- PHASE 10: CUSTOM ORDER NUMBERING SYSTEM (ASN-XXXX)
-- 1. Add columns to orders table
-- 2. Create trigger for automated numbering (Tail Reuse)
-- 3. Migrate existing data
-- =================================================================

-- 1. Add columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_no_int INTEGER;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number TEXT UNIQUE;

-- 2. Create Trigger Function
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    next_no INTEGER;
BEGIN
    -- Only generate if order_number is null (allows manual override if ever needed)
    IF NEW.order_number IS NULL THEN
        -- TAIL REUSE LOGIC: Find MAX and add 1
        SELECT COALESCE(MAX(order_no_int), 0) + 1 INTO next_no FROM public.orders;
        
        NEW.order_no_int := next_no;
        NEW.order_number := 'ASN-' || next_no;
    ELSE
        -- Ensure order_no_int is synced if order_number was provided manually (unlikely)
        -- For simplicity, we just extract it if it follows the pattern
        IF NEW.order_no_int IS NULL AND NEW.order_number LIKE 'ASN-%' THEN
            NEW.order_no_int := CAST(SUBSTRING(NEW.order_number FROM 5) AS INTEGER);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Bind Trigger
DROP TRIGGER IF EXISTS trg_generate_order_number ON public.orders;
CREATE TRIGGER trg_generate_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.generate_order_number();

-- 4. Data Migration for existing orders
-- Use existing ID as the number to maintain history
UPDATE public.orders 
SET 
    order_no_int = id,
    order_number = 'ASN-' || id
WHERE order_number IS NULL;

-- 5. Update RPC get_public_invoice to include order_number
CREATE OR REPLACE FUNCTION get_public_invoice(p_token UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_items json;
  v_banks json;
BEGIN
  SELECT 
    o.id, o.order_number, o.customer_name, o.receiver_name, o.receiver_phone, 
    o.order_date, o.status, o.total, o.shipping_cost, o.discount, 
    o.payment_method, o.target_bank_id, o.items_summary, o.tracking, 
    o.bill_type, o.expiry_date, o.invoice_token, o.payment_slip_url, 
    o.shipping_address, o.address_subdistrict, o.address_district, 
    o.address_province, o.address_zipcode, c.phone as customer_phone
  INTO v_order
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  WHERE o.invoice_token = p_token;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(json_build_object(
    'product_name', p.name,
    'product_sku', p.sku,
    'image_url', p.image_url,
    'qty', oi.qty,
    'price', oi.price_at_time
  )) INTO v_items
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id = v_order.id;

  SELECT json_agg(json_build_object(
    'id', id,
    'bank_name', bank_name,
    'account_name', account_name,
    'account_no', account_number,
    'prompt_pay', prompt_pay
  )) INTO v_banks
  FROM bank_accounts
  WHERE is_active = true;

  RETURN json_build_object(
    'order', row_to_json(v_order),
    'items', COALESCE(v_items, '[]'::json),
    'banks', COALESCE(v_banks, '[]'::json)
  );
END;
$$;
