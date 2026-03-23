-- ====================================================
-- Dynamic Roles and Permissions System
-- ====================================================

-- 1. Create ROLES table
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#ffffff',
  bg TEXT DEFAULT 'rgba(255,255,255,0.1)',
  icon TEXT DEFAULT '👤',
  is_system BOOLEAN DEFAULT FALSE, -- To prevent deleting 'owner'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create ROLE_PERMISSIONS table
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

-- 3. Remove the check constraint from admin_profiles if it exists
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'admin_profiles_role_check') THEN
        ALTER TABLE admin_profiles DROP CONSTRAINT admin_profiles_role_check;
    END IF;
END $$;

-- 4. Seed initial roles
INSERT INTO roles (id, label, description, color, bg, icon, is_system) VALUES
  ('owner', 'Owner', 'สิทธิ์เต็ม ทุกหน้า รวมถึงต้นทุน กำไร และการจัดการสิทธิ์', '#C9A84C', 'rgba(201, 168, 76, 0.12)', '👑', TRUE),
  ('manager', 'Manager', 'Dashboard, สินค้า, สต็อก, ออร์เดอร์, ลูกค้า, แท็ก', '#2ecc71', 'rgba(46, 204, 113, 0.12)', '🏠', TRUE),
  ('staff', 'Staff', 'Inbox, ดูออร์เดอร์, ดูลูกค้า เท่านั้น', '#3498db', 'rgba(52, 152, 219, 0.12)', '👤', TRUE)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  bg = EXCLUDED.bg,
  icon = EXCLUDED.icon;

-- 5. Seed initial permissions
-- OWNER (All)
INSERT INTO role_permissions (role_id, permission) VALUES
  ('owner', 'view_dashboard'), ('owner', 'view_cost'), ('owner', 'edit_products'),
  ('owner', 'edit_stock'), ('owner', 'view_orders'), ('owner', 'create_orders'),
  ('owner', 'delete_orders'), ('owner', 'view_customers'), ('owner', 'edit_customers'),
  ('owner', 'view_conversations'), ('owner', 'manage_tags'), ('owner', 'manage_permissions')
ON CONFLICT DO NOTHING;

-- MANAGER
INSERT INTO role_permissions (role_id, permission) VALUES
  ('manager', 'view_dashboard'), ('manager', 'edit_stock'), ('manager', 'view_orders'), 
  ('manager', 'create_orders'), ('manager', 'view_customers'), ('manager', 'edit_customers'),
  ('manager', 'view_conversations'), ('manager', 'manage_tags')
ON CONFLICT DO NOTHING;

-- STAFF
INSERT INTO role_permissions (role_id, permission) VALUES
  ('staff', 'view_orders'), ('staff', 'create_orders'), ('staff', 'view_customers'), 
  ('staff', 'view_conversations')
ON CONFLICT DO NOTHING;

-- 6. Enable RLS on new tables
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on roles" ON roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow public read on role_permissions" ON role_permissions FOR SELECT TO authenticated USING (true);

-- Only owners can manage roles and permissions
CREATE POLICY "Owners can manage roles" ON roles 
  FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid() AND role = 'owner'));

CREATE POLICY "Owners can manage role_permissions" ON role_permissions 
  FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid() AND role = 'owner'));
