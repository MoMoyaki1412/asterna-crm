'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { OrderDetailModal } from '@/components/OrderDetailModal'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/logger'
import { maskPhone, maskAddress } from '@/lib/security'

type Order = {
  id: number
  order_number: string
  customer_name: string
  order_date: string
  status: string
  total: number
  items_summary: string
  tracking: string
  note: string
  source?: string
  bill_type?: string
  invoice_token?: string
  payment_slip_url?: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'แบบร่าง',
  unpaid: 'ยังไม่ได้จ่าย',
  transferred: 'โอนแล้ว',
  pending: 'รอดำเนินการ',
  shipped: 'จัดส่งแล้ว',
  completed: 'สำเร็จ',
  cancelled: 'ยกเลิก',
  expired: 'หมดอายุ',
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-gray',
  unpaid: 'badge-red',
  transferred: 'badge-blue',
  pending: 'badge-gold',
  shipped: 'badge-green',
  completed: 'badge-gold',
  cancelled: 'badge-red',
  expired: 'badge-red',
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filtered, setFiltered] = useState<Order[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [sourceFilter, setSourceFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [billTypeFilter, setBillTypeFilter] = useState('all')
  const [showPrintMenu, setShowPrintMenu] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const { profile: myProfile, can } = useAdminAuth()

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filtered.map(o => o.id))
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const loadOrders = async (silent = false) => {
    if (!silent) setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, order_date, status, total, payment_method, tracking, items_summary, bill_type, expiry_date, invoice_token, payment_slip_url, note, source')
      .order('order_date', { ascending: false })
      .order('id', { ascending: false })
    if (data) {
      setOrders(data)
    }
    if (!silent) setLoading(false)
  }

  useEffect(() => {
    loadOrders()

    const channel = supabase
      .channel('orders_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          // Background refresh without triggering loading spinner
          loadOrders(true)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(orders.filter(o => {
      const matchSearch = o.customer_name?.toLowerCase().includes(q) ||
        o.items_summary?.toLowerCase().includes(q) ||
        o.tracking?.includes(q)
      const matchStatus = statusFilter === 'all' || o.status === statusFilter
      const orderSource = o.source || 'Asterna CRM'
      const matchSource = sourceFilter === 'all' || orderSource === sourceFilter
      const orderDate = o.order_date ? o.order_date.substring(0, 10) : ''
      const matchFrom = !dateFrom || orderDate >= dateFrom
      const matchTo = !dateTo || orderDate <= dateTo
      const bt = o.bill_type || 'normal'
      const matchBillType = billTypeFilter === 'all' || bt === billTypeFilter
      return matchSearch && matchStatus && matchSource && matchFrom && matchTo && matchBillType
    }))
  }, [search, statusFilter, sourceFilter, dateFrom, dateTo, billTypeFilter, orders])

  const totalRevenue = filtered.reduce((s, o) => s + (o.total || 0), 0)

  const deleteOrder = async (id: number) => {
    if (!can('delete_orders') && !can('manage_orders')) {
      toast.error('คุณไม่มีสิทธิ์ลบออร์เดอร์')
      return
    }

    try {
      // 1. Fetch order details before deletion for restoration
      const { data: order } = await supabase.from('orders').select('*').eq('id', id).single()
      if (!order) return
      const { data: items } = await supabase.from('order_items').select('product_id, qty').eq('order_id', id)

      // 2. Reverse Stock Impact (Restore Stock)
      const RESERVE_STATUSES = ['transferred', 'pending']
      const SHIP_STATUSES = ['shipped', 'completed']
      const getImpact = (s: string) => {
        if (RESERVE_STATUSES.includes(s)) return { res: 1, tot: 0, shp: 0 }
        if (SHIP_STATUSES.includes(s)) return { res: 0, tot: -1, shp: 1 }
        return { res: 0, tot: 0, shp: 0 }
      }

      const impact = getImpact(order.status)
      if (items && (impact.res !== 0 || impact.tot !== 0 || impact.shp !== 0)) {
        for (const item of items) {
          await supabase.rpc('handle_stock_impact', {
            p_id: item.product_id,
            diff_res: -(impact.res * item.qty),
            diff_tot: -(impact.tot * item.qty),
            diff_shp: -(impact.shp * item.qty)
          })
        }
      }

      // 3. Restore Coupon/Campaign Usage
      const USED_STATUSES = ['transferred', 'pending', 'shipped', 'completed']
      if (USED_STATUSES.includes(order.status)) {
        if (order.coupon_id) {
          const { data: cp } = await supabase.from('coupons').select('uses_count').eq('id', order.coupon_id).single()
          if (cp) {
            await supabase.from('coupons').update({ uses_count: Math.max(0, cp.uses_count - 1) }).eq('id', order.coupon_id)
          }
        }
        if (order.campaign_id) {
          const { data: camp } = await supabase.from('campaigns').select('uses_count').eq('id', order.campaign_id).single()
          if (camp) {
            await supabase.from('campaigns').update({ uses_count: Math.max(0, (camp as any).uses_count - 1) }).eq('id', order.campaign_id)
          }
        }
      }

      // 4. Perform Deletion
      const { error } = await supabase.from('orders').delete().eq('id', id)
      if (error) throw error

      logActivity(myProfile?.id || 'system', 'DELETE_ORDER', 'orders', id.toString())
      setOrders(prev => prev.filter(o => o.id !== id))
      setFiltered(prev => prev.filter(o => o.id !== id))
      setConfirmDeleteId(null)
      toast.success('ลบออร์เดอร์และคืนสต็อกเรียบร้อยแล้ว')
    } catch (err: any) {
      toast.error('❌ ลบไม่สำเร็จ: ' + err.message)
      setConfirmDeleteId(null)
    }
  }

  const handleExportCSV = () => {
    if (filtered.length === 0) return toast.error('ไม่มีข้อมูลสำหรับส่งออก')
    
    // 1. Define Headers
    const headers = [
      'Order ID', 'วันที่', 'ชื่อลูกค้า', 'รายการสินค้า', 'ที่มา', 
      'ยอดรวม (฿)', 'สถานะ', 'Tracking', 'ประเภทบิล', 'ที่อยู่จัดส่ง', 
      'ตำบล', 'อำเภอ', 'จังหวัด', 'รหัส ปณ.', 'เบอร์โทร', 'หมายเหตุ'
    ]

    // 2. Prep Rows
    const rows = filtered.map(o => {
      // Note: We need additional fields not in the 'Order' type defined at top.
      // Let's rely on the data being fetched in loadOrders (line 79)
      const data: any = o 
      return [
        data.id,
        data.order_date ? new Date(data.order_date).toLocaleDateString('th-TH') : '',
        data.customer_name || '',
        (data.items_summary || '').replace(/,/g, ' | '), // Clean commas for CSV
        data.source || 'Asterna CRM',
        data.total || 0,
        STATUS_LABELS[data.status] || data.status,
        data.tracking || '',
        data.bill_type === 'cf' ? 'ระบบ CF' : 'ปกติ',
        can('view_full_pii') ? (data.shipping_address || '').replace(/,/g, ' ') : maskAddress(data.shipping_address),
        can('view_full_pii') ? (data.address_subdistrict || '').replace(/,/g, ' ') : '(ซ่อนโดยระบบ)',
        can('view_full_pii') ? (data.address_district || '').replace(/,/g, ' ') : '(ซ่อนโดยระบบ)',
        can('view_full_pii') ? (data.address_province || '').replace(/,/g, ' ') : '(ซ่อนโดยระบบ)',
        can('view_full_pii') ? data.address_zipcode || '' : '(ซ่อนโดยระบบ)',
        can('view_full_pii') ? (data.receiver_phone || '') : maskPhone(data.receiver_phone),
        (data.note || '').replace(/\n/g, ' ').replace(/,/g, ' ')
      ]
    })

    // 3. Convert to CSV String
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${val}"`).join(','))
    ].join('\n')

    // 4. Trigger Download with UTF-8 BOM
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `orders_report_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const updateOrderStatus = async (id: number, newStatus: string) => {
    if (!can('manage_orders')) {
      toast.error('คุณไม่มีสิทธิ์เปลี่ยนสถานะออร์เดอร์')
      return
    }

    try {
      // 1. Fetch current status and items for Inventory Sync
      const { data: orderData } = await supabase.from('orders').select('status').eq('id', id).single()
      const oldStatus = orderData?.status || 'pending'
      if (oldStatus === newStatus) return

      const { data: items } = await supabase.from('order_items').select('product_id, qty').eq('order_id', id)
      
      const RESERVE_STATUSES = ['transferred', 'pending']
      const SHIP_STATUSES = ['shipped', 'completed']

      const getImpact = (status: string) => {
        if (RESERVE_STATUSES.includes(status)) return { res: 1, tot: 0, shp: 0 }
        if (SHIP_STATUSES.includes(status)) return { res: 0, tot: -1, shp: 1 }
        return { res: 0, tot: 0, shp: 0 }
      }

      const oldI = getImpact(oldStatus)
      const newI = getImpact(newStatus)
      
      const diffRes = newI.res - oldI.res
      const diffTot = newI.tot - oldI.tot
      const diffShp = newI.shp - oldI.shp

      if (diffRes !== 0 || diffTot !== 0 || diffShp !== 0) {
        for (const item of (items || [])) {
          await supabase.rpc('handle_stock_impact', {
            p_id: item.product_id,
            diff_res: diffRes * item.qty,
            diff_tot: diffTot * item.qty,
            diff_shp: diffShp * item.qty
          })
        }
      }

      // 1.5 Coupon/Campaign Usage Sync (Bulk)
      const USED_STATUSES = ['transferred', 'pending', 'shipped', 'completed']
      const oldIsUsed = USED_STATUSES.includes(oldStatus)
      const newIsUsed = USED_STATUSES.includes(newStatus)
      if (oldIsUsed !== newIsUsed) {
        const { data: fullOrder } = await supabase.from('orders').select('coupon_id, campaign_id').eq('id', id).single()
        const diff = newIsUsed ? 1 : -1
        if (fullOrder?.coupon_id) {
          const { data: cp } = await supabase.from('coupons').select('uses_count').eq('id', fullOrder.coupon_id).single()
          if (cp) await supabase.from('coupons').update({ uses_count: Math.max(0, cp.uses_count + diff) }).eq('id', fullOrder.coupon_id)
        }
        if (fullOrder?.campaign_id) {
          const { data: camp } = await supabase.from('campaigns').select('uses_count').eq('id', fullOrder.campaign_id).single()
          if (camp) await supabase.from('campaigns').update({ uses_count: Math.max(0, (camp as any).uses_count + diff) }).eq('id', fullOrder.campaign_id)
        }
      }

      // 2. Perform Update
      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', id)
      if (error) throw error

      logActivity(myProfile?.id || 'system', 'UPDATE_ORDER_STATUS', 'orders', id.toString(), { status: newStatus })
      setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus } : o))
      setFiltered(filtered.map(o => o.id === id ? { ...o, status: newStatus } : o))
    } catch (err: any) {
      toast.error('❌ อัปเดตสถานะไม่สำเร็จ: ' + err.message)
    }
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">📦 คำสั่งซื้อ</span>
      </div>
      <div className="page-body animate-in">
        <div className="section-header">
          <div>
            <h2 className="section-title">รายการคำสั่งซื้อ</h2>
            <p className="section-sub">
              แสดง {filtered.length} รายการ · รวม {totalRevenue.toLocaleString()} ฿
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
            {(['all', 'draft', 'unpaid', 'transferred', 'pending', 'shipped', 'completed', 'cancelled', 'expired'] as const).map(s => {
              const count = s === 'all' ? orders.length : orders.filter(o => o.status === s).length
              const isActive = statusFilter === s
              return (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setSelectedIds([]) }}
                  style={{
                    padding: '10px 20px',
                    minWidth: 80,
                    background: isActive ? 'var(--gold-primary)' : 'var(--black-card)',
                    border: `1px solid ${isActive ? 'var(--gold-primary)' : 'var(--gray-border)'}`,
                    borderRadius: 8,
                    color: isActive ? '#1a1a1a' : 'var(--gray-text)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, color: isActive ? '#1a1a1a' : '#fff' }}>
                    {count}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2, fontWeight: isActive ? 700 : 400 }}>
                    {s === 'all' ? 'ทั้งหมด' : STATUS_LABELS[s]}
                  </div>
                </button>
              )
            })}
          </div>
          <div style={{ alignSelf: 'center', display: 'flex', gap: 12 }}>
            <button onClick={handleExportCSV} className="btn btn-ghost" style={{ padding: '12px 20px', borderRadius: 12, borderColor: 'var(--gold-dark)', color: 'var(--gold-primary)' }}>
              📊 Export รายงาน
            </button>
            <Link href="/admin/orders/create" className="btn btn-primary" style={{ padding: '12px 24px', borderRadius: 12 }}>
              + เปิดบิลใหม่
            </Link>
          </div>
        </div>

        {/* Middle filter row: date range + source */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--black-card)', border: `1px solid ${(dateFrom || dateTo) ? 'var(--gold-primary)' : 'var(--gray-border)'}`, borderRadius: 8, padding: '8px 14px' }}>
            <span style={{ fontSize: 13, color: 'var(--gray-text)', whiteSpace: 'nowrap' }}>📅 วันที่</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: dateFrom ? '#fff' : 'var(--gray-text)', fontSize: 13, cursor: 'pointer', outline: 'none', colorScheme: 'dark' }}
            />
            <span style={{ fontSize: 13, color: 'var(--gray-text)' }}>–</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: dateTo ? '#fff' : 'var(--gray-text)', fontSize: 13, cursor: 'pointer', outline: 'none', colorScheme: 'dark' }}
            />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }} style={{ background: 'none', border: 'none', color: 'var(--gray-text)', cursor: 'pointer', fontSize: 13, padding: '0 2px' }} title="ล้างวันที่">✕</button>
            )}
          </div>

          <select
            value={sourceFilter}
            onChange={e => { setSourceFilter(e.target.value); setSelectedIds([]) }}
            style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${sourceFilter !== 'all' ? 'var(--gold-primary)' : 'var(--gray-border)'}`, background: 'var(--black-card)', color: sourceFilter !== 'all' ? 'var(--gold-primary)' : 'var(--gray-text)', cursor: 'pointer', fontSize: 13, fontWeight: sourceFilter !== 'all' ? 700 : 400 }}
          >
            <option value="all">🏪 ทุกที่มา</option>
            <option value="Asterna CRM">Asterna CRM</option>
            <option value="Shopee">Shopee</option>
            <option value="Lazada">Lazada</option>
            <option value="Line">Line</option>
          </select>

          {/* Bill type filter */}
          <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--gray-border)' }}>
            {([['all', '📄 ทั้งหมด'], ['normal', 'ปกติ'], ['cf', 'ระบบ CF']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setBillTypeFilter(val)}
                style={{
                  padding: '8px 14px',
                  background: billTypeFilter === val ? 'var(--gold-primary)' : 'var(--black-card)',
                  border: 'none',
                  borderRight: val !== 'cf' ? '1px solid var(--gray-border)' : 'none',
                  color: billTypeFilter === val ? '#1a1a1a' : 'var(--gray-text)',
                  fontWeight: billTypeFilter === val ? 700 : 400,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="search-wrap" style={{ flexWrap: 'wrap', gap: 16, marginBottom: 20, justifyContent: 'space-between' }}>
          <input
            type="search"
            placeholder="🔍 ค้นหาเลขออร์เดอร์, ชื่อลูกค้า หรือสินค้า..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 400, flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--gray-border)', background: 'var(--black-card)', color: '#fff' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(201,168,76,0.1)', padding: '8px 16px', borderRadius: 8, border: '1px solid var(--gold-dark)' }}>
            <span style={{ fontSize: 13, color: 'var(--gold-primary)', fontWeight: 600 }}>
              {selectedIds.length > 0 ? `เลือก ${selectedIds.length} รายการ` : 'ยังไม่ได้เลือก'}
            </span>
            <div style={{ width: 1, height: 20, background: 'var(--gold-dark)' }}></div>
            {/* Print dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                disabled={selectedIds.length === 0}
                onClick={() => setShowPrintMenu(!showPrintMenu)}
                className="btn btn-ghost"
                style={{ fontSize: 13, color: selectedIds.length === 0 ? 'var(--gray-text)' : 'var(--gold-primary)', padding: '4px 8px', opacity: selectedIds.length === 0 ? 0.5 : 1 }}
              >
                🖨️ พิมพ์ ▾
              </button>
              {showPrintMenu && selectedIds.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 8, padding: '4px 0', zIndex: 100, minWidth: 260, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                  {[
                    { key: 'label', icon: '🏷️', label: 'จ่าหน้าผู้รับผู้ส่ง' },
                    { key: 'packing_large', icon: '📦', label: 'ใบแพ็คของพร้อมจ่าหน้า (ใหญ่)' },
                    { key: 'packing_small', icon: '📋', label: 'ใบแพ็คของพร้อมจ่าหน้า (เล็ก)' },
                  ].map(item => (
                    <button
                      key={item.key}
                      onClick={() => {
                        window.open(`/admin/orders/print?type=${item.key}&ids=${selectedIds.join(',')}`, '_blank')
                        setShowPrintMenu(false)
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.15)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {item.icon} {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Status dropdown */}
            <div style={{ position: 'relative' }}>
              <button 
                disabled={selectedIds.length === 0}
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className="btn btn-ghost" 
                style={{ fontSize: 13, color: selectedIds.length === 0 ? 'var(--gray-text)' : 'var(--gold-primary)', padding: '4px 8px', opacity: selectedIds.length === 0 ? 0.5 : 1 }}
              >
                📝 เปลี่ยนสถานะ ▾
              </button>
              {showStatusMenu && selectedIds.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 8, padding: '4px 0', zIndex: 100, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                  {(['draft', 'unpaid', 'transferred', 'pending', 'shipped', 'completed', 'cancelled', 'expired'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => {
                        Promise.all(selectedIds.map(id => updateOrderStatus(id, s)))
                        setSelectedIds([])
                        setShowStatusMenu(false)
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.15)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {confirmBulkDelete ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button 
                  onClick={() => {
                    Promise.all(selectedIds.map(id => deleteOrder(id)))
                    setSelectedIds([])
                    setConfirmBulkDelete(false)
                  }}
                  style={{ fontSize: 13, background: '#e53e3e', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontWeight: 700, cursor: 'pointer' }}
                >
                  ยืนยันลบ {selectedIds.length} รายการ
                </button>
                <button 
                  onClick={() => setConfirmBulkDelete(false)}
                  style={{ fontSize: 13, background: 'transparent', color: 'var(--gray-text)', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button 
                disabled={selectedIds.length === 0}
                onClick={() => setConfirmBulkDelete(true)}
                className="btn btn-ghost" 
                style={{ fontSize: 13, color: selectedIds.length === 0 ? 'var(--gray-text)' : 'var(--danger)', padding: '4px 8px', opacity: selectedIds.length === 0 ? 0.5 : 1 }}
              >
                🗑️ ลบที่เลือก
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-body table-wrap">
            {loading ? (
              <div className="empty-state"><p>⏳ กำลังโหลด...</p></div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="emoji">📭</div>
                <p>ไม่พบออร์เดอร์ที่ตรงกัน</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--black-card)', borderBottom: '1px solid var(--gray-border)' }}>
                    <th style={{ padding: '12px 16px', width: 40, textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={filtered.length > 0 && selectedIds.length === filtered.length}
                        onChange={toggleSelectAll}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--gold-primary)' }}
                      />
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>ออร์เดอร์ / วันที่</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>ลูกค้า</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>สินค้า</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>ที่มา</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>ยอดรวม</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>สถานะ</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Tracking</th>
                    <th style={{ padding: '12px 16px', width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => (
                    <tr key={o.id} onClick={(e) => {
                      const tag = (e.target as HTMLElement).tagName.toLowerCase()
                      if (tag === 'select' || tag === 'option' || tag === 'button' || tag === 'input') return
                      if (confirmDeleteId === o.id) return
                      setSelectedOrderId(o.id)
                    }} style={{ cursor: 'pointer', borderBottom: '1px solid var(--gray-border)', background: selectedIds.includes(o.id) ? 'rgba(201,168,76,0.05)' : 'transparent' }}>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                         <input 
                          type="checkbox" 
                          checked={selectedIds.includes(o.id)}
                          onChange={() => toggleSelect(o.id)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--gold-primary)' }}
                        />
                      </td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: 'var(--gold-primary)', fontSize: 14 }}>{o.order_number || `#${o.id}`}</div>
                        <div style={{ fontSize: 12, color: 'var(--gray-text)', marginTop: 2 }}>{o.order_date ? new Date(o.order_date).toLocaleDateString('th-TH') : '—'}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{o.customer_name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--gray-text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.items_summary || '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ 
                          padding: '4px 8px', 
                          borderRadius: '4px', 
                          fontSize: '11px', 
                          fontWeight: 600,
                          background: o.source === 'Shopee' ? '#EE4D2D' : 
                                      o.source === 'Lazada' ? '#0F136D' : 
                                      o.source === 'Line' ? '#00C300' : 'var(--gray-border)',
                          color: o.source === 'Shopee' || o.source === 'Lazada' || o.source === 'Line' ? '#fff' : 'var(--gray-text)'
                        }}>
                          {o.source || 'Asterna CRM'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--gold-primary)', fontWeight: 700, textAlign: 'right' }}>
                        {(o.total || 0).toLocaleString()} ฿
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <select
                          value={o.status}
                          onChange={(e) => updateOrderStatus(o.id, e.target.value)}
                          className={`badge ${STATUS_BADGE[o.status] || 'badge-gray'}`}
                          style={{ outline: 'none', cursor: 'pointer', appearance: 'auto', paddingRight: '4px', border: 'none', fontWeight: 600 }}
                        >
                          <option value="draft" style={{ color: '#000', background: '#fff' }}>แบบร่าง</option>
                          <option value="unpaid" style={{ color: '#000', background: '#fff' }}>ยังไม่ได้จ่าย</option>
                          <option value="transferred" style={{ color: '#000', background: '#fff' }}>โอนแล้ว</option>
                          <option value="pending" style={{ color: '#000', background: '#fff' }}>รอดำเนินการ</option>
                          <option value="shipped" style={{ color: '#000', background: '#fff' }}>จัดส่งแล้ว</option>
                          <option value="completed" style={{ color: '#000', background: '#fff' }}>สำเร็จ</option>
                          <option value="cancelled" style={{ color: '#000', background: '#fff' }}>ยกเลิก</option>
                          <option value="expired" style={{ color: '#000', background: '#fff' }}>หมดอายุ</option>
                        </select>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--gray-text)' }}>
                        {o.tracking || '—'}
                      </td>
                      <td onClick={e => e.stopPropagation()} style={{ padding: '12px 16px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {confirmDeleteId === o.id ? (
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button
                              onClick={() => deleteOrder(o.id)}
                              style={{
                                background: '#e53e3e',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 6,
                                padding: '4px 10px',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              ยืนยันลบ
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              style={{
                                background: 'none',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                padding: '4px 8px',
                                fontSize: 12,
                                cursor: 'pointer',
                                color: 'var(--gray-text)',
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        ) : (
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (o.invoice_token) {
                                  window.open(`/invoice/${o.invoice_token}`, '_blank')
                                } else {
                                  toast.error('ยังไม่มีแพ็คเกจบิลออนไลน์ (กรุณารัน SQL Script ก่อน หรือรีเฟรชหน้าต่าง)')
                                }
                              }}
                              title="ดูบิลออนไลน์"
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 16,
                                padding: '4px 8px',
                                borderRadius: 6,
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,175,55,0.12)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >
                              📄
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (o.invoice_token) {
                                  navigator.clipboard.writeText(`${window.location.origin}/invoice/${o.invoice_token}`)
                                  toast.success('คัดลอกลิงก์บิลออนไลน์สำเร็จแล้ว!')
                                } else {
                                  toast.error('ยังไม่มีแพ็คเกจบิลออนไลน์ (กรุณารัน SQL Script ก่อน หรือรีเฟรชหน้าต่าง)')
                                }
                              }}
                              title="คัดลอกลิงก์ Invoice"
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 16,
                                padding: '4px 8px',
                                borderRadius: 6,
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,175,55,0.12)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >
                              🔗
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(o.id)}
                              title="ลบออร์เดอร์"
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 16,
                                color: '#e53e3e',
                                padding: '4px 8px',
                                borderRadius: 6,
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(229,62,62,0.12)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >
                              🗑️
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {selectedOrderId && (
        <OrderDetailModal 
          orderId={selectedOrderId} 
          onClose={() => setSelectedOrderId(null)} 
          onSaved={() => {
            setSelectedOrderId(null);
            loadOrders();
          }}
          onStatusChange={() => {
            loadOrders(); // Sync background list when status toggled inside modal
          }}
        />
      )}
    </>
  )
}
