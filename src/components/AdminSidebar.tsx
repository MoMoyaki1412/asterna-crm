'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/contexts/AdminAuthContext'



export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, role, roles, loading, can } = useAdminAuth()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  const roleInfo = roles.find(r => r.id === role)

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>ASTERNA</h1>
        <p>Commerce Management</p>
      </div>
      <nav className="sidebar-nav">
        <p className="nav-section-title">เมนูหลัก</p>

        {/* Dashboard - Owner & Manager only */}
        {can('view_dashboard') && (
          <Link href="/admin" className={`nav-item ${isActive('/admin') ? 'active' : ''}`}>
            <span className="icon">📊</span>Dashboard
          </Link>
        )}

        {/* Conversations - All roles */}
        {can('view_conversations') && (
          <Link href="/admin/conversations" className={`nav-item ${isActive('/admin/conversations') ? 'active' : ''}`}>
            <span className="icon">💬</span>การสนทนา
          </Link>
        )}

        {/* Customers - All roles */}
        {can('view_customers') && (
          <Link href="/admin/customers" className={`nav-item ${isActive('/admin/customers') ? 'active' : ''}`}>
            <span className="icon">👥</span>ลูกค้า
          </Link>
        )}

        {/* Orders - All roles */}
        {can('view_orders') && (
          <Link href="/admin/orders" className={`nav-item ${isActive('/admin/orders') ? 'active' : ''}`}>
            <span className="icon">📦</span>คำสั่งซื้อ
          </Link>
        )}

        {/* Products - Any product-related permission */}
        {(can('view_products') || can('edit_stock') || can('edit_products') || can('view_cost') || can('view_stock')) && (
          <Link href="/admin/products" className={`nav-item ${isActive('/admin/products') ? 'active' : ''}`}>
            <span className="icon">✨</span>สินค้า
          </Link>
        )}

        {/* Tags - Owner & Manager only */}
        {can('manage_tags') && (
          <Link href="/admin/tags" className={`nav-item ${isActive('/admin/tags') ? 'active' : ''}`}>
            <span className="icon">🏷️</span>จัดการแท็ก/ระดับ
          </Link>
        )}

        {/* Campaigns - Owner & Manager only */}
        {can('manage_tags') && (
          <Link href="/admin/campaigns" className={`nav-item ${isActive('/admin/campaigns') ? 'active' : ''}`}>
            <span className="icon">🎯</span>แคมเปญส่วนลด
          </Link>
        )}

        {/* Coupons - Owner & Manager only */}
        {can('manage_tags') && (
          <Link href="/admin/coupons" className={`nav-item ${isActive('/admin/coupons') ? 'active' : ''}`}>
            <span className="icon">🎟️</span>คูปอง
          </Link>
        )}

        {/* Permissions - Owner only */}
        {can('manage_permissions') && (
          <>
            <p className="nav-section-title" style={{ marginTop: 16 }}>ผู้ดูแลระบบ</p>
            <Link href="/admin/permissions" className={`nav-item ${isActive('/admin/permissions') ? 'active' : ''}`}>
              <span className="icon">🔐</span>จัดการสิทธิ์
            </Link>
            <Link href="/admin/settings/bank" className={`nav-item ${isActive('/admin/settings/bank') ? 'active' : ''}`}>
              <span className="icon">🏦</span>ตั้งค่าบัญชีธนาคาร
            </Link>
            <Link href="/admin/settings/paper" className={`nav-item ${isActive('/admin/settings/paper') ? 'active' : ''}`}>
              <span className="icon">🖨️</span>ตั้งค่าหน้ากระดาษ
            </Link>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        {/* Role Badge */}
        {!loading && profile && (
          <div style={{
            margin: '0 16px 12px',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--gray-text)', marginBottom: 4 }}>ล็อกอินในฐานะ</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{profile.display_name || profile.email}</div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: 1,
              color: roleInfo?.color || '#999', background: `${roleInfo?.color || '#999'}22`,
              padding: '2px 8px', borderRadius: 4, marginTop: 4, border: `1px solid ${roleInfo?.color || '#999'}44`
            }}>
              {roleInfo?.icon && (
                <span style={{ display: 'inline-flex', width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
                  {roleInfo.icon.startsWith('http') || roleInfo.icon.startsWith('data:') ? (
                    <img src={roleInfo.icon} alt="icon" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    roleInfo.icon === 'crown' ? '👑' : roleInfo.icon
                  )}
                </span>
              )}
              {(roleInfo?.label || role || 'Staff').toUpperCase()}
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="nav-item"
          style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left' }}
        >
          <span className="icon">🚪</span>
          ออกจากระบบ
        </button>
      </div>
    </aside>
  )
}
