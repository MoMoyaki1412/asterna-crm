'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

export type AdminRole = 'owner' | 'manager' | 'staff' | null

export type AdminProfile = {
  id: string
  email: string
  display_name: string | null
  role: string | null
  avatar_url: string | null
}

type AdminAuthContextType = {
  profile: AdminProfile | null
  role: string | null
  roles: any[]
  loading: boolean
  can: (permission: Permission) => boolean
  refreshProfile: () => Promise<void>
}

// Define all permissions in the system
export type Permission =
  | 'view_dashboard'    // See the analytics dashboard
  | 'view_cost'         // See cost/profit numbers
  | 'edit_products'     // Edit product details (price, cost, ingredients)
  | 'edit_stock'        // Adjust stock levels
  | 'view_orders'       // View all orders
  | 'create_orders'     // Create new orders
  | 'delete_orders'     // Delete/cancel orders
  | 'view_customers'    // View customer list
  | 'edit_customers'    // Edit customer info / tags
  | 'view_conversations'// Access inbox / conversations
  | 'manage_tags'       // Manage customer tiers and tags
  | 'manage_permissions'// Access /admin/permissions page
  | 'view_stock'        // View product stock levels
  | 'view_products'     // View product catalog (basic info)

// Role → Permission mapping (Owner has everything) - FALLBACK ONLY
const FALLBACK_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: [
    'view_dashboard', 'view_cost', 'edit_products', 'edit_stock',
    'view_orders', 'create_orders', 'delete_orders',
    'view_customers', 'edit_customers', 'view_conversations',
    'manage_tags', 'manage_permissions', 'view_stock', 'view_products',
  ],
  manager: [
    'view_dashboard',
    'edit_stock',
    'view_orders', 'create_orders',
    'view_customers', 'edit_customers',
    'view_conversations',
    'manage_tags', 'view_stock', 'view_products',
  ],
  staff: [
    'view_orders', 'create_orders',
    'view_customers',
    'view_conversations',
    'view_products',
  ],
}

const FALLBACK_ROLES = [
  { id: 'owner', label: 'Owner', color: '#C9A84C', icon: '👑' },
  { id: 'manager', label: 'Manager', color: '#2ecc71', icon: '🏠' },
  { id: 'staff', label: 'Staff', color: '#3498db', icon: '👤' },
]

const AdminAuthContext = createContext<AdminAuthContextType>({
  profile: null,
  role: null,
  roles: [],
  loading: true,
  can: () => false,
  refreshProfile: async () => {},
})

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [roles, setRoles] = useState<any[]>(FALLBACK_ROLES)
  const [rolePermissions, setRolePermissions] = useState<Record<string, Permission[]>>(FALLBACK_ROLE_PERMISSIONS)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      // Fetch roles
      const { data: rolesData } = await supabase
        .from('roles')
        .select('*')
        .order('created_at', { ascending: true })
      
      if (rolesData && rolesData.length > 0) {
        setRoles(rolesData)
      }

      // Fetch dynamic permissions first
      const { data: dynamicPerms } = await supabase
        .from('role_permissions')
        .select('role_id, permission')

      if (dynamicPerms && dynamicPerms.length > 0) {
        const permsMap: Record<string, Permission[]> = {}
        dynamicPerms.forEach(p => {
          if (!permsMap[p.role_id]) permsMap[p.role_id] = []
          permsMap[p.role_id].push(p.permission as Permission)
        })
        setRolePermissions(permsMap)
      }

      const { data, error } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error || !data) {
        // Auto-create a profile if none exists (first time login)
        const { data: newProfile } = await supabase
          .from('admin_profiles')
          .insert({
            id: user.id,
            email: user.email!,
            display_name: user.email?.split('@')[0] || 'Admin',
            role: 'staff', // Default to staff for safety
          })
          .select()
          .single()
        
        setProfile(newProfile || null)
      } else {
        setProfile(data)
      }
    } catch (err) {
      console.error('Error fetching admin profile:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [])

  const can = (permission: Permission): boolean => {
    if (!profile?.role) return false
    // Owners always have all permissions as a safety measure
    if (profile.role === 'owner') return true
    
    return rolePermissions[profile.role]?.includes(permission) ?? false
  }

  return (
    <AdminAuthContext.Provider value={{
      profile,
      role: profile?.role ?? null,
      roles,
      loading,
      can,
      refreshProfile: fetchProfile,
    }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  return useContext(AdminAuthContext)
}
