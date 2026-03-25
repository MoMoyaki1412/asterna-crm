-- Phase 4: Final Security Hardening (RLS Lockdown)
-- This script purges all remaining insecure policies found during the final audit.

-- 1. Table: messages
-- REMOVE: Allow delete for anon (CRITICAL)
DROP POLICY IF EXISTS "Allow delete for anon" ON messages;
-- REMOVE: auth_all_messages (Too broad)
DROP POLICY IF EXISTS "auth_all_messages" ON messages;

-- ADD: Specific permission-based access
CREATE POLICY "messages_select" ON messages FOR SELECT
USING (auth_has_permission('view_conversations'));

CREATE POLICY "messages_insert" ON messages FOR INSERT
WITH CHECK (auth_has_permission('view_conversations'));

-- 2. Table: bank_accounts
-- REMOVE: Broad authenticated access
DROP POLICY IF EXISTS "auth_write_bank_accounts" ON bank_accounts;
DROP POLICY IF EXISTS "auth_read_bank_accounts" ON bank_accounts;

-- ADD: Specific permission-based access
CREATE POLICY "bank_select" ON bank_accounts FOR SELECT
USING (
    auth_has_permission('manage_bank') OR 
    auth_has_permission('create_orders') -- Allow staff to see accounts to share with customers
);

CREATE POLICY "bank_manage" ON bank_accounts FOR ALL
USING (auth_has_permission('manage_bank'))
WITH CHECK (auth_has_permission('manage_bank'));

-- 3. Table: campaigns
DROP POLICY IF EXISTS "auth_all_campaigns" ON campaigns;
CREATE POLICY "campaigns_select" ON campaigns FOR SELECT
USING (auth_has_permission('view_campaigns'));

CREATE POLICY "campaigns_manage" ON campaigns FOR ALL
USING (auth_has_permission('edit_campaigns'))
WITH CHECK (auth_has_permission('edit_campaigns'));

-- 4. Table: coupons
DROP POLICY IF EXISTS "auth_all_coupons" ON coupons;
CREATE POLICY "coupons_select" ON coupons FOR SELECT
USING (auth_has_permission('view_vouchers'));

CREATE POLICY "coupons_manage" ON coupons FOR ALL
USING (auth_has_permission('edit_vouchers'))
WITH CHECK (auth_has_permission('edit_vouchers'));

-- 5. Table: customer_tags & customer_tiers
DROP POLICY IF EXISTS "auth_read_tags" ON customer_tags;
CREATE POLICY "tags_select" ON customer_tags FOR SELECT
USING (auth_has_permission('manage_tags') OR auth_has_permission('view_customers'));

DROP POLICY IF EXISTS "auth_read_tiers" ON customer_tiers;
CREATE POLICY "tiers_select" ON customer_tiers FOR SELECT
USING (auth_has_permission('manage_tags') OR auth_has_permission('view_customers'));

-- 6. Table: activity_logs
DROP POLICY IF EXISTS "Enable read access for all users" ON activity_logs;
CREATE POLICY "logs_select" ON activity_logs FOR SELECT
USING (auth_has_permission('reveal_pii') OR auth_id_is_owner());

-- Final Check: Ensure no public/anon access remains on core tables
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE roles && '{anon}'::name[] AND tablename IN ('messages', 'bank_accounts', 'orders', 'products', 'customers')
    ) THEN
        RAISE EXCEPTION 'CRITICAL: Anon policies still exist on core tables!';
    END IF;
END $$;
