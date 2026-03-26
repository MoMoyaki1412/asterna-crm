'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type CustomerRow = { name: string; total_orders: number }

type Stats = {
  totalCustomers: number
  repeatBuyers: number
  topCustomers: CustomerRow[]
  topRepeatBuyers: CustomerRow[]
  totalOrders: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalCustomers: 0,
    repeatBuyers: 0,
    topCustomers: [],
    topRepeatBuyers: [],
    totalOrders: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // ใช้ query เดียวกับหน้า /admin/customers เพื่อให้ข้อมูล sync กัน
      const { data: customers } = await supabase
        .from('customers')
        .select('*')
        .eq('is_active', true)
        .order('total_orders', { ascending: false })

      if (customers) {
        const repeat = customers.filter(c => (c.total_orders || 0) > 1)
        const total = customers.reduce((s, c) => s + (c.total_orders || 0), 0)
        setStats({
          totalCustomers: customers.length,
          repeatBuyers: repeat.length,
          topCustomers: customers.slice(0, 10),
          topRepeatBuyers: repeat.slice(0, 10),
          totalOrders: total,
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div style={{ padding: 32, color: 'var(--gold-primary)' }}>
      ⏳ กำลังโหลดข้อมูล...
    </div>
  )

  const repeatRate = stats.totalCustomers > 0
    ? Math.round((stats.repeatBuyers / stats.totalCustomers) * 100)
    : 0

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">📊 Dashboard</span>
      </div>
      <div className="page-body animate-in">
        <div className="section-header" style={{ marginBottom: 24 }}>
          <div>
            <h2 className="section-title">ภาพรวมระบบ</h2>
            <p className="section-sub">ข้อมูลอัปเดตแบบ Real-time จากฐานข้อมูล</p>
          </div>
        </div>

        {/* ── 4 Stat Cards ── */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-value">{stats.totalCustomers.toLocaleString()}</div>
            <div className="stat-label">ลูกค้าทั้งหมด</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🔁</div>
            <div className="stat-value">{stats.repeatBuyers.toLocaleString()}</div>
            <div className="stat-label">ลูกค้าซื้อซ้ำ (&gt;1 ออร์เดอร์)</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📦</div>
            <div className="stat-value">{stats.totalOrders.toLocaleString()}</div>
            <div className="stat-label">ออร์เดอร์รวมทั้งหมด</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">💛</div>
            <div className="stat-value">{repeatRate}%</div>
            <div className="stat-label">Repeat Rate</div>
          </div>
        </div>

        {/* ── Tables Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginTop: 24 }}>

          {/* 🏆 Top Customers (ซื้อมากที่สุด — รวมทุกคน) */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">🏆 Top Customers (ซื้อมากที่สุด)</span>
            </div>
            <div className="card-body table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>ชื่อลูกค้า</th>
                    <th>ออร์เดอร์</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topCustomers.map((c, i) => (
                    <tr key={i}>
                      <td style={{ color: i < 3 ? 'var(--gold-primary)' : 'var(--gray-text)', fontWeight: 700 }}>
                        {i + 1}
                      </td>
                      <td>{c.name}</td>
                      <td>
                        <span className="badge badge-gold">{c.total_orders} ครั้ง</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 💎 อันดับลูกค้าที่ซื้อซ้ำสูงสุด (เฉพาะ repeat buyers) */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">💎 อันดับลูกค้าที่ซื้อซ้ำสูงสุด</span>
            </div>
            <div className="card-body table-wrap">
              {stats.topRepeatBuyers.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--gray-text)', fontSize: 13 }}>
                  ยังไม่มีข้อมูลลูกค้าที่ซื้อซ้ำ
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>ชื่อลูกค้า</th>
                      <th>ออร์เดอร์</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topRepeatBuyers.map((c, i) => (
                      <tr key={i}>
                        <td style={{ color: i < 3 ? '#C9A84C' : 'var(--gray-text)', fontWeight: 700 }}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                        </td>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td>
                          <span style={{
                            background: 'rgba(201,168,76,0.15)',
                            color: 'var(--gold-primary)',
                            borderRadius: 8,
                            padding: '2px 8px',
                            fontSize: 11,
                            fontWeight: 700,
                          }}>
                            🔁 {c.total_orders} ครั้ง
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ✨ สินค้า Asterna */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">✨ สินค้า Asterna</span>
            </div>
            <div className="card-body">
              {[
                { name: 'REJU GOLD SERUM', sku: 'A02', price: 500, cost: 280 },
                { name: 'ANTI-WRINKLE LIFTING CREAM', sku: 'A01', price: 500, cost: 200 },
                { name: 'CLEANSING MILK', sku: 'A03', price: 200, cost: 100 },
                { name: 'SUNSCREEN FOUNDATION', sku: 'A04', price: 300, cost: 150 },
              ].map(p => (
                <div key={p.sku} style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)'
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-text)', marginTop: 2 }}>{p.sku}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--gold-primary)', fontWeight: 700 }}>{p.price} ฿</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-text)' }}>ต้นทุน {p.cost} ฿</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
