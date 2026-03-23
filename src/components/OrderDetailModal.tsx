'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { CustomerSelect, Customer } from '@/components/CustomerSelect'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import toast from 'react-hot-toast'

type Product = {
  id: number
  name: string
  sku: string
  price_retail: number
  price_dealer: number
  price_online: number
  stock_total: number
  stock_reserved: number
  stock_shipped: number
  active_ingredients: string[]
}

type LineItem = {
  product: Product
  qty: number
}

type Campaign = {
  id: number
  name: string
  discount_amount: number | null
  discount_percent: number | null
}

type Coupon = {
  id: number
  code: string
  name: string
  discount_amount: number | null
  discount_percent: number | null
  max_uses: number | null
  uses_count: number
  expires_at: string | null
  is_active: boolean
}

type BankAccount = {
  id: number
  bank_name: string
  account_name: string
  account_no: string
  is_active: boolean
}

export function OrderDetailModal({ orderId, onClose, onSaved, onStatusChange }: { orderId: number,  onClose: () => void
  onSaved?: () => void
  onStatusChange?: () => void
}
) {
  const { profile } = useAdminAuth()
  
  // Data State
  const [products, setProducts] = useState<Product[]>([])
  const [tiers, setTiers] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [banks, setBanks] = useState<BankAccount[]>([])

  // Form State: Col 1
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [shippingCost, setShippingCost] = useState(0)
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null)
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null)
  const [couponStatus, setCouponStatus] = useState<{ok: boolean; msg: string} | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [note, setNote] = useState('')

  // Form State: Col 2 (Payment & Status)
  const [orderDate, setOrderDate] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [targetBankId, setTargetBankId] = useState<number | null>(null)
  const [orderStatus, setOrderStatus] = useState('pending')
  const [statusSaving, setStatusSaving] = useState(false)
  const [source, setSource] = useState('')
  const [billType, setBillType] = useState('normal')
  const [expiryDate, setExpiryDate] = useState('')
  const [invoiceToken, setInvoiceToken] = useState('')
  const [paymentSlipUrl, setPaymentSlipUrl] = useState('')

  // Form State: Col 3 (Customer & Shipping)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [receiverName, setReceiverName] = useState('')
  const [receiverPhone, setReceiverPhone] = useState('')
  const [addressLine, setAddressLine] = useState('')
  const [subdistrict, setSubdistrict] = useState('')
  const [district, setDistrict] = useState('')
  const [province, setProvince] = useState('')
  const [zipcode, setZipcode] = useState('')
  const [tracking, setTracking] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function init() {
      // 1. Fetch system data
      const [pRes, tRes, cRes, bRes] = await Promise.all([
        supabase.from('products').select('*').order('id'),
        supabase.from('customer_tiers').select('*'),
        supabase.from('campaigns').select('*').eq('is_active', true).order('name'),
        supabase.from('bank_accounts').select('*').eq('is_active', true).order('bank_name')
      ])
      if (pRes.data) setProducts(pRes.data)
      if (tRes.data) setTiers(tRes.data)
      if (cRes.data) setCampaigns(cRes.data)
      if (bRes.data) setBanks(bRes.data)

      // 2. Fetch order data
      const { data: oData } = await supabase.from('orders').select('*, invoice_token, payment_slip_url').eq('id', orderId).single()
      if (!oData) return

      // Map basic fields
      setShippingCost(oData.shipping_cost || 0)
      setSelectedCampaignId(oData.campaign_id || null)
      setNote(oData.note || '')
      setOrderDate(oData.order_date ? new Date(oData.order_date).toISOString().split('T')[0] : '')
      setPaymentMethod(oData.payment_method || 'bank_transfer')
      setTargetBankId(oData.target_bank_id || null)
      setOrderStatus(oData.status || 'pending')
      setSource(oData.source || '')
      setBillType(oData.bill_type || 'normal')
      setExpiryDate(oData.expiry_date ? new Date(oData.expiry_date).toISOString().split('T')[0] : '')
      setTracking(oData.tracking || '')
      setInvoiceToken(oData.invoice_token || '')
      setPaymentSlipUrl(oData.payment_slip_url || '')
      
      setAddressLine(oData.shipping_address || '')
      setSubdistrict(oData.address_subdistrict || '')
      setDistrict(oData.address_district || '')
      setProvince(oData.address_province || '')
      setZipcode(oData.address_zipcode || '')
      
      // AUTO-EXPIRY CHECK: If status is draft/unpaid and expiry_date has passed
      if (oData.expiry_date && (oData.status === 'draft' || oData.status === 'unpaid')) {
        const expDate = new Date(oData.expiry_date)
        if (expDate < new Date()) {
          // Update status to expired in DB and State
          await supabase.from('orders').update({ status: 'expired' }).eq('id', orderId)
          setOrderStatus('expired')
          if (onStatusChange) onStatusChange()
        }
      }

      if (oData.coupon_id) {
        const { data: qCoupon } = await supabase.from('coupons').select('*').eq('id', oData.coupon_id).single()
        if (qCoupon) {
          setAppliedCoupon(qCoupon)
          setCouponCode(qCoupon.code)
          setCouponStatus({ ok: true, msg: `✓ ${qCoupon.name} (คูปองที่ใช้แล้ว)` })
        }
      }

      // Fetch Customer
      if (oData.customer_id) {
        const { data: cData } = await supabase.from('customers').select('*').eq('id', oData.customer_id).single()
        if (cData) {
          setCustomer(cData)
          setReceiverName(oData.receiver_name || oData.customer_name || cData.name || '')
          setReceiverPhone(oData.receiver_phone || cData.phone || '')
        }
      }

      // Fetch Items
      if (pRes.data) {
        const { data: iData } = await supabase.from('order_items').select('*').eq('order_id', orderId)
        if (iData) {
          const items: LineItem[] = iData.map(i => {
            const product = pRes.data.find(p => p.id === i.product_id)
            return product ? { product, qty: i.qty } : null
          }).filter(Boolean) as LineItem[]
          setLineItems(items)
        }
      }

      setLoading(false)
    }
    init()
  }, [orderId])

  // Same logic as create/page.tsx
  const handleSelectCustomer = (c: Customer | null) => {
    setCustomer(c)
    if (c) {
      setReceiverName(c.name || '')
      setReceiverPhone(c.phone || '')
      setAddressLine(c.address || '')
      
      const fetchCustomerDetails = async (id: number) => {
        const { data } = await supabase.from('customers').select('*').eq('id', id).single()
        if (data) {
          if (data.address_subdistrict) setSubdistrict(data.address_subdistrict)
          if (data.address_district) setDistrict(data.address_district)
          if (data.address_province) setProvince(data.address_province)
          if (data.address_zipcode) setZipcode(data.address_zipcode)
        }
      }
      fetchCustomerDetails(c.id)
    } else {
      setReceiverName('')
      setReceiverPhone('')
      setAddressLine('')
      setSubdistrict('')
      setDistrict('')
      setProvince('')
      setZipcode('')
    }
  }

  const addLineItem = () => {
    if (products.length === 0) return
    setLineItems([...lineItems, { product: products[0], qty: 1 }])
  }
  const removeLineItem = (index: number) => setLineItems(lineItems.filter((_, i) => i !== index))
  const updateLineItem = (index: number, key: keyof LineItem, value: any) => {
    const list = [...lineItems]
    list[index] = { ...list[index], [key]: value }
    setLineItems(list)
  }

  const getLineItemPricing = (item: LineItem) => {
    let basePrice = item.product.price_online || 0
    let autoDiscount = 0
    let discountReason = ''
    
    if (customer && customer.tags) {
      const tags = customer.tags.split(',').map(s=>s.trim())
      const tierTagMatch = tags.find(tag => tiers.some(t => t.name === tag))
      if (tierTagMatch) {
        const matchedTier = tiers.find(t => t.name === tierTagMatch)
        if (matchedTier) {
          if (matchedTier.is_dealer) {
            if (item.product.price_dealer && item.product.price_dealer < basePrice) {
              autoDiscount += (basePrice - item.product.price_dealer)
              discountReason = `${matchedTier.name} (ราคาส่ง)`
            }
          } else if (matchedTier.discount_percent > 0) {
            autoDiscount += (basePrice * (matchedTier.discount_percent / 100))
            discountReason = `${matchedTier.name} (-${matchedTier.discount_percent}%)`
          } else if (matchedTier.product_discounts?.length > 0) {
            const productDisc = matchedTier.product_discounts.find((pd: any) => pd.sku === item.product.sku)
            if (productDisc && productDisc.amount > 0) {
              autoDiscount += productDisc.amount
              discountReason = `${matchedTier.name} (ลด ${productDisc.amount}฿)`
            }
          }
        }
      }
      
      const skuDiscTag = tags.find(t => t.startsWith(`DISC_${item.product.sku}:-`))
      if (skuDiscTag) {
        const amt = parseInt(skuDiscTag.split(':-')[1]) || 0
        autoDiscount += amt
        discountReason += discountReason ? ` + SKUลด${amt}` : `SKUลด${amt}`
      }
    }
    
    const finalPrice = Math.max(0, basePrice - autoDiscount)
    return { basePrice, autoDiscount, discountReason, finalPrice, total: finalPrice * item.qty }
  }

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId) || null
  const subtotal = lineItems.reduce((acc, item) => acc + getLineItemPricing(item).total, 0)
  const campaignDiscount = selectedCampaign
    ? (selectedCampaign.discount_amount || 0) + (selectedCampaign.discount_percent ? Math.round(subtotal * selectedCampaign.discount_percent / 100) : 0)
    : 0
  const couponDiscount = appliedCoupon
    ? (appliedCoupon.discount_amount || 0) + (appliedCoupon.discount_percent ? Math.round(subtotal * appliedCoupon.discount_percent / 100) : 0)
    : 0
  const totalDiscount = campaignDiscount + couponDiscount
  const grandTotal = Math.max(0, subtotal + shippingCost - totalDiscount)

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return
    setCouponLoading(true)
    setCouponStatus(null)
    setAppliedCoupon(null)

    const { data, error } = await supabase.from('coupons').select('*').eq('code', couponCode.trim().toUpperCase()).single()

    if (error || !data) setCouponStatus({ ok: false, msg: 'ไม่พบรหัสคูปองนี้' })
    else if (!data.is_active) setCouponStatus({ ok: false, msg: 'คูปองนี้ถูกปิดการใช้งานแล้ว' })
    else if (data.expires_at && new Date(data.expires_at) < new Date()) setCouponStatus({ ok: false, msg: 'คูปองนี้หมดอายุแล้ว' })
    else setAppliedCoupon(data)
    
    if (data && data.is_active && (!data.expires_at || new Date(data.expires_at) >= new Date())) {
      const parts: string[] = []
      if (data.discount_amount) parts.push(`${data.discount_amount} ฿`)
      if (data.discount_percent) parts.push(`${data.discount_percent}%`)
      setCouponStatus({ ok: true, msg: `✓ ${data.name} — ลด ${parts.join(' + ')}` })
    }
    setCouponLoading(false)
  }
  
  // STATUS FLOW: Linear sequence
  const STATUS_FLOW = ['draft', 'unpaid', 'transferred', 'pending', 'shipped', 'completed']
  const STATUS_LABELS: Record<string, string> = {
    draft: '🗒️ ร่าง',
    unpaid: '💳 รอจ่าย',
    transferred: '✅ โอนแล้ว',
    pending: '⏳ รอส่ง',
    shipped: '🚚 ส่งแล้ว',
    completed: '✔️ สำเร็จ',
    cancelled: '❌ ยกเลิก',
    expired: '⌛ หมดอายุ'
  }

  const handleStatusUpdate = async (newStatus: string) => {
    if (newStatus === orderStatus) return
    setStatusSaving(true)
    try {
      // 1. Inventory Sync
      if (newStatus === 'shipped' && orderStatus !== 'shipped' && orderStatus !== 'completed') {
        for (const item of lineItems) {
           const { data: pData } = await supabase.from('products').select('stock_total, stock_shipped').eq('id', item.product.id).single()
           if (pData) {
             await supabase.from('products').update({
                stock_total: Math.max(0, pData.stock_total - item.qty),
                stock_shipped: (pData.stock_shipped || 0) + item.qty
             }).eq('id', item.product.id)
           }
        }
      }

      // 2. Loyalty Points: Database trigger handles this automatically
      // Handled by the .update() call below.

      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
      if (error) throw error
      setOrderStatus(newStatus)
      if (onStatusChange) onStatusChange()
      // Optional: Show a small toast or just let the UI reflect it
    } catch (err: any) {
      toast.error('❌ ไม่สามารถเปลี่ยนสถานะได้: ' + err.message)
    } finally {
      setStatusSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customer) return toast.error('กรุณาเลือกลูกค้า')
    if (lineItems.length === 0) return toast.error('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ')
    
    setSaving(true)
    try {
      const itemsSummary = lineItems.map(item => `${item.product.name} x${item.qty}`).join(', ')

      const { error: orderErr } = await supabase.from('orders').update({
        customer_id: customer.id,
        customer_name: customer.name,
        receiver_name: receiverName.trim(),
        receiver_phone: receiverPhone.trim(),
        order_date: new Date(orderDate).toISOString(),
        status: orderStatus,
        total: grandTotal,
        shipping_cost: shippingCost,
        discount: totalDiscount,
        campaign_id: selectedCampaignId,
        coupon_id: appliedCoupon?.id || null,
        shipping_address: addressLine.trim() || null,
        address_subdistrict: subdistrict.trim() || null,
        address_district: district.trim() || null,
        address_province: province.trim() || null,
        address_zipcode: zipcode.trim() || null,
        payment_method: paymentMethod,
        target_bank_id: targetBankId,
        items_summary: itemsSummary,
        tracking: tracking.trim() || null,
        note: note,
        bill_type: billType,
        expiry_date: expiryDate ? new Date(expiryDate).toISOString() : null,
        admin_id: profile?.id || null
      }).eq('id', orderId)

      if (orderErr) throw orderErr

      // Sync Inventory if status changed to shipped during full save
      const { data: currentOData } = await supabase.from('orders').select('status').eq('id', orderId).single()
      const oldDbStatus = currentOData?.status || 'pending'
      
      if (orderStatus === 'shipped' && oldDbStatus !== 'shipped' && oldDbStatus !== 'completed') {
        for (const item of lineItems) {
           const { data: pData } = await supabase.from('products').select('stock_total, stock_shipped').eq('id', item.product.id).single()
           if (pData) {
             await supabase.from('products').update({
                stock_total: Math.max(0, pData.stock_total - item.qty),
                stock_shipped: (pData.stock_shipped || 0) + item.qty
             }).eq('id', item.product.id)
           }
        }
      }

      // 2. Loyalty Points: Database trigger handles this automatically
      // Handled during the .update({ total, status, etc. }) call above.

      // Delete old items & Insert new items
      await supabase.from('order_items').delete().eq('order_id', orderId)
      const newItems = lineItems.map(item => ({
        order_id: orderId,
        product_id: item.product.id,
        qty: item.qty,
        price_at_time: getLineItemPricing(item).finalPrice
      }))
      const { error: itemsErr } = await supabase.from('order_items').insert(newItems)
      if (itemsErr) console.error('Error inserting items:', itemsErr)

      // Sync customer address if changed (but DO NOT overwrite the customer's real name)
      const customerUpdates: Record<string, any> = {}
      // We no longer sync receiverName to customer.name, as they can be different.
      if (receiverPhone.trim() && receiverPhone.trim() !== customer.phone) customerUpdates.phone = receiverPhone.trim()
      if (addressLine.trim() && addressLine.trim() !== customer.address) customerUpdates.address = addressLine.trim()
      if (subdistrict.trim()) customerUpdates.address_subdistrict = subdistrict.trim()
      if (district.trim()) customerUpdates.address_district = district.trim()
      if (province.trim()) customerUpdates.address_province = province.trim()
      if (zipcode.trim()) customerUpdates.address_zipcode = zipcode.trim()

      if (Object.keys(customerUpdates).length > 0) {
        await supabase.from('customers').update(customerUpdates).eq('id', customer.id)
      }

      // Quick reload parent logic by forcing closed, parent should refetch or the state will just stay. 
      // User can refresh page to see changes in table if needed.
      toast.success('บันทึกการแก้ไขบิลสำเร็จ!')
      onSaved?.()
      onClose()
    } catch (err: any) {
      toast.error('❌ เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>กำลังโหลดข้อมูลบิล...</div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
      
      <div className="card animate-in" style={{ width: '100%', maxWidth: 1300, background: 'var(--black-bg)' }}>
        {/* Header */}
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--gray-border)', position: 'sticky', top: 0, background: 'var(--black-bg)', zIndex: 10, padding: '16px 24px' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <h2 className="card-title" style={{ fontSize: 20, margin: 0 }}>✏️ แก้ไขบิล #{orderId}</h2>
            <span style={{ fontSize: 12, color: 'var(--gray-text)' }}>Origin: {source || 'Asterna CRM'}</span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} className="btn btn-ghost" disabled={saving}>ยกเลิก / ปิด</button>
            <button onClick={handleSubmit} className="btn btn-primary" disabled={saving} style={{ padding: '8px 24px' }}>
              {saving ? 'กำลังบันทึก...' : '💾 บันทึกการแก้ไข'}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="card-body" style={{ padding: 24 }}>
          <form style={{ display: 'grid', gridTemplateColumns: 'minmax(450px, 1.3fr) 1fr 1fr', gap: 24, alignItems: 'start' }}>
            
            {/* COLUMN 1: ITEMS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="card" style={{ padding: 20, background: 'var(--black-card)' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📦 รายการสินค้า</h3>
                <div style={{ border: '1px solid var(--gray-border)', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'rgba(0,0,0,0.2)', fontSize: 12, color: 'var(--gray-text)' }}>
                      <tr>
                        <th style={{ padding: '10px', textAlign: 'left' }}>สินค้า</th>
                        <th style={{ padding: '10px', textAlign: 'center', width: 70 }}>จำนวน</th>
                        <th style={{ padding: '10px', textAlign: 'right', width: 90 }}>ราคา/ชิ้น</th>
                        <th style={{ padding: '10px', textAlign: 'right', width: 90 }}>รวม</th>
                        <th style={{ padding: '10px', width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, index) => {
                        const pricing = getLineItemPricing(item)
                        return (
                          <tr key={index} style={{ borderTop: '1px solid var(--gray-border)' }}>
                            <td style={{ padding: '8px 10px' }}>
                              <select className="input" value={item.product.id} onChange={e => {
                                  const p = products.find(p => p.id === parseInt(e.target.value))
                                  if (p) updateLineItem(index, 'product', p)
                                }} style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}>
                                {products.map(p => <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <input type="number" className="input" min={1} value={item.qty} onChange={e => updateLineItem(index, 'qty', parseInt(e.target.value) || 1)} style={{ width: '100%', textAlign: 'center', padding: '6px', fontSize: 13 }} />
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13 }}>{pricing.finalPrice.toLocaleString()}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--gold-primary)', fontSize: 13 }}>{pricing.total.toLocaleString()}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <button type="button" onClick={() => removeLineItem(index)} className="btn btn-ghost" style={{ color: 'red', padding: '4px' }}>✖</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div style={{ padding: 8, borderTop: '1px solid var(--gray-border)', background: 'rgba(0,0,0,0.2)' }}>
                    <button type="button" onClick={addLineItem} className="btn btn-ghost" style={{ color: 'var(--gold-dark)', fontSize: 12, width: '100%' }}>+ เพิ่มรายการสินค้า</button>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <label style={{ fontSize: 12, color: 'var(--gray-text)', marginBottom: 6, display: 'block' }}>บันทึกภายใน</label>
                  <textarea className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%', fontSize: 13 }} />
                </div>
              </div>

              {/* Summary */}
              <div className="card" style={{ padding: 20, background: 'var(--black-card)' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                  <span style={{ color: 'var(--gray-text)' }}>ยอดรวมสินค้า</span>
                  <span style={{ fontWeight: 600 }}>{subtotal.toLocaleString()} ฿</span>
                </div>
                
                {/* Campaigns & Coupons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--gray-text)', fontSize: 12, width: 80 }}>แคมเปญ</span>
                    <select className="input" value={selectedCampaignId ?? ''} onChange={e => setSelectedCampaignId(e.target.value ? Number(e.target.value) : null)} style={{ flex: 1, padding: '6px', fontSize: 12 }}>
                      <option value="">— ไม่ใช้ —</option>
                      {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {campaignDiscount > 0 && <span style={{ width: 60, textAlign: 'right', color: 'var(--danger)', fontSize: 12 }}>-{campaignDiscount.toLocaleString()}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                     <span style={{ color: 'var(--gray-text)', fontSize: 12, width: 80 }}>คูปอง</span>
                     <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                       <input type="text" className="input" value={couponCode} onChange={e => setCouponCode(e.target.value)} style={{ flex: 1, padding: '6px', fontSize: 12 }} placeholder="CODE" />
                       <button type="button" onClick={handleApplyCoupon} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11, borderColor: 'var(--gold-dark)' }}>ใช้</button>
                     </div>
                     {couponDiscount > 0 && <span style={{ width: 60, textAlign: 'right', color: 'var(--danger)', fontSize: 12 }}>-{couponDiscount.toLocaleString()}</span>}
                  </div>
                  {couponStatus && <div style={{ fontSize: 11, color: couponStatus.ok ? 'var(--success)' : 'var(--danger)' }}>{couponStatus.msg}</div>}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
                  <span style={{ color: 'var(--gray-text)', fontSize: 14 }}>ค่าจัดส่ง</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    +<input type="number" className="input" value={shippingCost} onChange={e => setShippingCost(Number(e.target.value))} style={{ width: 80, padding: '4px 8px', textAlign: 'right' }} /> ฿
                  </div>
                </div>

                <div style={{ borderTop: '2px dashed var(--gray-border)', paddingTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700 }}>
                  <span>ยอดสุทธิ</span>
                  <span style={{ color: 'var(--gold-primary)' }}>{grandTotal.toLocaleString()} ฿</span>
                </div>
              </div>
            </div>

            {/* COLUMN 2: PAYMENT & STATUS */}
            <div className="card" style={{ padding: 20, background: 'var(--black-card)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>สถานะ & การชำระเงิน</h3>
              
              <div>
                <label style={{ fontSize: 12, color: 'var(--gray-text)', display: 'block', marginBottom: 10 }}>สถานะบิล (Auto-Save)</label>
                
                <div className="status-picker" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Current Status Display with Stepper */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(0,0,0,0.2)', padding: '12px 8px', borderRadius: 12, border: '1px solid var(--gray-border)' }}>
                    {STATUS_FLOW.map((s, idx) => {
                      const isActive = s === orderStatus
                      const isPast = STATUS_FLOW.indexOf(orderStatus) > idx
                      return (
                        <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
                          <div 
                            title={STATUS_LABELS[s]}
                            style={{ 
                              width: 10, height: 10, borderRadius: '50%', 
                              background: isActive ? 'var(--gold-primary)' : isPast ? '#2ecc71' : 'rgba(255,255,255,0.1)',
                              boxShadow: isActive ? '0 0 10px var(--gold-primary)' : 'none',
                              transition: 'all 0.3s'
                            }} 
                          />
                          {idx < STATUS_FLOW.length - 1 && (
                            <div style={{ width: 14, height: 1, background: isPast ? '#2ecc71' : 'rgba(255,255,255,0.1)' }} />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Main Flow Buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {/* BACK BUTTON */}
                    <button 
                      type="button"
                      disabled={statusSaving || !STATUS_FLOW.includes(orderStatus) || orderStatus === STATUS_FLOW[0]}
                      onClick={() => {
                        const idx = STATUS_FLOW.indexOf(orderStatus)
                        if (idx > 0) handleStatusUpdate(STATUS_FLOW[idx - 1])
                      }}
                      className="btn btn-ghost"
                      style={{ flex: 1, fontSize: 11, padding: '8px 4px', borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                      ⬅️ ย้อนกลับ
                    </button>

                    {/* CURRENT STATUS LABEL */}
                    <div style={{ 
                      flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      background: 'rgba(212, 175, 55, 0.1)', border: '1px solid var(--gold-dark)', 
                      borderRadius: 8, fontSize: 13, fontWeight: 700, color: 'var(--gold-primary)'
                    }}>
                      {statusSaving ? '⏳ ...' : STATUS_LABELS[orderStatus] || orderStatus}
                    </div>

                    {/* NEXT BUTTON */}
                    <button 
                      type="button"
                      disabled={statusSaving || !STATUS_FLOW.includes(orderStatus) || orderStatus === STATUS_FLOW[STATUS_FLOW.length - 1]}
                      onClick={() => {
                        const idx = STATUS_FLOW.indexOf(orderStatus)
                        if (idx < STATUS_FLOW.length - 1) handleStatusUpdate(STATUS_FLOW[idx + 1])
                      }}
                      className="btn btn-primary"
                      style={{ flex: 1, fontSize: 11, padding: '8px 4px' }}
                    >
                      ต่อไป ➡️
                    </button>
                  </div>

                  {/* Terminal / Special States */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button 
                      type="button"
                      disabled={statusSaving || orderStatus === 'cancelled'}
                      onClick={() => handleStatusUpdate('cancelled')}
                      className="btn btn-ghost"
                      style={{ flex: 1, fontSize: 10, color: '#ff4444', borderColor: 'rgba(255,68,68,0.2)', padding: '6px' }}
                    >
                      ❌ ยกเลิกบิล
                    </button>
                    {/* Manual 'Expired' button removed as it's now handled by the system automatically based on date */}
                  </div>

                  {/* Quick Select Fallback (Small) */}
                  <select 
                    value={orderStatus} 
                    onChange={e => handleStatusUpdate(e.target.value)} 
                    style={{ background: 'transparent', border: 'none', color: 'var(--gray-text)', fontSize: 10, cursor: 'pointer', textAlign: 'center', marginTop: 4 }}
                  >
                    {Object.entries(STATUS_LABELS).map(([val, label]) => (
                      <option key={val} value={val} style={{ background: '#222' }}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'var(--gray-text)', display: 'block', marginBottom: 6 }}>วันที่เปิดบิล</label>
                <input type="date" className="input" value={orderDate} onChange={e => setOrderDate(e.target.value)} style={{ width: '100%', fontSize: 13 }} />
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'var(--gray-text)', display: 'block', marginBottom: 6 }}>วันหมดอายุบิล</label>
                <input type="date" className="input" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} style={{ width: '100%', fontSize: 13, colorScheme: 'dark' }} />
              </div>

              <div>
                 <label style={{ fontSize: 12, color: 'var(--gray-text)', display: 'block', marginBottom: 6 }}>วิธีชำระเงิน</label>
                 <select className="input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ width: '100%', fontSize: 13 }}>
                  <option value="bank_transfer">โอนเงินเข้าบัญชี</option>
                  <option value="cod">เก็บเงินปลายทาง (COD)</option>
                  <option value="credit_card">บัตรเครดิต</option>
                  <option value="cash">เงินสด</option>
                </select>
              </div>

              {paymentMethod === 'bank_transfer' && (
                <div>
                  <label style={{ fontSize: 12, color: 'var(--gray-text)', display: 'block', marginBottom: 6 }}>บัญชีรับโอน</label>
                  <select className="input" value={targetBankId ?? ''} onChange={e => setTargetBankId(e.target.value ? Number(e.target.value) : null)} style={{ width: '100%', fontSize: 13 }}>
                    <option value="">— เลือกบัญชี —</option>
                    {banks.map(b => <option key={b.id} value={b.id}>{b.bank_name} - {b.account_no}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, color: 'var(--gray-text)', display: 'block', marginBottom: 6 }}>ประเภทบิล</label>
                <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--gray-border)' }}>
                  {([['normal', '📄 ปกติ'], ['cf', '🔁 ระบบ CF']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBillType(val)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        background: billType === val ? 'var(--gold-primary)' : 'var(--black-card)',
                        border: 'none',
                        borderRight: val === 'normal' ? '1px solid var(--gray-border)' : 'none',
                        color: billType === val ? '#1a1a1a' : 'var(--gray-text)',
                        fontWeight: billType === val ? 700 : 400,
                        fontSize: 13,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ONLINE INVOICE & SLIP */}
              <div style={{ borderTop: '1px solid var(--gray-border)', paddingTop: 16 }}>
                <label style={{ fontSize: 12, color: 'var(--gray-text)', display: 'block', marginBottom: 6 }}>บิลออนไลน์ (Online Invoice)</label>
                {invoiceToken ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: 8 }}>
                    <input type="text" className="input" value={typeof window !== 'undefined' ? `${window.location.origin}/invoice/${invoiceToken}` : ''} readOnly style={{ flex: 1, fontSize: 11, background: 'transparent', border: 'none', color: 'var(--gold-light)' }} />
                    <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/invoice/${invoiceToken}`); toast.success('คัดลอกลิงก์สำเร็จ') }} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11, flexShrink: 0 }}>คัดลอก</button>
                    <a href={`/invoice/${invoiceToken}`} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 11, textDecoration: 'none', flexShrink: 0, textAlign: 'center' }}>ดูบิล</a>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--danger)' }}>ยังไม่พบข้อมูล Token (อาจต้องบันทึก หรือรันตัวอัปเดต)</div>
                )}
                
                {paymentSlipUrl && (
                  <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 12, color: 'var(--gold-primary)', display: 'block', marginBottom: 6, fontWeight: 700 }}>หลักฐานการโอน (Slip)</label>
                    <a href={paymentSlipUrl} target="_blank" rel="noreferrer" style={{ display: 'block', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                       {/* eslint-disable-next-line @next/next/no-img-element */}
                       <img src={paymentSlipUrl} alt="Slip" style={{ width: '100%', display: 'block' }} />
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* COLUMN 3: CUSTOMER & LOGISTICS */}
            <div className="card" style={{ padding: 20, background: 'var(--black-card)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>ลูกค้า & จัดส่ง</h3>
              
              <div style={{ borderBottom: '1px solid var(--gray-border)', paddingBottom: 16 }}>
                <label style={{ fontSize: 12, color: 'var(--gray-text)', display: 'block', marginBottom: 6 }}>ลูกค้า (ของบิลนี้)</label>
                <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--gold-light)', border: '1px solid var(--gray-border)' }}>
                  {customer ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{customer.name}</span>
                      <span style={{ 
                        fontSize: 10, color: '#fff', 
                        background: 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)', 
                        padding: '2px 10px', borderRadius: 20, 
                        fontWeight: 700, boxShadow: '0 2px 6px rgba(46, 204, 113, 0.2)',
                        display: 'flex', alignItems: 'center', gap: 4
                      }}>
                        <span>🏆</span> {customer.reward_points || 0} Points
                      </span>
                    </div>
                  ) : 'ไม่มีข้อมูลลูกค้าอ้างอิง'}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'var(--gray-text)', display: 'block', marginBottom: 6 }}>ผู้รับ & เบอร์โทร</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" className="input" value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="ชื่อผู้รับ" style={{ flex: 1.5, fontSize: 12 }} />
                  <input type="text" className="input" value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)} placeholder="เบอร์โทร" style={{ flex: 1, fontSize: 12 }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'var(--gray-text)', display: 'block', marginBottom: 6 }}>ที่อยู่ (บ้านเลขที่ ถนน ซอย)</label>
                <textarea className="input" rows={2} value={addressLine} onChange={e => setAddressLine(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input type="text" className="input" placeholder="ตำบล" value={subdistrict} onChange={e => setSubdistrict(e.target.value)} style={{ fontSize: 12 }} />
                <input type="text" className="input" placeholder="อำเภอ" value={district} onChange={e => setDistrict(e.target.value)} style={{ fontSize: 12 }} />
                <input type="text" className="input" placeholder="จังหวัด" value={province} onChange={e => setProvince(e.target.value)} style={{ fontSize: 12 }} />
                <input type="text" className="input" placeholder="รหัส ปณ." value={zipcode} onChange={e => setZipcode(e.target.value)} style={{ fontSize: 12 }} />
              </div>

              <div style={{ marginTop: 8, padding: 12, background: 'rgba(201,168,76,0.1)', border: '1px solid var(--gold-dark)', borderRadius: 8 }}>
                <label style={{ fontSize: 12, color: 'var(--gold-primary)', display: 'block', marginBottom: 6, fontWeight: 700 }}>เลขพัสดุ (Tracking No.)</label>
                <input type="text" className="input" value={tracking} onChange={e => setTracking(e.target.value)} placeholder="กรอกเลขพัสดุ (จัดส่งแล้ว)" style={{ width: '100%', fontSize: 13, background: 'var(--black-card)' }} />
              </div>

            </div>

          </form>
        </div>

      </div>
    </div>
  )
}
