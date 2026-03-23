'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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

function CreateOrderPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlCustomerId = searchParams.get('customer_id')
  const { profile } = useAdminAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [tiers, setTiers] = useState<{ id: number; name: string; discount_percent: number; product_discounts?: {sku:string, amount:number}[]; is_dealer: boolean }[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [banks, setBanks] = useState<BankAccount[]>([])

  // Load Data
  useEffect(() => {
    async function loadData() {
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
      
      // If customer_id in URL, load it
      if (urlCustomerId) {
        const { data: cData } = await supabase.from('customers').select('*').eq('id', parseInt(urlCustomerId)).single()
        if (cData) handleSelectCustomer(cData)
      }
    }
    loadData()
  }, [urlCustomerId])

  // Form State: Col 1 (Items & Discs)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [shippingCost, setShippingCost] = useState(0)
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null)
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null)
  const [couponStatus, setCouponStatus] = useState<{ok: boolean; msg: string} | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [note, setNote] = useState('')

  // Form State: Col 2 (Payment)
  const calcExpiry = (d: string) => {
    const dt = new Date(d)
    dt.setDate(dt.getDate() + 15)
    return dt.toISOString().split('T')[0]
  }
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
  const [expiryDate, setExpiryDate] = useState(() => calcExpiry(new Date().toISOString().split('T')[0]))
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [targetBankId, setTargetBankId] = useState<number | null>(null)
  const [billType, setBillType] = useState('normal')

  // Auto-recalculate expiry when orderDate changes
  useEffect(() => {
    setExpiryDate(calcExpiry(orderDate))
  }, [orderDate])

  // Form State: Col 3 (Customer & Shipping)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [receiverName, setReceiverName] = useState('')
  const [receiverPhone, setReceiverPhone] = useState('')
  const [addressLine, setAddressLine] = useState('')
  const [subdistrict, setSubdistrict] = useState('')
  const [district, setDistrict] = useState('')
  const [province, setProvince] = useState('')
  const [zipcode, setZipcode] = useState('')

  const [loading, setLoading] = useState(false)

  // Auto-fill shipping address when customer is selected
  const handleSelectCustomer = (c: Customer | null) => {
    setCustomer(c)
    if (c) {
      setReceiverName(c.name || '')
      setReceiverPhone(c.phone || '')
      // Assume existing address is simple text for now, map to addressLine
      setAddressLine(c.address || '')
      
      // If customer has structured address, populate it (requires reloading or extending Customer type)
      // For this migration, we'll try to extract it from the extended customer fetch if possible
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

  const fetchCustomerDetails = async (id: number) => {
    const { data } = await supabase.from('customers').select('*').eq('id', id).single()
    if (data) {
      if (data.address_subdistrict) setSubdistrict(data.address_subdistrict)
      if (data.address_district) setDistrict(data.address_district)
      if (data.address_province) setProvince(data.address_province)
      if (data.address_zipcode) setZipcode(data.address_zipcode)
    }
  }

  // --- Line Items Logic --- //
  const addLineItem = () => {
    if (products.length === 0) return
    setLineItems([...lineItems, { product: products[0], qty: 1 }])
  }
  const removeLineItem = (index: number) => {
    const list = [...lineItems]
    list.splice(index, 1)
    setLineItems(list)
  }
  const updateLineItem = (index: number, key: keyof LineItem, value: any) => {
    const list = [...lineItems]
    list[index] = { ...list[index], [key]: value }
    setLineItems(list)
  }

  // --- Auto Pricing Logic --- //
  const getLineItemPricing = (item: LineItem) => {
    let basePrice = item.product.price_online || 0
    let autoDiscount = 0
    let discountReason = ''
    
    if (customer && customer.tags) {
      const tags = customer.tags.split(',').map(s=>s.trim())
      
      // Tier Discount
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
          } else if (matchedTier.product_discounts && matchedTier.product_discounts.length > 0) {
            const productDisc = matchedTier.product_discounts.find((pd: any) => pd.sku === item.product.sku)
            if (productDisc && productDisc.amount > 0) {
              autoDiscount += productDisc.amount
              discountReason = `${matchedTier.name} (ลด ${productDisc.amount}฿)`
            }
          }
        }
      }
      
      // SKU Specific Discount
      const skuDiscTag = tags.find(t => t.startsWith(`DISC_${item.product.sku}:-`))
      if (skuDiscTag) {
        const amt = parseInt(skuDiscTag.split(':-')[1]) || 0
        autoDiscount += amt
        discountReason += discountReason ? ` + SKUลด${amt}` : `SKUลด${amt}`
      }
    }
    
    const finalPrice = Math.max(0, basePrice - autoDiscount)
    return {
      basePrice, // This is the unit retail price
      autoDiscount, // Discount per unit
      discountReason,
      finalPrice, // Final price per unit
      total: finalPrice * item.qty // Total line cost
    }
  }

  // --- Totals --- //
  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId) || null
  const subtotal = lineItems.reduce((acc, item) => acc + getLineItemPricing(item).total, 0)
  const campaignDiscount = selectedCampaign
    ? (selectedCampaign.discount_amount || 0) + (selectedCampaign.discount_percent ? Math.round(subtotal * selectedCampaign.discount_percent / 100) : 0)
    : 0
  const couponDiscount = appliedCoupon
    ? (appliedCoupon.discount_amount || 0) + (appliedCoupon.discount_percent ? Math.round(subtotal * appliedCoupon.discount_percent / 100) : 0)
    : 0
  const totalDiscount = campaignDiscount + couponDiscount
  const grandTotal = subtotal + shippingCost - totalDiscount

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return
    setCouponLoading(true)
    setCouponStatus(null)
    setAppliedCoupon(null)

    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', couponCode.trim().toUpperCase())
      .single()

    if (error || !data) {
      setCouponStatus({ ok: false, msg: 'ไม่พบรหัสคูปองนี้' })
    } else if (!data.is_active) {
      setCouponStatus({ ok: false, msg: 'คูปองนี้ถูกปิดการใช้งานแล้ว' })
    } else if (data.expires_at && new Date(data.expires_at) < new Date()) {
      setCouponStatus({ ok: false, msg: 'คูปองนี้หมดอายุแล้ว' })
    } else if (data.max_uses !== null && data.uses_count >= data.max_uses) {
      setCouponStatus({ ok: false, msg: 'คูปองนี้ถูกใช้ครบโควต้าแล้ว' })
    } else {
      setAppliedCoupon(data)
      const parts: string[] = []
      if (data.discount_amount) parts.push(`${data.discount_amount} ฿`)
      if (data.discount_percent) parts.push(`${data.discount_percent}%`)
      setCouponStatus({ ok: true, msg: `✓ ${data.name} — ลด ${parts.join(' + ')}` })
    }
    setCouponLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customer) return toast.error('กรุณาเลือกลูกค้า')
    if (lineItems.length === 0) return toast.error('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ')
    if (grandTotal < 0) return toast.error('ยอดรวมติดลบไม่ได้')

    setLoading(true)

    try {
      const itemsSummary = lineItems.map(item => `${item.product.name} x${item.qty}`).join(', ')

      const { data: orderData, error: orderErr } = await supabase.from('orders').insert({
        customer_id: customer.id,
        customer_name: customer.name,
        receiver_name: receiverName.trim() || customer.name,
        receiver_phone: receiverPhone.trim() || customer.phone || null,
        order_date: new Date(orderDate).toISOString(),
        status: 'unpaid',
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
        note: note,
        source: 'Asterna CRM (Manual)',
        bill_type: billType,
        expiry_date: expiryDate ? new Date(expiryDate).toISOString() : null,
        admin_id: profile?.id || null
      }).select().single()

      if (orderErr) throw orderErr

      // Insert Order Items
      const orderItems = lineItems.map(item => ({
        order_id: orderData.id,
        product_id: item.product.id,
        qty: item.qty,
        price_at_time: getLineItemPricing(item).finalPrice
      }))
      
      const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)
      if (itemsErr) console.error('Error inserting items:', itemsErr)

      // Update customer info (total orders and sync address)
      const customerUpdates: Record<string, any> = {
        total_orders: (customer.total_orders || 0) + 1
      }
      
      const trimmedName = receiverName.trim()
      const trimmedPhone = receiverPhone.trim()
      const trimmedAddr = addressLine.trim()
      const trimmedSub = subdistrict.trim()
      const trimmedDist = district.trim()
      const trimmedProv = province.trim()
      const trimmedZip = zipcode.trim()
      
      let needsUpdate = false
      // DO NOT overwrite customer.name with trimmedName (receiverName) as it alters the original customer account
      if (trimmedPhone && trimmedPhone !== customer.phone) { customerUpdates.phone = trimmedPhone; needsUpdate = true; }
      if (trimmedAddr && trimmedAddr !== customer.address) { customerUpdates.address = trimmedAddr; needsUpdate = true; }
      if (trimmedSub) { customerUpdates.address_subdistrict = trimmedSub; needsUpdate = true; }
      if (trimmedDist) { customerUpdates.address_district = trimmedDist; needsUpdate = true; }
      if (trimmedProv) { customerUpdates.address_province = trimmedProv; needsUpdate = true; }
      if (trimmedZip) { customerUpdates.address_zipcode = trimmedZip; needsUpdate = true; }

      await supabase.from('customers').update(customerUpdates).eq('id', customer.id)

      // Increment coupon uses_count
      if (appliedCoupon) {
        await supabase.from('coupons').update({ uses_count: appliedCoupon.uses_count + 1 }).eq('id', appliedCoupon.id)
      }

      // alert('✅ เปิดบิลสำเร็จ!')
      router.push('/admin/orders')
      
    } catch (err: any) {
      toast.error('❌ เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 15, width: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            <button onClick={() => router.back()} className="btn btn-ghost" style={{ padding: '6px 12px' }}>
              ← กลับ
            </button>
            <span className="topbar-title">🧾 สร้างบิล/คำสั่งซื้อใหม่</span>
          </div>
          <div>
            <button onClick={handleSubmit} className="btn btn-primary" disabled={loading} style={{ padding: '8px 24px', fontSize: 14 }}>
              {loading ? '⏳ กำลังบันทึก...' : '✅ ยืนยันเปิดบิล'}
            </button>
          </div>
        </div>
      </div>
      
      <div className="page-body animate-in">
        <form onSubmit={handleSubmit} style={{
          display: 'grid', 
          gridTemplateColumns: 'minmax(500px, 1.5fr) 1fr 1fr', 
          gap: 24, 
          alignItems: 'start'
        }}>
          
          {/* ========================================================= */}
          {/* COLUMN 1: ITEMS & SUMMARY */}
          {/* ========================================================= */}
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              📦 รายการสินค้า
            </h3>
            
            <div style={{ border: '1px solid var(--gray-border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--black-card)', fontSize: 12, color: 'var(--gray-text)' }}>
                  <tr>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>สินค้า</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', width: 80 }}>จำนวน</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', width: 100 }}>ราคา/ชิ้น</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', width: 100 }}>รวม</th>
                    <th style={{ padding: '10px 14px', width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => {
                    const pricing = getLineItemPricing(item)
                    return (
                      <tr key={index} style={{ borderTop: '1px solid var(--gray-border)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <select 
                            className="input"
                            value={item.product.id}
                            onChange={e => {
                              const p = products.find(p => p.id === parseInt(e.target.value))
                              if (p) updateLineItem(index, 'product', p)
                            }}
                            style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
                          >
                            {products.map(p => (
                              <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>
                            ))}
                          </select>
                          {pricing.discountReason && (
                            <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4, fontWeight: 600 }}>
                              ส่วนลดส่วนตัว: {pricing.discountReason} (-{pricing.autoDiscount}฿/ชิ้น)
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <input 
                            type="number" 
                            className="input"
                            min={1}
                            value={item.qty}
                            onChange={e => updateLineItem(index, 'qty', parseInt(e.target.value) || 1)}
                            style={{ width: '100%', textAlign: 'center', padding: '6px 4px', fontSize: 13 }}
                          />
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13 }}>
                          {pricing.autoDiscount > 0 ? (
                            <div>
                              <span style={{ textDecoration: 'line-through', color: 'var(--gray-text)', fontSize: 11, marginRight: 4 }}>{pricing.basePrice.toLocaleString()}</span>
                              <span style={{ fontWeight: 600 }}>{pricing.finalPrice.toLocaleString()} ฿</span>
                            </div>
                          ) : (
                            <span style={{ fontWeight: 600 }}>{pricing.basePrice.toLocaleString()} ฿</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--gold-primary)', fontSize: 14 }}>
                          {pricing.total.toLocaleString()} ฿
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <button type="button" onClick={() => removeLineItem(index)} className="btn btn-ghost" style={{ color: 'red', padding: '4px' }}>
                            ✖
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {lineItems.length === 0 && (
                    <tr style={{ borderTop: '1px solid var(--gray-border)' }}>
                      <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--gray-text)' }}>
                        ยังไม่มีรายการสินค้า
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ padding: 10, borderTop: '1px solid var(--gray-border)', background: 'var(--black-card)' }}>
                <button type="button" onClick={addLineItem} className="btn btn-ghost" style={{ color: 'var(--gold-dark)', fontWeight: 600, fontSize: 13, width: '100%', textAlign: 'center' }}>
                  + เพิ่มรายการสินค้า
                </button>
              </div>
            </div>

            {/* Note */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--gray-text)' }}>หมายเหตุการขาย / บันทึกภายใน</label>
              <textarea 
                className="input" 
                rows={2} 
                placeholder="ระบุโน้ตเพิ่มเติมสำหรับแอดมินหรือแพ็คเกอร์..."
                value={note}
                onChange={e => setNote(e.target.value)}
                style={{ width: '100%', fontSize: 13, resize: 'vertical' }}
              />
            </div>

            {/* Summary Block */}
            <div style={{ background: 'var(--black-card)', padding: 20, borderRadius: 12, border: '1px solid var(--gray-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ color: 'var(--gray-text)' }}>ยอดรวมสินค้า ({lineItems.reduce((a,b)=>a+b.qty,0)} ชิ้น)</span>
                <span style={{ fontWeight: 600 }}>{subtotal.toLocaleString()} ฿</span>
              </div>

              {/* Campaign Discount */}
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: 'var(--gray-text)', fontSize: 13, width: 90 }}>ส่วนลดแคมเปญ</span>
                <select
                  className="input"
                  value={selectedCampaignId ?? ''}
                  onChange={e => setSelectedCampaignId(e.target.value ? Number(e.target.value) : null)}
                  style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}
                >
                  <option value="">— ไม่ใช้แคมเปญ —</option>
                  {campaigns.map(c => {
                    const parts: string[] = []
                    if (c.discount_amount) parts.push(`${c.discount_amount.toLocaleString()} ฿`)
                    if (c.discount_percent) parts.push(`${c.discount_percent}%`)
                    return (
                      <option key={c.id} value={c.id}>{c.name} (ลด {parts.join(' + ')})</option>
                    )
                  })}
                </select>
                {campaignDiscount > 0 && <span style={{ width: 80, textAlign: 'right', color: 'var(--danger)', fontWeight: 700 }}>-{campaignDiscount.toLocaleString()} ฿</span>}
              </div>

              {/* Coupon Code */}
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ color: 'var(--gray-text)', fontSize: 13, width: 90, paddingTop: 8 }}>รหัสคูปอง</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="กรอกรหัสคูปอง..."
                      value={couponCode}
                      onChange={e => { setCouponCode(e.target.value.toUpperCase()); setAppliedCoupon(null); setCouponStatus(null) }}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleApplyCoupon())}
                      style={{ flex: 1, padding: '8px 12px', fontSize: 13, letterSpacing: 1 }}
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={couponLoading || !couponCode.trim()}
                      className="btn btn-ghost"
                      style={{ padding: '8px 12px', fontSize: 12, borderColor: 'var(--gold-dark)', color: 'var(--gold-primary)' }}
                    >
                      {couponLoading ? '...' : 'ใช้คูปอง'}
                    </button>
                  </div>
                  {couponStatus && (
                    <div style={{
                      marginTop: 6, fontSize: 12, padding: '6px 10px', borderRadius: 6,
                      background: couponStatus.ok ? 'rgba(76,175,118,0.12)' : 'rgba(231,76,60,0.12)',
                      color: couponStatus.ok ? 'var(--success)' : '#e74c3c',
                      fontWeight: 600
                    }}>
                      {couponStatus.msg}
                    </div>
                  )}
                </div>
                {couponDiscount > 0 && <span style={{ width: 80, textAlign: 'right', color: 'var(--danger)', fontWeight: 700, paddingTop: 8 }}>-{couponDiscount.toLocaleString()} ฿</span>}
              </div>

              {/* Shipping Cost */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
                <span style={{ color: 'var(--gray-text)', width: 90 }}>ค่าจัดส่ง</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
                  <span>+</span>
                  <input type="number" className="input" value={shippingCost} onChange={e => setShippingCost(Number(e.target.value))} style={{ width: 100, padding: '6px 10px', textAlign: 'right', fontSize: 14 }} /> 
                  <span>฿</span>
                </div>
              </div>
              
              <div style={{ paddingTop: 16, borderTop: '2px dashed var(--gray-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: 22 }}>
                <span>ยอดสุทธิ</span>
                <span style={{ color: 'var(--gold-primary)' }}>{grandTotal.toLocaleString()} ฿</span>
              </div>
            </div>

          </div>

          {/* ========================================================= */}
          {/* COLUMN 2: PAYMENT & BILLING */}
          {/* ========================================================= */}
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              💳 การชำระเงิน
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--gray-text)' }}>วันที่เปิดบิล</label>
                <input 
                  type="date" 
                  className="input" 
                  value={orderDate}
                  onChange={e => setOrderDate(e.target.value)}
                  style={{ width: '100%', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--gray-text)' }}>
                  ⌛ วันหมดอายุบิล <span style={{ color: 'var(--gold-primary)', fontWeight: 400 }}>(อัตโนมัติ +15 วัน)</span>
                </label>
                <input
                  type="date"
                  className="input"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  style={{ width: '100%', fontSize: 13, colorScheme: 'dark' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--gray-text)' }}>ช่องทางการชำระเงิน</label>
                <select 
                  className="input" 
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  style={{ width: '100%', fontSize: 13 }}
                >
                  <option value="bank_transfer">โอนเงินเข้าบัญชี</option>
                  <option value="cod">เก็บเงินปลายทาง (COD)</option>
                  <option value="credit_card">บัตรเครดิต</option>
                  <option value="cash">เงินสด</option>
                </select>
              </div>

              {paymentMethod === 'bank_transfer' && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--gray-text)' }}>บัญชีธนาคาร (รับโอน)</label>
                  <select 
                    className="input" 
                    value={targetBankId ?? ''}
                    onChange={e => setTargetBankId(e.target.value ? Number(e.target.value) : null)}
                    style={{ width: '100%', fontSize: 13 }}
                  >
                    <option value="">— กรุณาเลือกบัญชีธนาคาร —</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>{b.bank_name} - {b.account_no} ({b.account_name})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--gray-text)' }}>ประเภทบิล</label>
                <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--gray-border)' }}>
                  {([['normal', '📄 ปกติ'], ['cf', '🔁 ระบบ CF']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBillType(val)}
                      style={{
                        flex: 1,
                        padding: '9px',
                        background: billType === val ? 'var(--gold-primary)' : 'transparent',
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
            </div>
          </div>

          {/* ========================================================= */}
          {/* COLUMN 3: CUSTOMER & LOGISTICS */}
          {/* ========================================================= */}
           <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              🚚 ลูกค้าและการจัดส่ง
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <CustomerSelect onSelect={handleSelectCustomer} />
                {customer && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {customer.tags && (
                      <div style={{ fontSize: 11, background: 'rgba(201,168,76,0.1)', color: 'var(--gold-primary)', padding: '6px 10px', borderRadius: 6, fontWeight: 600 }}>
                        💡 Tags: {customer.tags}
                      </div>
                    )}
                    <div style={{ fontSize: 11, background: 'rgba(46,204,113,0.1)', color: 'var(--success)', padding: '6px 10px', borderRadius: 6, fontWeight: 600 }}>
                      🏆 Loyalty Points: {customer.reward_points || 0}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--gray-border)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--gray-text)' }}>ผู้รับ / เบอร์โทรศัพท์</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" className="input" placeholder="ชื่อผู้รับ" value={receiverName} onChange={e => setReceiverName(e.target.value)} style={{ flex: 1.5, fontSize: 13 }} />
                    <input type="tel" className="input" placeholder="เบอร์โทร" value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)} style={{ flex: 1, fontSize: 13 }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--gray-text)' }}>ที่อยู่จัดส่ง (บ้านเลขที่, ถนน, หมู่บ้าน)</label>
                  <textarea 
                    className="input" 
                    rows={2}
                    placeholder="รายละเอียดบ้านเลขที่ และถนน..."
                    value={addressLine}
                    onChange={e => setAddressLine(e.target.value)}
                    style={{ width: '100%', fontSize: 13, resize: 'none' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--gray-text)' }}>ตำบล / แขวง</label>
                    <input type="text" className="input" value={subdistrict} onChange={e => setSubdistrict(e.target.value)} style={{ width: '100%', fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--gray-text)' }}>อำเภอ / เขต</label>
                    <input type="text" className="input" value={district} onChange={e => setDistrict(e.target.value)} style={{ width: '100%', fontSize: 13 }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--gray-text)' }}>จังหวัด</label>
                    <input type="text" className="input" value={province} onChange={e => setProvince(e.target.value)} style={{ width: '100%', fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--gray-text)' }}>รหัสไปรษณีย์</label>
                    <input type="text" className="input" value={zipcode} onChange={e => setZipcode(e.target.value)} style={{ width: '100%', fontSize: 13, letterSpacing: 1 }} />
                  </div>
                </div>
              </div>

            </div>
          </div>

        </form>
      </div>
    </>
  )
}

export default function CreateOrderPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-text)' }}>⏳ กำลังโหลด...</div>}>
      <CreateOrderPageContent />
    </Suspense>
  )
}
