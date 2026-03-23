'use client'
import AdminSidebar from '@/components/AdminSidebar'
import { AdminAuthProvider } from '@/contexts/AdminAuthContext'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <div className="admin-layout">
        <AdminSidebar />
        <main className="main-content">
          {children}
        </main>
      </div>
    </AdminAuthProvider>
  )
}
