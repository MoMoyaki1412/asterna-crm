'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, BarChart, Bar, Cell, LabelList } from 'recharts'
import Link from 'next/link'

type OrderData = {
  id: number
  total: number
  status: string
  order_date: string
  discount: number
  shipping_cost: number
  customer_name: string
  customer_id: number
  source: string
}

type OrderItemData = {
  order_id: number
  qty: number
  price_at_time: number
  products: {
    id: number
    name: string
    sku: string
    price_retail: number
    cost: number
  } | null
}

type MessageData = {
  id: string
  customer_id: number
  platform: string
  created_at: string
}

const STATUS_LABELS: Record<string, string> = {
  shipped: 'จัดส่งแล้ว',
  pending: 'รอดำเนินการ',
  completed: 'สำเร็จ',
  cancelled: 'ยกเลิก',
}

const STATUS_BADGE: Record<string, string> = {
  shipped: 'badge-green',
  pending: 'badge-gold',
  completed: 'badge-gray',
  cancelled: 'badge-red',
}

const PLATFORM_COLORS: Record<string, string> = {
  Facebook: '#1877F2',
  LINE: '#06C755',
  'LINE OA': '#00B900',
  Instagram: '#E1306C',
  Shopee: '#EE4D2D',
  Lazada: '#000080',
  TikTok: '#FE2C55',
  'Asterna CRM (Manual)': '#C9A84C'
}

const ALL_PLATFORMS = ['Asterna CRM (Manual)', 'Shopee', 'Lazada', 'TikTok', 'Facebook', 'LINE']

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  
  // Raw Data Cache
  const [allOrders, setAllOrders] = useState<OrderData[]>([])
  const [allItems, setAllItems] = useState<OrderItemData[]>([])
  const [allMessages, setAllMessages] = useState<MessageData[]>([])

  // Date Filter State
  const [dateFilter, setDateFilter] = useState<'1D'|'7D'|'30D'|'CUSTOM'|'ALL'>('30D')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')

  // Calculated Metrics
  const [totalSales, setTotalSales] = useState(0)
  const [totalOrders, setTotalOrders] = useState(0)
  const [totalItemsSold, setTotalItemsSold] = useState(0)
  const [totalCost, setTotalCost] = useState(0)
  const [totalProfit, setTotalProfit] = useState(0)
  const [projectedProfit, setProjectedProfit] = useState(0)
  
  const [platformSales, setPlatformSales] = useState<Record<string, number>>({})
  const [platformOrders, setPlatformOrders] = useState<Record<string, number>>({})

  // Admin and Conversation Metrics
  const [adminStats, setAdminStats] = useState<any[]>([])
  const [allAdminProfiles, setAllAdminProfiles] = useState<any[]>([])
  const [conversationChartData, setConversationChartData] = useState<any[]>([])

  // Chart & Tables
  const [chartData, setChartData] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [topCustomers, setTopCustomers] = useState<any[]>([])
  const [recentOrders, setRecentOrders] = useState<OrderData[]>([])

  // Customer Stats (synced from customers table — same as /admin/customers)
  const [customerStats, setCustomerStats] = useState({
    totalCustomers: 0,
    repeatBuyers: 0,
    totalOrdersFromCustomers: 0,
    repeatRate: 0,
  })

  // Filtered repeat stats (updated by date filter, computed from orders)
  const [filteredRepeatBuyers, setFilteredRepeatBuyers] = useState(0)
  const [filteredRepeatRate, setFilteredRepeatRate] = useState(0)
  const [repeatThreshold, setRepeatThreshold] = useState(1) // orders > N
  const [allTimeTopCustomers, setAllTimeTopCustomers] = useState<any[]>([])
  const [topCustomerLimit, setTopCustomerLimit] = useState(10)

  // Initial Fetch
  useEffect(() => {
    async function fetchAllData() {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, total, status, order_date, discount, shipping_cost, customer_id, customer_name, source, admin_id')
        .order('order_date', { ascending: false })

      const { data: items } = await supabase
        .from('order_items')
        .select(`
          order_id,
          qty,
          price_at_time,
          orders!inner(status),
          products (id, name, sku, price_retail, cost)
        `)
        .neq('orders.status', 'cancelled')

      const { data: msgs } = await supabase
        .from('messages')
        .select('id, customer_id, platform, created_at, admin_id')

      const { data: profiles } = await supabase
        .from('admin_profiles')
        .select('*')

      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, total_orders')
        .eq('is_active', true)

      if (orders) setAllOrders(orders as any)
      if (items) setAllItems(items as any)
      if (msgs) setAllMessages(msgs as any)
      if (profiles) setAllAdminProfiles(profiles)

      // Compute customer stats (same logic as /admin/customers page)
      if (customers) {
        const sorted = [...customers].sort((a, b) => (b.total_orders || 0) - (a.total_orders || 0))
        const repeat = customers.filter(c => (c.total_orders || 0) > 1)
        const total = customers.reduce((s, c) => s + (c.total_orders || 0), 0)
        setCustomerStats({
          totalCustomers: customers.length,
          repeatBuyers: repeat.length,
          totalOrdersFromCustomers: total,
          repeatRate: customers.length > 0 ? Math.round((repeat.length / customers.length) * 100) : 0,
        })
        setAllTimeTopCustomers(sorted.slice(0, 100)) // keep top 100 for selector
      }
      
      const now = new Date()
      setCustomEnd(new Date(now.getTime() + 24*60*60*1000).toISOString().split('T')[0])
      setCustomStart(new Date(now.getTime() - 30*24*60*60*1000).toISOString().split('T')[0])
      
      setLoading(false)
    }
    fetchAllData()
  }, [])

  // Apply Filters & Calculate
  useEffect(() => {
    if (loading) return

    // 1. Filter Data by Date
    const now = new Date()
    let startDate = new Date(0)
    let endDate = new Date(now.getTime() + 24*60*60*1000)

    if (dateFilter === '1D') startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000))
    else if (dateFilter === '7D') startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000))
    else if (dateFilter === '30D') startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))
    else if (dateFilter === 'CUSTOM') {
      startDate = customStart ? new Date(customStart) : new Date(0)
      endDate = customEnd ? new Date(new Date(customEnd).getTime() + 24*60*60*1000) : new Date(now.getTime() + 24*60*60*1000)
    }

    const CONFIRMED_STATUSES = ['pending', 'transferred', 'shipped', 'completed']
    const PROJECTED_STATUSES = ['unpaid', 'draft']

    // 1. Confirmed Orders (Main Metrics & Charts)
    const confirmedOrders = allOrders.filter(o => {
      if (!CONFIRMED_STATUSES.includes(o.status)) return false
      const d = new Date(o.order_date)
      return dateFilter === 'CUSTOM' ? (d >= startDate && d <= endDate) : (d >= startDate)
    })

    // 2. Projected Orders (Forecasting Only)
    const projectedOrders = allOrders.filter(o => {
      if (!PROJECTED_STATUSES.includes(o.status)) return false
      const d = new Date(o.order_date)
      return dateFilter === 'CUSTOM' ? (d >= startDate && d <= endDate) : (d >= startDate)
    })

    // 3. All Active Orders (Admin Effort & Recent List)
    const activeOrders = allOrders.filter(o => {
      if (o.status === 'cancelled' || o.status === 'expired') return false
      const d = new Date(o.order_date)
      return dateFilter === 'CUSTOM' ? (d >= startDate && d <= endDate) : (d >= startDate)
    })

    const activeMessages = allMessages.filter(m => {
       const d = new Date(m.created_at)
       return dateFilter === 'CUSTOM' ? (d >= startDate && d <= endDate) : (d >= startDate)
    })
    
    setRecentOrders(activeOrders.slice(0, 10))

    // 2. Aggregate Sales & Platforms
    let salesSum = 0
    const salesByDate: Record<string, number> = {}
    const pSales: Record<string, number> = {}
    const pOrders: Record<string, number> = {}
    
    ALL_PLATFORMS.forEach(p => { pSales[p] = 0; pOrders[p] = 0 })

    confirmedOrders.forEach(o => {
      salesSum += o.total
      const d = new Date(o.order_date)
      const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
      salesByDate[dateStr] = (salesByDate[dateStr] || 0) + o.total

      const source = o.source || 'Asterna CRM (Manual)'
      pSales[source] = (pSales[source] || 0) + o.total
      pOrders[source] = (pOrders[source] || 0) + 1
    })

    setTotalSales(salesSum)
    setTotalOrders(confirmedOrders.length)
    setPlatformSales(pSales)
    setPlatformOrders(pOrders)

    // Chart Formatting
    const chartArr = Object.keys(salesByDate).map(date => ({ date, ยอดขาย: salesByDate[date] }))
    chartArr.sort((a,b) => {
      const [d1, m1, y1] = a.date.split('/')
      const [d2, m2, y2] = b.date.split('/')
      return new Date(parseInt(y1), parseInt(m1)-1, parseInt(d1)).getTime() - new Date(parseInt(y2), parseInt(m2)-1, parseInt(d2)).getTime()
    })
    const formattedChartArr = chartArr.map(item => {
       const [d, m, y] = item.date.split('/')
       const displayStr = parseInt(y) === now.getFullYear() ? `${d}/${m}` : `${d}/${m}/${y.substring(2)}`
       return { date: displayStr, ยอดขาย: item.ยอดขาย }
    })
    if (formattedChartArr.length <= 1) formattedChartArr.unshift({ date: 'เริ่ม', ยอดขาย: 0 })
    setChartData(formattedChartArr)

    // 3. Admin Performance (Real Data)
    const statsByAdmin: Record<string, any> = {}
    
    // Initialize with all real admins
    allAdminProfiles.forEach(p => {
      statsByAdmin[p.id] = { 
        name: p.display_name || p.email, 
        sales: 0, 
        assigned: 0, 
        completed: 0, 
        response: '—', 
        closing: '—' 
      }
    })

    // Group actual orders
    activeOrders.forEach(o => {
      const aid = (o as any).admin_id
      if (aid && statsByAdmin[aid]) {
        statsByAdmin[aid].sales += o.total
        statsByAdmin[aid].assigned += 1
        if (o.status === 'completed' || o.status === 'shipped') {
          statsByAdmin[aid].completed += 1
        }
      }
    })

    setAdminStats(Object.values(statsByAdmin).sort((a,b) => b.sales - a.sales))

    // 4. Conversation Trends by Platform
    const convByDate: Record<string, Record<string, number>> = {}
    activeMessages.forEach(m => {
      const d = new Date(m.created_at)
      const dateStr = `${d.getDate()}/${d.getMonth() + 1}`
      if (!convByDate[dateStr]) convByDate[dateStr] = { date: dateStr } as any
      const platform = m.platform === 'facebook' ? 'Facebook' : m.platform === 'line' ? 'LINE' : m.platform === 'instagram' ? 'Instagram' : m.platform === 'tiktok' ? 'TikTok' : 'Other'
      convByDate[dateStr][platform] = (convByDate[dateStr][platform] || 0) + 1
    })

    const convArr = Object.values(convByDate).sort((a: any, b: any) => {
        const [d1, m1] = a.date.split('/')
        const [d2, m2] = b.date.split('/')
        return new Date(now.getFullYear(), parseInt(m1)-1, parseInt(d1)).getTime() - new Date(now.getFullYear(), parseInt(m2)-1, parseInt(d2)).getTime()
    })
    setConversationChartData(convArr)


    // 5. Aggregate Products & Calculate Profits
    const confirmedIds = new Set(confirmedOrders.map(o => o.id))
    const filteredItems = allItems.filter(i => confirmedIds.has(i.order_id))
    let itemsS = 0, tCost = 0
    const productStats: Record<number, any> = {}

    // First, map orders and calculate their gross subtotals (sum of line items)
    const orderMap: Record<number, OrderData> = {}
    const orderGrossSubtotals: Record<number, number> = {}
    
    confirmedOrders.forEach(o => { 
      orderMap[o.id] = o
      orderGrossSubtotals[o.id] = 0 
    })

    // Pre-calculate gross subtotal for each order to use for proration
    filteredItems.forEach((item: any) => {
      if (orderGrossSubtotals[item.order_id] !== undefined) {
        orderGrossSubtotals[item.order_id] += (item.qty * item.price_at_time)
      }
    })

    filteredItems.forEach((item: any) => {
      itemsS += item.qty
      const product = item.products
      if (!product) return
      
      const ord = orderMap[item.order_id]
      const lineCost = item.qty * (product.cost || 0)
      tCost += lineCost

      // Calculate the "Gross Sales" for this line
      const lineGrossSales = item.qty * item.price_at_time
      
      // Calculate "Net Sale" for this line by pro-rating the order discount
      let lineNetSale = lineGrossSales
      if (ord && ord.discount > 0 && orderGrossSubtotals[ord.id] > 0) {
        const proRatedDiscount = (lineGrossSales / orderGrossSubtotals[ord.id]) * ord.discount
        lineNetSale = lineGrossSales - proRatedDiscount
      }

      if (!productStats[product.id]) {
        productStats[product.id] = { name: product.name, qty: 0, sales: 0, cost: 0, profit: 0 }
      }
      productStats[product.id].qty += item.qty
      productStats[product.id].sales += lineNetSale
      productStats[product.id].cost += lineCost
      productStats[product.id].profit += (lineNetSale - lineCost)
    })

    // Adjust Top Products Profit if they are part of discounted orders
    // Actually, to keep it simple and accurate for top products, 
    // we'll just show Gross Profit but subtract the total discounts from the master Total Profit metric.
    
    setTotalItemsSold(itemsS)
    setTotalCost(tCost)
    
    // Total Profit = (Total Sales - Total Shipping) - Total Cost 
    const totalShipping = confirmedOrders.reduce((sum, o) => sum + (o.shipping_cost || 0), 0)
    const netProfit = (salesSum - totalShipping) - tCost
    setTotalProfit(netProfit)

    // 6. Projected Profit (From Projected Orders only)
    const pendingOrderIds = new Set(projectedOrders.map(o => o.id))
    const pendingItems = allItems.filter(i => pendingOrderIds.has(i.order_id))
    
    let pendingSales = 0
    let pendingShipping = 0
    projectedOrders.forEach(o => {
       pendingSales += o.total
       pendingShipping += o.shipping_cost || 0
    })
    
    let pendingCost = 0
    pendingItems.forEach(item => {
      const product = item.products
      if (product) pendingCost += item.qty * (product.cost || 0)
    })
    setProjectedProfit((pendingSales - pendingShipping) - pendingCost)

    setTopProducts(Object.values(productStats).sort((a: any, b: any) => b.qty - a.qty).slice(0, 5))
    
    // 6. Aggregate Repeat Customers
    const repeatCustomerMap: Record<string, any> = {}
    activeOrders.forEach(o => {
      const key = o.customer_id ? `ID_${o.customer_id}` : `NAME_${o.customer_name}`
      if (!repeatCustomerMap[key]) {
        repeatCustomerMap[key] = { name: o.customer_name, orders: 0, total_spent: 0 }
      }
      repeatCustomerMap[key].orders += 1
      repeatCustomerMap[key].total_spent += o.total
    })
    
    const sortedCustomers = Object.values(repeatCustomerMap)
      .filter((c: any) => c.orders > 1) // Only repeat customers
      .sort((a: any, b: any) => b.orders - a.orders)
      .slice(0, 5)
    
    setTopCustomers(sortedCustomers)

    // 7. Compute filtered repeat buyers & repeat rate from activeOrders
    const ordersPerCustomer: Record<string, number> = {}
    activeOrders.forEach(o => {
      const key = o.customer_id ? `ID_${o.customer_id}` : `NAME_${o.customer_name}`
      ordersPerCustomer[key] = (ordersPerCustomer[key] || 0) + 1
    })
    const uniqueCustomersInRange = Object.keys(ordersPerCustomer).length
    const repeatInRange = Object.values(ordersPerCustomer).filter(v => v > repeatThreshold).length
    setFilteredRepeatBuyers(repeatInRange)
    setFilteredRepeatRate(uniqueCustomersInRange > 0 ? Math.round((repeatInRange / uniqueCustomersInRange) * 100) : 0)

  }, [allOrders, allItems, allMessages, dateFilter, customStart, customEnd, loading, repeatThreshold])

  if (loading) return <div className="page-body animate-in" style={{ padding: 40, textAlign: 'center' }}>⏳ กำลังโหลดแดชบอร์ด...</div>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">📊 ภาพรวมและสถิติ (Admin Dashboard)</span>
      </div>
      
      <div className="page-body animate-in" style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 64 }}>
        
        {/* --- SECTION: ANALYTICS FILTERS --- */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📈 ภาพรวมธุรกิจ (Business Overview)</span>
          </h2>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ background: 'var(--black-deep)', border: '1px solid var(--gray-border)', borderRadius: 8, padding: 4, display: 'flex', gap: 4 }}>
              <button onClick={() => setDateFilter('1D')} className={`btn ${dateFilter==='1D'?'btn-primary':'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13, height: 'auto', minHeight: 0 }}>1 วัน</button>
              <button onClick={() => setDateFilter('7D')} className={`btn ${dateFilter==='7D'?'btn-primary':'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13, height: 'auto', minHeight: 0 }}>7 วัน</button>
              <button onClick={() => setDateFilter('30D')} className={`btn ${dateFilter==='30D'?'btn-primary':'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13, height: 'auto', minHeight: 0 }}>30 วัน</button>
              <button onClick={() => setDateFilter('ALL')} className={`btn ${dateFilter==='ALL'?'btn-primary':'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13, height: 'auto', minHeight: 0 }}>ทั้งหมด</button>
            </div>
            
            <div style={{ display: 'flex', gap: 12, paddingLeft: 16, borderLeft: '1px solid var(--gray-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--gray-text)' }}>เริ่ม</span>
                <input type="date" value={customStart} onChange={e => { setCustomStart(e.target.value); setDateFilter('CUSTOM') }} style={{ background: 'var(--black-card)', border: dateFilter === 'CUSTOM' ? '1px solid var(--gold-primary)' : '1px solid var(--gray-border)', color: '#fff', padding: '6px 10px', borderRadius: 6, fontSize: 12, colorScheme: 'dark' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--gray-text)' }}>ถึง</span>
                <input type="date" value={customEnd} onChange={e => { setCustomEnd(e.target.value); setDateFilter('CUSTOM') }} style={{ background: 'var(--black-card)', border: dateFilter === 'CUSTOM' ? '1px solid var(--gold-primary)' : '1px solid var(--gray-border)', color: '#fff', padding: '6px 10px', borderRadius: 6, fontSize: 12, colorScheme: 'dark' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Top 5 Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
          <div className="animate-in fast" style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 13, color: 'var(--gray-text)', marginBottom: 8, fontWeight: 600 }}>ยอดขายรวม (บาท) 💰</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--gold-primary)' }}>{totalSales.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-text)', marginTop: 4 }}>สุทธิหลังหักส่วนลด</div>
          </div>
          <div className="animate-in fast" style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 13, color: 'var(--gray-text)', marginBottom: 8, fontWeight: 600 }}>จำนวนบิลสั่งซื้อ 📝</div>
            <div style={{ fontSize: 32, fontWeight: 900 }}>{totalOrders}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-text)', marginTop: 4 }}>รายการทั้งหมด</div>
          </div>
          <div className="animate-in fast" style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 13, color: 'var(--gray-text)', marginBottom: 8, fontWeight: 600 }}>สินค้าที่ขายได้ (ชิ้น) 📦</div>
            <div style={{ fontSize: 32, fontWeight: 900 }}>{totalItemsSold}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-text)', marginTop: 4 }}>รวมทุกรายการสินค้า</div>
          </div>
          <div className="animate-in fast" style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 13, color: 'var(--gray-text)', marginBottom: 8, fontWeight: 600 }}>กำไรสุทธิ (บาท) 📈</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--success)' }}>{totalProfit.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-text)', marginTop: 4 }}>Gross Profit Margin</div>
          </div>
          <div className="animate-in fast" style={{ background: 'rgba(201, 169, 110, 0.05)', border: '1px solid var(--gold-dark)', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 13, color: 'var(--gray-text)', marginBottom: 8, fontWeight: 700, display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Profit Forecasting</span>
                <span style={{ fontSize: 16 }}>🔮</span>
              </div>
              <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 400, marginTop: 4 }}>(กำไรคาดการณ์)</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--gold-primary)' }}>{projectedProfit.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-text)', marginTop: 4 }}>จากออร์เดอร์รอดำเนินการ (Pending/Unpaid/Draft)</div>
          </div>
        </div>

        {/* ── Customer Overview Stats (synced with /admin/customers) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <div className="animate-in fast" style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
            <div style={{ fontSize: 32, fontWeight: 900 }}>{customerStats.totalCustomers.toLocaleString()}</div>
            <div style={{ fontSize: 13, color: 'var(--gray-text)', marginTop: 6, fontWeight: 600 }}>ลูกค้าทั้งหมด</div>
          </div>
          <div className="animate-in fast" style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
            <div style={{ fontSize: 32, fontWeight: 900 }}>{customerStats.totalOrdersFromCustomers.toLocaleString()}</div>
            <div style={{ fontSize: 13, color: 'var(--gray-text)', marginTop: 6, fontWeight: 600 }}>ออร์เดอร์รวมทั้งหมด</div>
          </div>
          <div className="animate-in fast" style={{ background: 'var(--black-card)', border: '1px solid var(--gold-dark)', borderRadius: 12, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 28 }}>🔁</div>
              {/* Threshold stepper */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '4px 8px' }}>
                <span style={{ fontSize: 10, color: 'var(--gray-text)', whiteSpace: 'nowrap' }}>&gt;</span>
                <button onClick={() => setRepeatThreshold(t => Math.max(1, t - 1))} style={{ background: 'none', border: 'none', color: 'var(--gray-text)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>-</button>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 14, textAlign: 'center', color: 'var(--gold-primary)' }}>{repeatThreshold}</span>
                <button onClick={() => setRepeatThreshold(t => t + 1)} style={{ background: 'none', border: 'none', color: 'var(--gray-text)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>+</button>
                <span style={{ fontSize: 10, color: 'var(--gray-text)', whiteSpace: 'nowrap' }}>order</span>
              </div>
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, marginTop: 8 }}>{filteredRepeatBuyers.toLocaleString()}</div>
            <div style={{ fontSize: 13, color: 'var(--gray-text)', marginTop: 6, fontWeight: 600 }}>ลูกค้าซื้อซ้ำ (&gt;{repeatThreshold} order)</div>
            <div style={{ fontSize: 10, color: 'var(--gold-primary)', marginTop: 4 }}>📅 ตาม filter: {dateFilter === 'ALL' ? 'ทั้งหมด' : dateFilter === 'CUSTOM' ? `${customStart} – ${customEnd}` : dateFilter}</div>
          </div>
          <div className="animate-in fast" style={{ background: 'var(--black-card)', border: '1px solid var(--gold-dark)', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💛</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--gold-primary)' }}>{filteredRepeatRate}%</div>
            <div style={{ fontSize: 13, color: 'var(--gray-text)', marginTop: 6, fontWeight: 600 }}>Repeat Rate (&gt;{repeatThreshold} order)</div>
            <div style={{ fontSize: 10, color: 'var(--gold-primary)', marginTop: 4 }}>📅 ตาม filter: {dateFilter === 'ALL' ? 'ทั้งหมด' : dateFilter === 'CUSTOM' ? `${customStart} – ${customEnd}` : dateFilter}</div>
          </div>
        </div>

        {/* --- NEW SECTION: ADMIN PERFORMANCE --- */}
        <div style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--gray-border)', background: 'rgba(255,255,255,0.02)' }}>
             <h3 style={{ fontSize: 16, fontWeight: 800 }}>🏠 สถิติการทำงานของแอดมิน (Admin Performance)</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
              <tr>
                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, color: 'var(--gray-text)', fontWeight: 600 }}>แอดมิน</th>
                <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 12, color: 'var(--gray-text)', fontWeight: 600 }}>ยอดขาย (บาท)</th>
                <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 12, color: 'var(--gray-text)', fontWeight: 600 }}>ได้รับมอบหมาย (คน)</th>
                <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 12, color: 'var(--gray-text)', fontWeight: 600 }}>เสร็จแล้ว (คน)</th>
                <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 12, color: 'var(--gray-text)', fontWeight: 600 }}>เวลาตอบสนอง</th>
                <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 12, color: 'var(--gray-text)', fontWeight: 600 }}>ระยะเวลาปิดบิล</th>
              </tr>
            </thead>
            <tbody>
              {adminStats.map((st, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--gray-border)', transition: 'background 0.2s' }} className="hover-light">
                  <td style={{ padding: '16px 24px', fontSize: 14, fontWeight: 700 }}>{st.name}</td>
                  <td style={{ padding: '16px 24px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--gold-primary)' }}>{st.sales.toLocaleString()} ฿</td>
                  <td style={{ padding: '16px 24px', textAlign: 'right', fontSize: 14 }}>{st.assigned}</td>
                  <td style={{ padding: '16px 24px', textAlign: 'right', fontSize: 14, color: 'var(--success)' }}>{st.completed}</td>
                  <td style={{ padding: '16px 24px', textAlign: 'right', fontSize: 14, color: 'var(--gray-text)' }}>{st.response}</td>
                  <td style={{ padding: '16px 24px', textAlign: 'right', fontSize: 14, color: 'var(--gray-text)' }}>{st.closing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* --- NEW SECTION: CONVERSATION CHART --- */}
        <div style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
            <div>
              <h3 style={{ fontSize: 24, fontWeight: 800, color: 'var(--gold-primary)', marginBottom: 4 }}>จำนวนการสนทนา (Conversations)</h3>
              <p style={{ fontSize: 13, color: 'var(--gray-text)' }}>สถิติการทักแชทจากทุกแพลตฟอร์มรายวัน</p>
            </div>
          </div>
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={conversationChartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ecf0f1" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'var(--gray-text)', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--gray-text)', fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: 'none', background: 'var(--black-deep)', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} />
                <Legend iconType="circle" />
                <Line type="monotone" dataKey="Facebook" stroke={PLATFORM_COLORS.Facebook} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="LINE" stroke={PLATFORM_COLORS.LINE} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="Instagram" stroke={PLATFORM_COLORS.Instagram} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="TikTok" stroke={PLATFORM_COLORS.TikTok} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Layout Row 3: Overall Sales Trend (Full Width) */}
        <div className="animate-in" style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold-primary)', marginBottom: 24 }}>📈 กราฟยอดขายรายวัน ({totalSales.toLocaleString()} ฿)</div>
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2ecc71" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#2ecc71" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'var(--gray-text)', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--gray-text)', fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ background: 'var(--black-deep)', border: '1px solid var(--gray-border)', borderRadius: 8 }}
                  formatter={(value: any) => [`${Number(value).toLocaleString()} ฿`, 'ยอดขาย']} 
                />
                <Area type="monotone" dataKey="ยอดขาย" stroke="#2ecc71" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Layout Row 4: Platform Analytics (Sales Amount vs Order Count) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          {/* Platform Performance (Sales Amount) */}
          <div className="animate-in" style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 24 }}>🌐 ยอดขายแยกตามช่องทาง</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {Object.entries(platformSales).sort((a,b) => b[1] - a[1]).map(([platform, amt], idx) => (
                <div key={platform}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span>{platform}</span>
                    <span style={{ fontWeight: 700 }}>{amt.toLocaleString()} ฿</span>
                  </div>
                  <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${totalSales > 0 ? (amt/totalSales*100) : 0}%`, height: '100%', background: PLATFORM_COLORS[platform] || 'var(--success)' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Platform Performance (Order Count) */}
          <div className="animate-in" style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 24 }}>📦 จำนวนการสั่งซื้อแยกตามช่องทาง</div>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={Object.entries(platformOrders).map(([name, value]) => ({ name, value }))}>
                  <XAxis dataKey="name" hide />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ background: 'var(--black-deep)', border: '1px solid var(--gray-border)', borderRadius: 8 }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {Object.keys(platformOrders).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PLATFORM_COLORS[entry] || '#8884d8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 16 }}>
              {Object.entries(platformOrders).filter(([_,v]) => v > 0).map(([platform, count]) => (
                <div key={platform} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: PLATFORM_COLORS[platform] }}></div>
                  <span style={{ color: 'var(--gray-text)' }}>{platform}:</span>
                  <span style={{ fontWeight: 700 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Existing Products and Orders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          {/* Top Selling Products */}
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--gray-border)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>👑 5 อันดับสินค้าขายดี</h3>
            </div>
            {topProducts.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-text)' }}>ยังไม่มีข้อมูลสินค้า</div>
            ) : (
              <div style={{ width: '100%', height: 300, padding: 20 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProducts} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: 'var(--gray-text)', fontSize: 12 }} width={120} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                      contentStyle={{ background: 'var(--black-deep)', border: '1px solid var(--gray-border)', borderRadius: 8 }} 
                      formatter={(val: any) => [`${val} ชิ้น`, 'จำนวนที่ขายได้']} 
                    />
                    <Bar dataKey="qty" radius={[0, 4, 4, 0]} barSize={20}>
                      <LabelList dataKey="qty" position="right" fill="var(--gray-text)" fontSize={12} formatter={(val: any) => `${val} ชิ้น`} />
                      {topProducts.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--gold-primary)' : 'rgba(201, 168, 76, 0.4)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Repeat Customers Ranking */}
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--gray-border)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>💎 อันดับลูกค้าที่ซื้อซ้ำสูงสุด</h3>
            </div>
            {topCustomers.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-text)', fontSize: 14 }}>
                ยังไม่มีข้อมูลลูกค้าที่ซื้อซ้ำในปัจจุบัน
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <tr>
                    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 11, color: 'var(--gray-text)' }}>ชื่อลูกค้า</th>
                    <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: 11, color: 'var(--gray-text)' }}>จำนวนครั้ง</th>
                    <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 11, color: 'var(--gray-text)' }}>ยอดอุดหนุนรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--gray-border)' }}>
                      <td style={{ padding: '16px 24px', fontWeight: 700, fontSize: 14, color: 'var(--white)' }}>{c.name}</td>
                      <td style={{ padding: '16px 24px', textAlign: 'center', fontSize: 14 }}>
                        <span style={{ background: 'rgba(201, 169, 110, 0.1)', color: 'var(--gold-primary)', padding: '4px 10px', borderRadius: 12, fontWeight: 700 }}>
                          🛒 {c.orders} ครั้ง
                        </span>
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--gold-primary)' }}>
                        {c.total_spent.toLocaleString()} ฿
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Bottom Row: Top Customers + Recent Orders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>

          {/* Top Customers (all-time, from customers table) */}
          <div className="card">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800 }}>🏆 Top Customers (ซื้อมากที่สุด)</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                {[10, 50, 100].map(n => (
                  <button key={n} onClick={() => setTopCustomerLimit(n)} style={{
                    padding: '4px 10px', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 700,
                    background: topCustomerLimit === n ? 'var(--gold-primary)' : 'rgba(255,255,255,0.07)',
                    color: topCustomerLimit === n ? '#000' : 'var(--gray-text)',
                    transition: 'all 0.15s'
                  }}>Top {n}</button>
                ))}
              </div>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 420 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'rgba(0,0,0,0.25)', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--gray-text)', fontWeight: 600, width: 36 }}>#</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--gray-text)', fontWeight: 600 }}>ชื่อลูกค้า</th>
                    <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, color: 'var(--gray-text)', fontWeight: 600, whiteSpace: 'nowrap' }}>Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {allTimeTopCustomers.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--gray-text)', fontSize: 13 }}>กำลังโหลด...</td></tr>
                  ) : allTimeTopCustomers.slice(0, topCustomerLimit).map((c: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 16px', color: i < 3 ? 'var(--gold-primary)' : 'var(--gray-text)', fontWeight: 700, fontSize: 12 }}>{i + 1}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: 13, color: 'var(--white)' }}>{c.name || '—'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <span style={{ background: 'rgba(201,169,110,0.12)', color: 'var(--gold-primary)', padding: '2px 8px', borderRadius: 8, fontWeight: 700, fontSize: 11 }}>
                          {c.total_orders} ครั้ง
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Orders */}
          <div className="card">
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--gray-border)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>🧾 ออร์เดอร์ล่าสุด</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentOrders.map(o => (
                <div key={o.id} style={{ padding: '14px 24px', borderBottom: '1px solid var(--gray-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{o.customer_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-text)' }}>#{o.id} • {new Date(o.order_date).toLocaleDateString()}</div>
                  </div>
                  <div style={{ fontWeight: 800, color: 'var(--gold-primary)' }}>{o.total.toLocaleString()} ฿</div>
                </div>
              ))}
            </div>
            <div style={{ padding: 16, textAlign: 'center' }}>
               <Link href="/admin/orders" style={{ fontSize: 12, color: 'var(--gold-primary)', fontWeight: 700, textDecoration: 'none' }}>ดูทั้งหมด →</Link>
            </div>
          </div>

        </div>

      </div>
    </>
  )
}
