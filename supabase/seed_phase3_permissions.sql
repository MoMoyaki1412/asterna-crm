-- Phase 3: Add manage_bank and manage_paper permissions to default roles
INSERT INTO role_permissions (role, permission)
VALUES 
  ('owner', 'manage_bank'),
  ('owner', 'manage_paper'),
  ('manager', 'manage_bank'),
  ('manager', 'manage_paper')
ON CONFLICT (role, permission) DO NOTHING;

-- Also ensure managers have edit access for campaigns and vouchers if they were view-only
INSERT INTO role_permissions (role, permission)
VALUES 
  ('manager', 'edit_campaigns'),
  ('manager', 'edit_vouchers')
ON CONFLICT (role, permission) DO NOTHING;
