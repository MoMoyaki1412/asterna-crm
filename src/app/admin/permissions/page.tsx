'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAdminAuth, AdminProfile, Permission } from '@/contexts/AdminAuthContext'
import Link from 'next/link'
import { logActivity } from '@/lib/logger'

// Define the permissions list (the rows in our matrix)
const PERMISSION_LIST: { id: Permission; label: string }[] = [
  { id: 'view_dashboard', label: 'ดู Dashboard / ยอดขาย / กำไร' },
  { id: 'view_products', label: 'ดูรายการสินค้า (Catalog)' },
  { id: 'view_cost', label: 'ดูต้นทุนสินค้า' },
  { id: 'edit_products', label: 'แก้ไขสินค้า / ราคา / ส่วนประกอบ' },
  { id: 'view_stock', label: 'ดูสต็อกสินค้า' },
  { id: 'edit_stock', label: 'ปรับสต็อก' },
  { id: 'view_orders', label: 'ดูออร์เดอร์' },
  { id: 'create_orders', label: 'สร้างออร์เดอร์' },
  { id: 'delete_orders', label: 'ลบ / ยกเลิกออร์เดอร์' },
  { id: 'view_customers', label: 'ดูลูกค้า' },
  { id: 'view_full_pii', label: 'ดูเบอร์โทรและที่อยู่เต็ม (PII)' },
  { id: 'edit_customers', label: 'แก้ไขข้อมูลลูกค้า / แท็ก' },
  { id: 'view_conversations', label: 'Inbox / การสนทนา' },
  { id: 'manage_orders', label: 'จัดการ/แก้ไขสถานะออร์เดอร์' },
  { id: 'manage_tags', label: 'จัดการแท็กและ Tier' },
  { id: 'manage_permissions', label: 'จัดการสิทธิ์แอดมิน (Matrix / Roles)' },
  { id: 'create_admins', label: 'สร้างและจัดการบัญชีแอดมิน' },
]

type Role = {
  id: string
  label: string
  description: string
  color: string
  bg: string
  icon: string
  is_system?: boolean
}

const DEFAULT_ROLES: Role[] = [
  {
    id: 'owner',
    label: 'Owner',
    color: '#C9A84C',
    bg: 'rgba(201, 168, 76, 0.12)',
    description: 'สิทธิ์เต็ม ทุกหน้า รวมถึงต้นทุน กำไร และการจัดการสิทธิ์',
    icon: '👑',
    is_system: true,
  },
  {
    id: 'manager',
    label: 'Manager',
    color: '#2ecc71',
    bg: 'rgba(46, 204, 113, 0.12)',
    description: 'Dashboard, สินค้า, สต็อก, ออร์เดอร์, ลูกค้า, แท็ก',
    icon: '🏠',
    is_system: true,
  },
  {
    id: 'staff',
    label: 'Staff',
    color: '#3498db',
    bg: 'rgba(52, 152, 219, 0.12)',
    description: 'Inbox, ดูออร์เดอร์, ดูลูกค้า เท่านั้น',
    icon: '👤',
    is_system: true,
  },
]

const PREDEFINED_ICONS = ['👑', '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦉', '🦄', '🐴', '🐗', '🐘', '🦏', '🦛', '🦒', '🦍', '🦧']
const COLOR_PRESETS = ['#C9A84C', '#2ecc71', '#3498db', '#e74c3c', '#9b59b6', '#f1c40f']

export default function PermissionsPage() {
  const { profile: myProfile, can, loading: authLoading, refreshProfile } = useAdminAuth()
  const [admins, setAdmins] = useState<AdminProfile[]>([])
  const [roles, setRoles] = useState<Role[]>(DEFAULT_ROLES)
  const [rolePerms, setRolePerms] = useState<Record<string, Permission[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Modals state
  const [showCreateAdmin, setShowCreateAdmin] = useState(false)
  const [createAdminForm, setCreateAdminForm] = useState({ email: '', password: '', name: '', role: 'staff' })
  const [creatingAdmin, setCreatingAdmin] = useState(false)
  
  const [showCreateRole, setShowCreateRole] = useState(false)
  const [createRoleForm, setCreateRoleForm] = useState({ id: '', label: '', description: '', icon: '👤', color: '#3498db' })
  const [creatingRole, setCreatingRole] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [confirmingDeleteRole, setConfirmingDeleteRole] = useState<Role | null>(null)
  const [confirmDeleteAdminId, setConfirmDeleteAdminId] = useState<string | null>(null)

  const [updatingRole, setUpdatingRole] = useState(false)

  const [error, setError] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: adminData } = await supabase
        .from('admin_profiles')
        .select('*')
        .order('created_at', { ascending: true })
      
      const { data: rolesData } = await supabase
        .from('roles')
        .select('*')
        .order('created_at', { ascending: true })

      const { data: permsData } = await supabase
        .from('role_permissions')
        .select('*')

      setAdmins(adminData || [])
      
      if (rolesData && rolesData.length > 0) {
        setRoles(rolesData)
      }

      if (permsData) {
        const permsMap: Record<string, Permission[]> = {}
        permsData.forEach(p => {
          if (!permsMap[p.role_id]) permsMap[p.role_id] = []
          permsMap[p.role_id].push(p.permission as Permission)
        })
        setRolePerms(permsMap)
      } else {
        // Fallback for UI if no data
        setRolePerms({
          owner: PERMISSION_LIST.map(p => p.id),
          manager: ['view_dashboard', 'edit_stock', 'view_orders', 'create_orders', 'view_customers', 'edit_customers', 'view_conversations', 'manage_tags'] as Permission[],
          staff: ['view_orders', 'create_orders', 'view_customers', 'view_conversations'] as Permission[],
        })
      }
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  async function updateAdminRole(adminId: string, newRole: string) {
    setSaving(adminId)
    const { error } = await supabase
      .from('admin_profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', adminId)

    if (!error) {
      logActivity(myProfile?.id || 'system', 'UPDATE_ADMIN_ROLE', 'admin_profiles', adminId, { newRole })
      setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, role: newRole } : a))
      setSaved(adminId)
      setTimeout(() => setSaved(null), 2000)
    }
    setSaving(null)
  }

  async function togglePermission(roleId: string, permission: Permission) {
    if (roleId === 'owner') return // Cannot edit owner permissions
    
    const isEnabling = !rolePerms[roleId]?.includes(permission)
    const newPerms = isEnabling 
      ? [...(rolePerms[roleId] || []), permission]
      : (rolePerms[roleId] || []).filter(p => p !== permission)

    // Update locally first for snappy UI
    setRolePerms(prev => ({ ...prev, [roleId]: newPerms }))

    if (isEnabling) {
      await supabase.from('role_permissions').insert({ role_id: roleId, permission })
    } else {
      await supabase.from('role_permissions').delete().match({ role_id: roleId, permission })
    }
  }

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault()
    setCreatingAdmin(true)
    setError('')

    try {
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: createAdminForm.email,
        password: createAdminForm.password,
        options: { data: { display_name: createAdminForm.name } }
      })

      if (authErr) throw authErr
      if (!authData.user) throw new Error('ไม่สามารถสร้างผู้ใช้ได้')

      const { error: profileErr } = await supabase
        .from('admin_profiles')
        .insert({
          id: authData.user.id,
          email: createAdminForm.email,
          display_name: createAdminForm.name || createAdminForm.email.split('@')[0],
          role: createAdminForm.role,
        })

      if (profileErr) throw profileErr

      logActivity(myProfile?.id || 'system', 'CREATE_ADMIN', 'admin_profiles', authData.user.id, { email: createAdminForm.email, role: createAdminForm.role })
      await fetchData()
      setShowCreateAdmin(false)
      setCreateAdminForm({ email: '', password: '', name: '', role: 'staff' })
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาด')
    } finally {
      setCreatingAdmin(false)
    }
  }

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault()
    setCreatingRole(true)
    setError('')

    try {
      // Auto-generate ID from label (slugify)
      const roleId = createRoleForm.label
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // Remove special chars
        .replace(/[\s_-]+/g, '_')  // Replace spaces/dashes with _
        .replace(/^-+|-+$/g, '')   // Remove leading/trailing dashes
        
      if (!roleId) throw new Error('กรุณาระบุชื่อ Role ก่อนครับ')
      
      // Check if role already exists
      const { data: existing } = await supabase.from('roles').select('id').eq('id', roleId).single()
      if (existing) throw new Error('Role ID นี้มีอยู่ในระบบแล้ว')

      const { data: newRoleData, error: roleErr } = await supabase
        .from('roles')
        .insert({
          id: roleId,
          label: createRoleForm.label,
          description: createRoleForm.description,
          icon: createRoleForm.icon,
          color: createRoleForm.color,
          bg: `${createRoleForm.color}1f`, // Subtle background
        })
        .select()
        .single()

      if (roleErr) throw roleErr

      if (newRoleData) {
        logActivity(myProfile?.id || 'system', 'CREATE_ROLE', 'roles', roleId, { label: createRoleForm.label })
        setRoles(prev => [...prev, newRoleData])
      }
      setShowCreateRole(false)
      setCreateRoleForm({ id: '', label: '', description: '', icon: '👤', color: '#3498db' })
      refreshProfile()
    } catch (err: any) {
      toast.error(err.message || 'Error creating role')
    } finally {
      setCreatingRole(false)
    }
  }

  async function handleUpdateRole() {
    if (!editingRole) return
    setUpdatingRole(true)
    try {
      const { error } = await supabase
        .from('roles')
        .update({
          label: editingRole.label,
          description: editingRole.description,
          icon: editingRole.icon,
          color: editingRole.color,
          bg: `${editingRole.color}1f`, // Update background as well
          updated_at: new Date().toISOString()
        })
        .eq('id', editingRole.id)

      if (error) throw error

      logActivity(myProfile?.id || 'system', 'UPDATE_ROLE', 'roles', editingRole.id, { label: editingRole.label })
      setRoles(prev => prev.map(r => r.id === editingRole.id ? editingRole : r))
      setEditingRole(null)
      refreshProfile()
    } catch (err: any) {
      toast.error(err.message || 'Error updating role')
    } finally {
      setUpdatingRole(false)
    }
  }

  function handleEditIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editingRole) return

    if (file.size > 500 * 1024) {
      toast.error('เพื่อประสิทธิภาพสูงสุด ขนาดไฟล์รูปภาพควรไม่เกิน 500KB ค่ะ')
      return
    }

    setSaving('processing_icon')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64String = ev.target?.result as string
      setEditingRole({ ...editingRole, icon: base64String })
      setSaving(null)
    }
    reader.onerror = () => {
      setError('ไม่สามารถอ่านไฟล์รูปภาพได้')
      setSaving(null)
    }
    reader.readAsDataURL(file)
  }

  async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 500 * 1024) {
      toast.error('เพื่อประสิทธิภาพสูงสุด ขนาดไฟล์รูปภาพควรไม่เกิน 500KB ค่ะ')
      return
    }

    setSaving('processing_icon')
    try {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const base64String = ev.target?.result as string
        setCreateRoleForm(prev => ({ ...prev, icon: base64String }))
        setSaving(null)
      }
      reader.onerror = () => {
        setError('ไม่สามารถอ่านไฟล์รูปภาพได้')
        setSaving(null)
      }
      reader.readAsDataURL(file)
    } catch (err: any) {
      console.error('Icon processing error:', err)
      setError('เกิดข้อผิดพลาดในการประมวลผลรูปภาพ')
      setSaving(null)
    }
  }

  async function handleDeleteAdmin(adminId: string) {
    if (confirmDeleteAdminId !== adminId) {
      setConfirmDeleteAdminId(adminId)
      return
    }
    setDeleting(adminId)
    await supabase.from('admin_profiles').delete().eq('id', adminId)
    logActivity(myProfile?.id || 'system', 'DELETE_ADMIN', 'admin_profiles', adminId)
    setAdmins(prev => prev.filter(a => a.id !== adminId))
    setDeleting(null)
    setConfirmDeleteAdminId(null)
  }

  async function handleDeleteRole(roleId: string) {
    if (roleId === 'owner') return
    const role = roles.find(r => r.id === roleId)
    if (!role) return
    
    // Check if any admin is using this role before deleting
    const { count, error: countErr } = await supabase
      .from('admin_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', roleId)
    
    if (countErr) {
      console.error('Check role use error:', countErr)
    } else if (count && count > 0) {
      toast.error(`⚠️ ไม่สามารถลบ Role "${role.label}" ได้\nเนื่องจากมีแอดมินใช้งานอยู่ ${count} คน กรุณาเปลี่ยน Role ของแอดมินกลุ่มนี้ก่อนลบค่ะ`)
      return
    }

    setConfirmingDeleteRole(role)
  }

  async function executeDeleteRole() {
    if (!confirmingDeleteRole) return
    const roleId = confirmingDeleteRole.id
    
    setUpdatingRole(true)
    try {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', roleId)
      
      if (error) {
        console.error('DELETE ROLE ERROR:', error)
        throw error
      }
      
      logActivity(myProfile?.id || 'system', 'DELETE_ROLE', 'roles', roleId)
      setRoles(prev => prev.filter(r => r.id !== roleId))
      setConfirmingDeleteRole(null)
      refreshProfile()
    } catch (err: any) {
      console.error('Delete role catch:', err)
      toast.error(err.message || 'Error deleting role')
    } finally {
      setUpdatingRole(false)
    }
  }

  if (authLoading || loading) {
    return <div className="page-body animate-in" style={{ padding: 40, color: 'var(--gold-primary)' }}>⏳ กำลังโหลด...</div>
  }

  if (!can('manage_permissions') && !can('create_admins')) {
    return (
      <div className="page-body animate-in" style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>🔒</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>ไม่มีสิทธิ์เข้าถึง</h2>
        <p style={{ color: 'var(--gray-text)', marginBottom: 24 }}>หน้านี้สำหรับ Owner หรือผู้ที่มีสิทธิ์จัดการแอดมินเท่านั้น</p>
        <Link href="/admin" className="btn btn-primary">← กลับ Dashboard</Link>
      </div>
    )
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">🔐 จัดการสิทธิ์แอดมิน (Permissions)</span>
      </div>

      <div className="page-body animate-in" style={{ maxWidth: 1100, paddingBottom: 64 }}>

        {/* Header */}
        <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>⚙️ ระบบจัดการสิทธิ์ (Role-Based Access)</h2>
            <p style={{ color: 'var(--gray-text)', fontSize: 14 }}>กำหนดระดับการเข้าถึงระบบของแอดมินแต่ละคน การเปลี่ยนแปลงมีผลทันที</p>
          </div>
        </div>

        {/* Role Legend Cards */}
        {can('manage_permissions') && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 32 }}>
            {roles.map(r => (
              <div 
                key={r.id} 
                onClick={() => r.id !== 'owner' && setEditingRole(r)}
                style={{
                  background: r.bg || 'rgba(255,255,255,0.03)', border: `1px solid ${r.color}33`,
                  borderRadius: 12, padding: '20px 24px',
                  position: 'relative',
                  cursor: r.id === 'owner' ? 'default' : 'pointer',
                  transition: 'all 0.2s ease'
                }}
                className={r.id !== 'owner' ? 'role-card-hover' : ''}
              >
                {r.id !== 'owner' && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteRole(r.id) }}
                    style={{
                      position: 'absolute', top: 12, right: 12,
                      background: 'rgba(255,255,255,0.05)', border: 'none',
                      borderRadius: '50%', width: 28, height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', transition: 'all 0.2s', zIndex: 10
                    }}
                    className="delete-role-btn"
                    title="ลบ Role"
                  >
                    <span style={{ fontSize: 14 }}>🗑️</span>
                  </button>
                )}
                <div style={{ fontSize: 28, marginBottom: 8, height: 40, display: 'flex', alignItems: 'center' }}>
                  {r.icon.startsWith('http') || r.icon.startsWith('data:') ? (
                    <img src={r.icon} alt={r.label} style={{ height: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                  ) : (
                    r.icon === 'crown' ? '👑' : r.icon
                  )}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: r.color, marginBottom: 4 }}>{r.label}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-text)', lineHeight: 1.6 }}>{r.description}</div>
              </div>
            ))}
            <button 
              onClick={() => setShowCreateRole(true)}
              style={{
                background: 'transparent', border: '2px dashed var(--gray-border)',
                borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                color: 'var(--gray-text)', transition: 'all 0.2s'
              }}
              className="hover-light"
            >
              <div style={{ fontSize: 24 }}>➕</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>เพิ่ม Role ใหม่</div>
            </button>
          </div>
        )}

        {/* Admin List */}
        <div className="card" style={{ padding: 0, marginBottom: 32, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--gray-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800 }}>👥 รายชื่อแอดมินทั้งหมด ({admins.length} คน)</h3>
            {can('create_admins') && (
              <button
                onClick={() => { setShowCreateAdmin(true); setError('') }}
                className="btn btn-primary"
                style={{ padding: '8px 18px', fontSize: 13 }}
              >
                + สร้าง Admin ใหม่
              </button>
            )}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
              <tr>
                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, color: 'var(--gray-text)', fontWeight: 500 }}>แอดมิน</th>
                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, color: 'var(--gray-text)', fontWeight: 500 }}>Email</th>
                <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: 12, color: 'var(--gray-text)', fontWeight: 500 }}>Role ปัจจุบัน</th>
                <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: 12, color: 'var(--gray-text)', fontWeight: 500 }}>เปลี่ยน Role</th>
                <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: 12, color: 'var(--gray-text)', fontWeight: 500 }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(admin => {
                const roleConf = roles.find(r => r.id === admin.role)
                const isSelf = admin.id === myProfile?.id
                return (
                  <tr key={admin.id} style={{ borderBottom: '1px solid var(--gray-border)', transition: 'background 0.2s' }} className="hover-light">
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%',
                          background: `linear-gradient(135deg, ${roleConf?.color || '#666'}, ${roleConf?.color || '#666'}88)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, fontWeight: 800, flexShrink: 0,
                        }}>
                          {(admin.display_name || admin.email)[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            {admin.display_name || 'ไม่มีชื่อ'}
                            {isSelf && <span style={{ fontSize: 10, color: 'var(--gold-primary)', marginLeft: 8, background: 'rgba(201,168,76,0.15)', padding: '1px 6px', borderRadius: 4 }}>คุณ</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', color: 'var(--gray-text)', fontSize: 13 }}>{admin.email}</td>
                    <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                      {roleConf && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                          color: roleConf.color, background: roleConf.bg,
                          border: `1px solid ${roleConf.color}55`,
                          padding: '4px 12px', borderRadius: 20,
                        }}>
                          <span style={{ display: 'inline-flex', width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
                            {roleConf.icon.startsWith('http') || roleConf.icon.startsWith('data:') ? (
                              <img src={roleConf.icon} alt="icon" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                              roleConf.icon === 'crown' ? '👑' : roleConf.icon
                            )}
                          </span>
                          {roleConf.label}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                      {isSelf || !can('manage_permissions') || (admin.role === 'owner' && myProfile?.role !== 'owner') ? (
                        <span style={{ fontSize: 12, color: 'var(--gray-text)' }}>
                          {isSelf && admin.role === 'owner' ? '👑 Owner' : (roleConf?.label || '—')}
                        </span>
                      ) : (
                        <select 
                          value={admin.role || ''}
                          onChange={(e) => updateAdminRole(admin.id, e.target.value)}
                          disabled={saving === admin.id}
                          style={{
                            padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)',
                            border: '1px solid var(--gray-border)', color: 'white', fontSize: 12,
                            outline: 'none', cursor: 'pointer'
                          }}
                        >
                          {roles
                            .filter(r => r.id !== 'owner' || myProfile?.role === 'owner') // Non-owners cannot change anyone TO owner
                            .map(r => (
                              <option key={r.id} value={r.id} style={{ background: '#1a1a1a', color: 'white' }}>
                                {r.label}
                              </option>
                            ))}
                        </select>
                      )}
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'center', fontSize: 12 }}>
                      {saved === admin.id ? (
                        <span style={{ color: '#2ecc71', fontWeight: 700 }}>✅</span>
                      ) : saving === admin.id ? (
                        <span style={{ color: 'var(--gray-text)' }}>⏳</span>
                      ) : (!isSelf && can('create_admins') && (admin.role !== 'owner' || myProfile?.role === 'owner')) ? (
                        confirmDeleteAdminId === admin.id ? (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button onClick={() => handleDeleteAdmin(admin.id)} disabled={deleting === admin.id} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#e74c3c', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: deleting === admin.id ? 0.5 : 1 }}>
                              {deleting === admin.id ? '⏳' : 'ยืนยันລຍ'}
                            </button>
                            <button onClick={() => setConfirmDeleteAdminId(null)} style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--gray-border)', background: 'transparent', color: 'var(--gray-text)', fontSize: 11, cursor: 'pointer' }}>
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDeleteAdmin(admin.id)}
                            disabled={deleting === admin.id}
                            style={{
                              padding: '5px 10px', borderRadius: 6, border: '1px solid #e74c3c44',
                              background: 'transparent', color: '#e74c3c', fontSize: 11,
                              cursor: 'pointer', opacity: deleting === admin.id ? 0.5 : 1
                            }}
                          >
                            {deleting === admin.id ? '⏳' : '🗑️ ลบ'}
                          </button>
                        )
                      ) : (
                        <span style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Permission Matrix */}
        {can('manage_permissions') && (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--gray-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>📋 ตารางสิทธิ์แยกตาม Role</h3>
              <span style={{ fontSize: 12, color: 'var(--gray-text)' }}>⚠️ เฉพาะ Role ที่ต่ำกว่า Owner สามารถแก้ไขได้</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                <tr>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, color: 'var(--gray-text)', fontWeight: 500 }}>ฟังก์ชั่น</th>
                  {roles.map(r => (
                    <th key={r.id} style={{ padding: '12px 24px', textAlign: 'center', fontSize: 12, color: r.color, fontWeight: 700, width: 120 }}>
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_LIST.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} className="hover-light">
                    <td style={{ padding: '16px 24px', fontSize: 13, fontWeight: 500 }}>{row.label}</td>
                    {roles.map(r => {
                      const isEnabled = rolePerms[r.id]?.includes(row.id)
                      const isOwner = r.id === 'owner'
                      
                      return (
                        <td key={r.id} style={{ padding: '12px 24px', textAlign: 'center' }}>
                          {isOwner ? (
                            <span style={{ fontSize: 16 }}>✅</span>
                          ) : (
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <label className="switch">
                                <input 
                                  type="checkbox" 
                                  checked={isEnabled} 
                                  onChange={() => togglePermission(r.id, row.id)}
                                />
                                <span className="slider round"></span>
                              </label>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {/* ===== CREATE ROLE MODAL ===== */}
      {showCreateRole && (
        <div className="modal-overlay">
          <form onSubmit={handleCreateRole} className="card animate-in" style={{ maxWidth: 450, width: '100%', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>➕ สร้าง Role ใหม่</h2>
              <button type="button" onClick={() => setShowCreateRole(false)} className="close-btn">✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              <div>
                <label className="label">ชื่อที่แสดง (Label) *</label>
                <input required className="input w-full" placeholder="เช่น ผู้ช่วยแอดมิน" value={createRoleForm.label} onChange={e => setCreateRoleForm({...createRoleForm, label: e.target.value})} />
              </div>
              <div>
                <label className="label">คำอธิบาย</label>
                <textarea className="input w-full" style={{ height: 80 }} placeholder="รายละเอียดสิทธิ์..." value={createRoleForm.description} onChange={e => setCreateRoleForm({...createRoleForm, description: e.target.value})} />
              </div>
              <div>
                <label className="label">เลือกไอคอนหรืออัพโหลด (Icon)</label>
                <div style={{ 
                  display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, 
                  marginBottom: 12, padding: 12, borderRadius: 12, 
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' 
                }}>
                  {PREDEFINED_ICONS.map((emoji: string) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setCreateRoleForm({ ...createRoleForm, icon: emoji })}
                      style={{
                        padding: 8, fontSize: 18, background: createRoleForm.icon === emoji ? 'var(--gold-primary)' : 'transparent',
                        border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s',
                        color: createRoleForm.icon === emoji ? 'black' : 'white'
                      }}
                      className="hover-light"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ 
                    width: 44, height: 44, borderRadius: 8, background: 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, border: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    {createRoleForm.icon.startsWith('http') || createRoleForm.icon.startsWith('data:') ? (
                      <img src={createRoleForm.icon} alt="icon" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
                    ) : (
                      createRoleForm.icon
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input 
                      type="text" 
                      className="input w-full" 
                      placeholder="ใส่ Emoji หรือ URL ไอคอน" 
                      value={createRoleForm.icon} 
                      onChange={e => setCreateRoleForm({...createRoleForm, icon: e.target.value})}
                      style={{ marginBottom: 4 }}
                    />
                    <label className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', cursor: 'pointer', display: 'inline-block' }}>
                      📁 อัพโหลดภาพ...
                      <input type="file" hidden accept="image/*" onChange={handleIconUpload} />
                    </label>
                    {saving === 'processing_icon' && <span style={{ fontSize: 10, color: 'var(--gold-primary)', marginLeft: 8 }}>⏳ กำลังอัพโหลด...</span>}
                  </div>
                </div>
              </div>
              <div>
                <label className="label">สีประจำตัว (Role Color)</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <input type="color" className="input" style={{ width: 64, height: 42, padding: 4 }} value={createRoleForm.color} onChange={e => setCreateRoleForm({...createRoleForm, color: e.target.value})} />
                  <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                    {COLOR_PRESETS.map(c => (
                      <button 
                        key={c}
                        type="button"
                        onClick={() => setCreateRoleForm({ ...createRoleForm, color: c })}
                        style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: createRoleForm.color === c ? '2px solid white' : 'none', cursor: 'pointer' }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {error && <div className="error-box">{error}</div>}

            <div className="flex-end gap-12">
              <button type="button" onClick={() => setShowCreateRole(false)} className="btn btn-ghost">ยกเลิก</button>
              <button type="submit" disabled={creatingRole} className="btn btn-primary">
                {creatingRole ? '⏳ กำลังสร้าง...' : '✅ สร้าง Role'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== CREATE ADMIN MODAL ===== */}
      {showCreateAdmin && (
        <div className="modal-overlay">
          <form onSubmit={handleCreateAdmin} className="card animate-in" style={{ maxWidth: 480, width: '100%', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>➕ สร้าง Admin ใหม่</h2>
              <button type="button" onClick={() => setShowCreateAdmin(false)} className="close-btn">✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              <div>
                <label className="label">ชื่อแสดง (Display Name)</label>
                <input className="input w-full" placeholder="เช่น แอดมิน สมใจ" value={createAdminForm.name} onChange={e => setCreateAdminForm({ ...createAdminForm, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Email (ใช้สำหรับล็อกอิน) *</label>
                <input required type="email" className="input w-full" placeholder="admin@asterna.com" value={createAdminForm.email} onChange={e => setCreateAdminForm({ ...createAdminForm, email: e.target.value })} />
              </div>
              <div>
                <label className="label">Password *</label>
                <input required type="password" className="input w-full" placeholder="••••••••" minLength={6} value={createAdminForm.password} onChange={e => setCreateAdminForm({ ...createAdminForm, password: e.target.value })} />
              </div>
              <div>
                <label className="label">Role เริ่มต้น</label>
                <select 
                  className="input w-full"
                  value={createAdminForm.role}
                  onChange={e => setCreateAdminForm({ ...createAdminForm, role: e.target.value })}
                  style={{ color: 'white' }}
                >
                  {roles
                    .filter(r => r.id !== 'owner' || myProfile?.role === 'owner') // Non-owners cannot create owners
                    .map(r => (
                      <option key={r.id} value={r.id} style={{ background: '#1a1a1a', color: 'white' }}>
                        {r.label}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {error && <div className="error-box">{error}</div>}

            <div className="flex-end gap-12">
              <button type="button" onClick={() => setShowCreateAdmin(false)} className="btn btn-ghost">ยกเลิก</button>
              <button type="submit" disabled={creatingAdmin} className="btn btn-primary">
                {creatingAdmin ? '⏳ กำลังสร้าง...' : '✅ สร้าง Admin'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingRole && (
        <div className="modal-overlay" onClick={() => !updatingRole && setEditingRole(null)}>
          <div className="modal-content animate-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: 20, fontWeight: 900 }}>✏️ แก้ไข Role: {editingRole.label}</h3>
              <button className="close-btn" onClick={() => setEditingRole(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              <div>
                <label className="label">ชื่อที่แสดง (Label) *</label>
                <input required className="input w-full" value={editingRole.label} onChange={e => setEditingRole({...editingRole, label: e.target.value})} />
              </div>
              <div>
                <label className="label">คำอธิบาย</label>
                <textarea className="input w-full" rows={2} value={editingRole.description} onChange={e => setEditingRole({...editingRole, description: e.target.value})} />
              </div>
              
              <div>
                <label className="label">เลือกไอคอนหรืออัพโหลด (Icon)</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ 
                    width: 50, height: 50, borderRadius: 8, background: editingRole.color + '22', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, border: `1px dashed ${editingRole.color}44` 
                  }}>
                    {editingRole.icon.startsWith('http') || editingRole.icon.startsWith('data:') ? (
                      <img src={editingRole.icon} alt="icon" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
                    ) : (
                      editingRole.icon
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4, marginBottom: 8 }}>
                      {PREDEFINED_ICONS.map(emoji => (
                        <button 
                          key={emoji}
                          onClick={() => setEditingRole({...editingRole, icon: emoji})}
                          style={{ 
                            background: editingRole.icon === emoji ? 'rgba(255,255,255,0.1)' : 'none',
                            border: 'none', padding: 4, borderRadius: 4, cursor: 'pointer', fontSize: 16
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <label className="btn btn-secondary w-full" style={{ fontSize: 13, padding: '8px 0', borderStyle: 'dashed' }}>
                      📁 {saving === 'processing_icon' ? 'กำลังประมวลผล...' : 'อัพโหลดภาพ...'}
                      <input type="file" accept="image/*" hidden onChange={handleEditIconUpload} />
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="label">สีประจำตัว (Role Color)</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {COLOR_PRESETS.map(c => (
                    <button 
                      key={c} 
                      onClick={() => setEditingRole({...editingRole, color: c})}
                      style={{ 
                        width: 24, height: 24, borderRadius: '50%', background: c, 
                        border: editingRole.color === c ? '2px solid white' : 'none', cursor: 'pointer' 
                      }} 
                    />
                  ))}
                  <input 
                    type="color" 
                    value={editingRole.color} 
                    onChange={e => setEditingRole({...editingRole, color: e.target.value})}
                    style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary flex-1" onClick={() => setEditingRole(null)}>ยกเลิก</button>
              <button 
                className="btn btn-primary flex-1" 
                disabled={updatingRole || !editingRole.label}
                onClick={handleUpdateRole}
                style={{ background: editingRole.color }}
              >
                {updatingRole ? '⏳ กำลังบันทึก...' : '✅ บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmingDeleteRole && (
        <div className="modal-overlay">
          <div className="modal-content animate-in" style={{ maxWidth: 400, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>ยืนยันการลบ Role?</h3>
            <p style={{ color: 'var(--gray-text)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
              คุณต้องการลบ Role <strong style={{ color: confirmingDeleteRole.color }}>{confirmingDeleteRole.label}</strong> ใช่หรือไม่?<br/>
              การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                className="btn" 
                onClick={() => setConfirmingDeleteRole(null)}
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--gray-border)' }}
                disabled={updatingRole}
              >
                ยกเลิก
              </button>
              <button 
                className="btn" 
                onClick={executeDeleteRole}
                style={{ flex: 1, background: '#e74c3c', color: 'white', border: 'none' }}
                disabled={updatingRole}
              >
                {updatingRole ? '⏳ กำลังลบ...' : 'ลบรายการ'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>

    <style jsx global>{`
      .modal-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.85);
        backdrop-filter: blur(8px); display: flex; align-items: flex-start;
        justify-content: center; z-index: 1000; padding: 20px; padding-top: 10vh;
        overflow-y: auto;
      }
      .modal-content {
        background: #111; border: 1px solid var(--gray-border);
        border-radius: 20px; padding: 32px; width: 100%;
        box-shadow: 0 20px 40px rgba(0,0,0,0.4);
      }
      .close-btn { background: none; border: none; color: var(--gray-text); font-size: 20px; cursor: pointer; }
      .label { display: block; font-size: 13px; font-weight: 700; color: var(--gray-text); margin-bottom: 8px; }
      .input {
        background: rgba(255,255,255,0.05); border: 1px solid var(--gray-border);
        border-radius: 8px; padding: 10px 14px; color: white; font-size: 14px;
        outline: none; transition: border-color 0.2s;
      }
      .input:focus { border-color: var(--gold-primary); }
      .role-card-hover { cursor: pointer; transition: all 0.2s ease; }
      .role-card-hover:hover {
        background: rgba(255,255,255,0.06) !important;
        transform: translateY(-4px);
        box-shadow: 0 10px 20px rgba(0,0,0,0.2);
      }
      .delete-role-btn:hover {
        background: rgba(231, 76, 60, 0.2) !important;
        transform: scale(1.1);
      }
      .w-full { width: 100%; }
      .flex-end { display: flex; justify-content: flex-end; }
      .gap-12 { gap: 12px; }
      .error-box { background: rgba(231,76,60,0.12); border: 1px solid #e74c3c55; borderRadius: 8px; padding: 10px 16px; marginBottom: 16px; fontSize: 13px; color: #e74c3c; }

      .switch {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 22px;
      }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider {
        position: absolute; cursor: pointer;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: rgba(255,255,255,0.1);
        transition: .3s; border: 1px solid rgba(255,255,255,0.1);
      }
      .slider:before {
        position: absolute; content: "";
        height: 14px; width: 14px; left: 3px; bottom: 3px;
        background-color: #666; transition: .3s;
      }
      input:checked + .slider {
        background-color: var(--gold-primary);
        border-color: var(--gold-primary);
      }
      input:checked + .slider:before {
        transform: translateX(22px);
        background-color: white;
        box-shadow: 0 0 10px rgba(0,0,0,0.3);
      }
      .slider.round { border-radius: 34px; }
      .slider.round:before { border-radius: 50%; }
    `}</style>
  </>
)
}
