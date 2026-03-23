'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type OrderData = {
  id: number
  customer_name: string
  order_date: string
  status: string
  total: number
  shipping_cost: number
  discount: number
  items_summary: string
  tracking: string
  note: string
  source?: string
  bill_type?: string
  shipping_address?: string
  address_subdistrict?: string
  address_district?: string
  address_province?: string
  address_zipcode?: string
  receiver_name?: string
  receiver_phone?: string
}

type OrderItem = {
  product_id: number
  qty: number
  price_at_time: number
  products?: { name: string; sku: string }
}

// Store info (hardcoded for now — can be moved to settings later)
const STORE = {
  name: 'ASTERNA',
  address: '18/2 ถนนวังพาน ตำบลหัวเวียง อำเภอเมือง',
  province: 'จังหวัดลำปาง 52000',
  phone: '0819605469',
}

function PrintPageContent() {
  const searchParams = useSearchParams()
  const type = searchParams.get('type') || 'label'
  const ids = (searchParams.get('ids') || '').split(',').map(Number).filter(Boolean)

  const [orders, setOrders] = useState<(OrderData & { items: OrderItem[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [storeInfo, setStoreInfo] = useState({
    name: STORE.name,
    brand_name: 'ASTERNA',
    brand_logo: '/for-only-printer-trimmed.png',
    address: STORE.address,
    province: STORE.province,
    phone: STORE.phone,
  })

  useEffect(() => {
    async function load() {
      const { data: setRes } = await supabase.from('system_settings').select('value').eq('key', 'paper_settings').single()
      const loadedStore = { ...storeInfo }
      if (setRes?.value) {
        if (setRes.value.store_name) loadedStore.name = setRes.value.store_name
        if (setRes.value.brand_name) loadedStore.brand_name = setRes.value.brand_name
        if (setRes.value.brand_logo) loadedStore.brand_logo = setRes.value.brand_logo
        if (setRes.value.store_address) loadedStore.address = setRes.value.store_address
        if (setRes.value.store_province) loadedStore.province = setRes.value.store_province
        if (setRes.value.store_phone) loadedStore.phone = setRes.value.store_phone
      }
      setStoreInfo(loadedStore)

      if (ids.length === 0) return
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*')
        .in('id', ids)
        .order('id')

      if (!ordersData) return

      const enriched = await Promise.all(
        ordersData.map(async (o: any) => {
          const { data: items } = await supabase
            .from('order_items')
            .select('*, products(name, sku)')
            .eq('order_id', o.id)
          return { ...o, items: items || [] }
        })
      )

      setOrders(enriched)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a1a', color: '#c9a84c', fontSize: 18 }}>
        ⏳ กำลังเตรียมข้อมูลสำหรับพิมพ์...
      </div>
    )
  }

  const getRecipientAddr = (o: OrderData) => {
    const parts = [o.shipping_address, o.address_subdistrict, o.address_district, o.address_province, o.address_zipcode].filter(Boolean)
    return parts.join(' ')
  }

  const formatDate = (d: string) => {
    if (!d) return ''
    const dt = new Date(d)
    return dt.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const totalItems = (items: OrderItem[]) => items.reduce((s, i) => s + i.qty, 0)

  // ==================== TEMPLATE: Shipping Label (4x6 - 100x150mm) ====================
  const renderLabel = (o: OrderData & { items: OrderItem[] }) => (
    <div key={o.id} className="print-page label-template" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Sender - Clean minimal style */}
      <div style={{ padding: '0 4px', marginBottom: 28 }}>
        <div style={{ fontSize: 9, color: '#666', marginBottom: 6, letterSpacing: '0.02em' }}>*กรณีจัดส่งสินค้าไม่สำเร็จ กรุณาส่งคืนตามที่อยู่ผู้ส่ง</div>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.04em' }}>ผู้ส่ง</div>
        <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{storeInfo.address} {storeInfo.province}</div>
        <div style={{ fontSize: 13 }}>({storeInfo.phone})</div>
      </div>

      {/* Receiver - Refined border */}
      <div style={{ border: '1.5px solid #222', padding: '18px 16px', position: 'relative', marginTop: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' }}>ผู้รับ</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{o.receiver_name || o.customer_name}</div>
        <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>{getRecipientAddr(o)}</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>({o.receiver_phone || o.tracking || '-'})</div>
      </div>

      {/* Footer - Premium branding */}
      <div style={{ marginTop: 'auto', padding: '12px 4px 0', borderTop: '1px solid #eee' }}>
        <div style={{ fontSize: 9, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>สินค้าจากร้าน</div>
        {storeInfo.brand_logo ? (
          <img src={storeInfo.brand_logo} alt="Brand" style={{ height: 54, maxWidth: 187, objectFit: 'contain', display: 'block' }} />
        ) : (
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.12em' }}>{storeInfo.brand_name}</div>
        )}
      </div>
    </div>
  )

  // ==================== TEMPLATE: Packing List Large (A4) ====================
  const renderPackingLarge = (o: OrderData & { items: OrderItem[] }) => (
    <div key={o.id} className="print-page packing-large-template">
      {/* Sender */}
      <div style={{ border: '1px solid #999', padding: 16, marginBottom: 16, position: 'relative' }}>
        <div style={{ fontSize: 10, color: '#000', marginBottom: 4 }}>*กรณีสินค้าไม่สำเร็จ กรุณาส่งคืนตามที่อยู่นี้</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>ผู้ส่ง</div>
        <div style={{ fontSize: 14 }}>{storeInfo.address}</div>
        <div style={{ fontSize: 14 }}>{storeInfo.province}</div>
        <div style={{ fontSize: 14 }}>({storeInfo.phone})</div>
      </div>

      {/* Receiver */}
      <div style={{ border: '2px solid #000', padding: 16, position: 'relative', marginBottom: 24 }}>
        <div style={{ position: 'absolute', top: 8, right: 8, background: '#000', color: '#fff', padding: '4px 12px', fontWeight: 700, fontSize: 14 }}>
          #{o.id}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>ผู้รับ</div>
        <div style={{ fontSize: 15, marginTop: 4 }}>{o.receiver_name || o.customer_name}</div>
        <div style={{ fontSize: 14 }}>{getRecipientAddr(o)}</div>
        <div style={{ fontSize: 14 }}>({o.receiver_phone || o.tracking || '-'})</div>
      </div>

      {/* Footer brand */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: '#000' }}>สินค้าจากร้าน</div>
        {storeInfo.brand_logo ? (
          <img src={storeInfo.brand_logo} alt="Brand" style={{ height: 40, objectFit: 'contain' }} />
        ) : (
          <div style={{ fontSize: 22, fontWeight: 700 }}>{storeInfo.brand_name}</div>
        )}
      </div>

      {/* Packing list */}
      <div style={{ borderTop: '2px solid #000', paddingTop: 16 }}>
        <h3 style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>ใบจัดเตรียมของ (Stock Preparing List)</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 12, color: '#000' }}>
          <span>จำนวนสินค้าสั่งทั้งหมด : {o.items.length} ชนิด {totalItems(o.items)} ชิ้น</span>
          <span style={{ background: '#000', color: '#fff', padding: '2px 10px', fontWeight: 700, fontSize: 13 }}>#{o.id}</span>
        </div>
        <div style={{ fontSize: 11, marginBottom: 8, color: '#000' }}>พิมพ์เมื่อ : {formatDate(o.order_date)}</div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f0f0f0', borderBottom: '2px solid #000' }}>
              <th style={{ padding: 8, textAlign: 'center', width: 40 }}>ลำดับ</th>
              <th style={{ padding: 8, textAlign: 'left' }}>รายการ</th>
              <th style={{ padding: 8, textAlign: 'center', width: 100 }}>แบบสินค้า / SKU</th>
              <th style={{ padding: 8, textAlign: 'right', width: 70 }}>ราคา</th>
              <th style={{ padding: 8, textAlign: 'center', width: 60 }}>จำนวน</th>
              <th style={{ padding: 8, textAlign: 'right', width: 80 }}>รวม</th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: 8, textAlign: 'center' }}>{i + 1}</td>
                <td style={{ padding: 8 }}>{item.products?.name || `Product#${item.product_id}`}</td>
                <td style={{ padding: 8, textAlign: 'center', fontSize: 11 }}>{item.products?.sku || '-'}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{item.price_at_time?.toLocaleString()}</td>
                <td style={{ padding: 8, textAlign: 'center' }}>{item.qty} ชิ้น</td>
                <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{(item.price_at_time * item.qty).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #000' }}>
              <td colSpan={5} style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>ยอดรวมสินค้า</td>
              <td style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>{o.items.reduce((s, i) => s + i.price_at_time * i.qty, 0).toLocaleString()}</td>
            </tr>
            {(o.shipping_cost || 0) > 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 8, textAlign: 'right' }}>ค่าจัดส่ง</td>
                <td style={{ padding: 8, textAlign: 'right' }}>+{o.shipping_cost.toLocaleString()}</td>
              </tr>
            )}
            {(o.discount || 0) > 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 8, textAlign: 'right', color: '#000' }}>ส่วนลด</td>
                <td style={{ padding: 8, textAlign: 'right', color: '#000' }}>-{o.discount.toLocaleString()}</td>
              </tr>
            )}
            <tr style={{ borderTop: '2px solid #000' }}>
              <td colSpan={5} style={{ padding: 8, textAlign: 'right', fontWeight: 700, fontSize: 15 }}>ยอดรวมสุทธิ</td>
              <td style={{ padding: 8, textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{o.total.toLocaleString()} ฿</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )

  // ==================== TEMPLATE: Packing List Small (4x6 thermal) ====================
  const renderPackingSmall = (o: OrderData & { items: OrderItem[] }) => (
    <div key={o.id} className="print-page packing-small-template" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Sender */}
      <div style={{ marginBottom: 16, fontSize: 13 }}>
        <span style={{ fontWeight: 700 }}>ผู้ส่ง:</span> {storeInfo.name}
        <div>{storeInfo.address} {storeInfo.province} ({storeInfo.phone})</div>
      </div>

      {/* Receiver */}
      <div style={{ border: '2px solid #000', padding: 12, position: 'relative', marginBottom: 16 }}>
        <div style={{ position: 'absolute', top: 8, right: 8, fontWeight: 700, fontSize: 14 }}>#{o.id}</div>
        <div style={{ fontSize: 13 }}>ผู้รับ: {o.receiver_name || o.customer_name}</div>
        <div style={{ fontSize: 12 }}>{getRecipientAddr(o)}</div>
        <div style={{ fontSize: 12 }}>โทร: {o.receiver_phone || o.tracking || '-'}</div>
      </div>

      {/* Item list — no prices */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #000' }}>
            <th style={{ padding: 4, textAlign: 'left', width: 20 }}>#</th>
            <th style={{ padding: 4, textAlign: 'left' }}>ชื่อสินค้า</th>
            <th style={{ padding: 4, textAlign: 'center', width: 100 }}>ชื่อแบบสินค้า</th>
            <th style={{ padding: 4, textAlign: 'right', width: 50 }}>จำนวน</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((item, i) => (
            <tr key={i}>
              <td style={{ padding: 4 }}>{i + 1}.</td>
              <td style={{ padding: 4 }}>{item.products?.name || `Product#${item.product_id}`}</td>
              <td style={{ padding: 4, textAlign: 'center', fontSize: 11 }}>{item.products?.sku || ''}</td>
              <td style={{ padding: 4, textAlign: 'right' }}>{item.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 'auto', fontSize: 10, color: '#000', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <span>Print Time: {new Date().toLocaleString('th-TH')}</span>
        <div style={{ textAlign: 'right' }}>
          {storeInfo.brand_logo ? (
            <img src={storeInfo.brand_logo} alt="Brand" style={{ height: 32, objectFit: 'contain' }} />
          ) : (
            <div style={{ fontSize: 14, fontWeight: 700 }}>{storeInfo.brand_name}</div>
          )}
        </div>
      </div>
    </div>
  )


  return (
    <>
      <style jsx global>{`
        /* Reset and aggressive hide for print */
        @media print {
          body, html { background: #fff !important; margin: 0; padding: 0; }
          .sidebar, header, nav, .print-bar, .no-print { display: none !important; }
          .main-content { margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; min-height: 0 !important; }
          .admin-layout { display: block !important; }
          
          /* Forced page breaks */
          .print-page { 
            width: 100%;
            height: 98vh; /* Fits perfectly within browser margins */
            max-height: 98vh;
            page-break-inside: avoid;
            break-inside: avoid;
            box-sizing: border-box; 
            overflow: hidden; 
          }
          .print-page:not(:last-child) {
            break-after: page; 
            page-break-after: always; 
          }

          /* -------------------------------------
             Dynamic Page Sizes for XPrinter
             ------------------------------------- */
          @page { margin: 2mm; }
        }
        
        /* Base styles for all templates */
        .print-page {
          font-family: 'Sarabun', 'Inter', 'Helvetica Neue', 'Helvetica', sans-serif;
          background: #fff;
          color: #000;
          box-sizing: border-box;
          position: relative;
          line-height: 1.5;
        }
        .print-page * {
          color: #000 !important;
        }

        /* Screen Preview */
        @media screen {
          body { background: #2a2a2a; }
          .print-wrapper { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px; padding-top: 80px; }
          .print-page {
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            background: #fff;
            border-radius: 2px;
          }
          .label-template { width: 100mm; height: 150mm; padding: 12mm; }
          .packing-large-template { width: 210mm; min-height: 297mm; padding: 15mm; }
          .packing-small-template { width: 100mm; height: 150mm; padding: 6mm; }
        }

        /* Print formatting */
        @media print {
          .label-template { padding: 4mm; }
          .packing-large-template { padding: 0; }
          .packing-small-template { padding: 2mm; }
        }
      `}</style>

      {/* Print Bar */}
      <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, background: '#1a1a1a', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 999, borderBottom: '2px solid #c9a84c' }}>
        <span style={{ color: '#c9a84c', fontWeight: 700, fontSize: 15 }}>
          🖨️ พิมพ์: {type === 'label' ? 'จ่าหน้าผู้รับผู้ส่ง' : type === 'packing_large' ? 'ใบแพ็คของ (ใหญ่)' : 'ใบแพ็คของ (เล็ก)'} — {orders.length} รายการ
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => window.print()} style={{ background: '#c9a84c', color: '#1a1a1a', border: 'none', padding: '8px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>🖨️ พิมพ์เลย</button>
          <button onClick={() => window.close()} style={{ background: 'transparent', color: '#999', border: '1px solid #555', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>ปิด</button>
        </div>
      </div>
      <div className="no-print" style={{ paddingTop: 60 }}></div>

      {/* Render templates */}
      <div className="print-wrapper">
        {orders.map(o => {
          switch (type) {
            case 'label': return renderLabel(o)
            case 'packing_large': return renderPackingLarge(o)
            case 'packing_small': return renderPackingSmall(o)
            default: return renderLabel(o)
          }
        })}
      </div>
    </>
  )
}

export default function PrintPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a1a', color: '#c9a84c', fontSize: 18 }}>⏳ กำลังโหลด...</div>}>
      <PrintPageContent />
    </Suspense>
  )
}

