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
  SELECT o.id, o.customer_name, o.order_date, o.status, o.total, o.shipping_cost, o.discount, o.payment_method, o.target_bank_id, o.items_summary, o.tracking, o.bill_type, o.expiry_date, o.invoice_token, o.payment_slip_url, o.shipping_address, o.address_subdistrict, o.address_district, o.address_province, o.address_zipcode, c.phone as customer_phone
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

  IF v_order.target_bank_id IS NOT NULL THEN
    SELECT bank_name, account_name, account_number as account_no, prompt_pay INTO v_bank FROM bank_accounts WHERE id = v_order.target_bank_id;
  ELSE
    SELECT bank_name, account_name, account_number as account_no, prompt_pay INTO v_bank FROM bank_accounts WHERE is_active = true LIMIT 1;
  END IF;

  RETURN json_build_object(
    'order', row_to_json(v_order),
    'items', COALESCE(v_items, '[]'::json),
    'bank', CASE WHEN v_bank IS NULL THEN NULL ELSE row_to_json(v_bank) END
  );
END;
$$;
