'use client'
import { useEffect, useState } from 'react'
import { supabasePublic as supabase } from '@/lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import generatePayload from 'promptpay-qr'

type OrderData = {
  id: number
  order_number: string
  customer_name: string
  order_date: string
  status: string
  total: number
  shipping_cost: number
  discount: number
  payment_method: string
  target_bank_id: number
  items_summary: string
  tracking: string
  bill_type: string
  expiry_date: string
  invoice_token: string
  payment_slip_url: string
  shipping_address?: string
  address_subdistrict?: string
  address_district?: string
  address_province?: string
  address_zipcode?: string
  customer_phone?: string
  receiver_name?: string
  receiver_phone?: string
}

type OrderItem = {
  product_name: string
  product_sku: string
  qty: number
  price: number
  image_url?: string
}

type BankAccount = {
  id: number
  bank_name: string
  account_name: string
  account_no: string
  prompt_pay?: string
}

type InvoiceInfo = {
  order: OrderData
  items: OrderItem[]
  banks?: BankAccount[]
  bank?: BankAccount | null
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'รอเปิดบิล',
  unpaid: 'รอการชำระเงิน',
  transferred: 'รอตรวจสอบสลิป',
  pending: 'กำลังเตรียมจัดส่ง',
  shipped: 'จัดส่งพัสดุแล้ว',
  completed: 'สำเร็จ',
  cancelled: 'ยกเลิก',
  expired: 'หมดอายุ'
}

// Stepper flow for customer view
const CUSTOMER_FLOW = ['unpaid', 'transferred', 'pending', 'shipped']

export default function InvoiceClient({ token }: { token: string }) {
  const [data, setData] = useState<InvoiceInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [copiedAccount, setCopiedAccount] = useState(false)
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null)
  const [pendingSlipUrl, setPendingSlipUrl] = useState('')

  useEffect(() => {
    let currentOrderId: number | null = null

    async function loadData() {
      try {
        const { data: result, error: rpcError } = await supabase.rpc('get_public_invoice', { p_token: token })
        
        if (rpcError) throw rpcError
        if (!result) throw new Error('ไม่พบบิลที่ต้องการ หรือบิลถูกลบไปแล้ว')
        
        const invoiceData = result as InvoiceInfo
        currentOrderId = invoiceData.order.id
        setData(invoiceData)
        
        const bArray = invoiceData.banks && invoiceData.banks.length > 0 ? invoiceData.banks : (invoiceData.bank ? [invoiceData.bank] : [])
        if (bArray.length > 0) {
          setSelectedBankId(invoiceData.order.target_bank_id || bArray[0].id)
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()

    // Realtime sync for cross-device updates (admin changes status -> customer UI updates instantly)
    const channel = supabase
      .channel(`public_invoice_${token}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          if (currentOrderId && payload.new.id === currentOrderId) {
            loadData()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [token])

  const handleCopyAccount = () => {
    if (!data) return
    const { banks: rawBanks, bank: legacyBank } = data
    const bArray = rawBanks && rawBanks.length > 0 ? rawBanks : (legacyBank ? [legacyBank] : [])
    const b = bArray.find(b => b.id === selectedBankId) || bArray[0]
    if (!b?.account_no) return
    navigator.clipboard.writeText(b.account_no.replace(/\D/g,''))
    setCopiedAccount(true)
    setTimeout(() => setCopiedAccount(false), 2000)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError('')

    try {
      const ext = file.name.split('.').pop()
      const fileName = `${data?.order.id}_${Date.now()}.${ext}`
      
      const { error: uploadErr } = await supabase.storage
        .from('payment_slips')
        .upload(fileName, file)

      if (uploadErr) throw uploadErr

      const { data: publicUrlData } = supabase.storage
        .from('payment_slips')
        .getPublicUrl(fileName)

      const slipUrl = publicUrlData.publicUrl
      setPendingSlipUrl(slipUrl)

    } catch (err: any) {
      setUploadError('อัปโหลดสลิปไม่สำเร็จ: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const submitSlip = async () => {
    if (!pendingSlipUrl) return
    setUploading(true)
    setUploadError('')

    try {
      const { data: success, error: updateErr } = await supabase.rpc('update_invoice_slip', {
        p_token: token,
        p_slip_url: pendingSlipUrl
      })

      if (updateErr) throw updateErr
      if (!success) throw new Error('ไม่สามารถอัปเดตสถานะบิลได้ อาจเปลี่ยนสถานะไปแล้ว')

      // Update local state
      setData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          order: {
            ...prev.order,
            payment_slip_url: pendingSlipUrl,
            status: 'transferred',
            payment_method: 'bank_transfer'
          }
        }
      })
      setPendingSlipUrl('')
    } catch (err: any) {
      setUploadError('แจ้งโอนไม่สำเร็จ: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: 'var(--gold-primary)' }}>⏳ กำลังโหลดข้อมูล...</div>
  }

  if (error || !data) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div style={{ color: '#fff' }}>{error || 'ไม่พบข้อมูล'}</div>
        <p style={{ color: 'var(--gray-text)', fontSize: 13 }}>ลิงก์อาจถูกลบหรือหมดอายุ</p>
      </div>
    )
  }

  const { order, items, banks: rawBanks, bank: legacyBank } = data
  const banks = rawBanks && rawBanks.length > 0 ? rawBanks : (legacyBank ? [legacyBank] : [])
  
  // Clean bank account for PromptPay (Requires 10 digit phone or 13 digit ID)
  const selectedBankIdToUse = selectedBankId || banks[0]?.id
  const selectedBank = banks.find((b) => b.id === selectedBankIdToUse) || banks[0]
  
  const promptPayId = (selectedBank?.prompt_pay?.replace(/\D/g, '') || selectedBank?.account_no?.replace(/\D/g, '') || "0000000000")
  const payload = generatePayload(promptPayId.length >= 10 ? promptPayId : "0812345678", { amount: order.total })

  const currentStepIndex = CUSTOMER_FLOW.includes(order.status) 
    ? CUSTOMER_FLOW.indexOf(order.status) 
    : (order.status === 'completed' ? CUSTOMER_FLOW.length : -1)

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 60px' }}>
      
      {/* HEADER PAGE */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ color: 'var(--gold-primary)', letterSpacing: 2, margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>ASTERNA</h1>
          <p style={{ margin: 0, color: 'var(--gray-text)', fontSize: 13 }}>ใบเสร็จ / ใบแจ้งยอดเงิน (Invoice)</p>
        </div>
        
        {/* PROGRESS STEPPER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', minWidth: 280 }}>
          <div style={{ position: 'absolute', top: 12, left: '10%', right: '10%', height: 2, background: 'rgba(255,255,255,0.1)', zIndex: 0 }} />
          {[
            { id: 'unpaid', label: 'รอจ่าย' },
            { id: 'transferred', label: 'ตรวจสอบ' },
            { id: 'pending', label: 'เตรียมส่ง' },
            { id: 'shipped', label: 'จัดส่งแล้ว' }
          ].map((step, idx) => {
            const isCompleted = currentStepIndex >= idx
            const isActive = currentStepIndex === idx
            return (
              <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1, position: 'relative' }}>
                 <div style={{ 
                   width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                   background: isCompleted ? 'var(--gold-primary)' : '#333', 
                   color: isCompleted ? '#000' : '#888',
                   fontWeight: 700,
                   boxShadow: isActive ? '0 0 12px rgba(212, 175, 55, 0.4)' : 'none',
                   transition: 'all 0.3s'
                 }}>
                   {idx + 1}
                 </div>
                 <div style={{ fontSize: 11, color: isCompleted ? '#fff' : '#666', fontWeight: isActive ? 600 : 400 }}>{step.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', 
        gap: '24px', 
        alignItems: 'start' 
      }}>
        {/* LEFT COLUMN: ORDER INFO & ITEMS */}
        <div>
          <div style={{ background: '#fff', color: '#333', borderRadius: 12, padding: '32px 24px', marginBottom: 24, border: '1px solid #eaeaea' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eaeaea', paddingBottom: 16, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 24, color: '#2b2b2b', fontWeight: 700 }}>บิลเลขที่ {order.order_number || `#${order.id}`}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold-dark)', padding: '4px 12px', border: '1px solid var(--gold-dark)', borderRadius: 20 }}>ใบเสร็จ</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px 16px', fontSize: 14 }}>
              <div style={{ color: '#666' }}>ชื่อลูกค้า</div>
              <div style={{ fontWeight: 600, textAlign: 'right', color: '#222' }}>{order.receiver_name || order.customer_name}</div>
              
              <div style={{ color: '#666' }}>ออกบิลเมื่อ</div>
              <div style={{ textAlign: 'right', color: '#444' }}>
                {order.order_date ? new Date(order.order_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
              </div>

              <div style={{ color: '#666' }}>กรุณาชำระก่อน</div>
              <div style={{ textAlign: 'right', color: '#444' }}>
                {order.expiry_date ? new Date(order.expiry_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
              </div>
            </div>
            
            <div style={{ borderTop: '1px solid #eaeaea', marginTop: 24, paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', paddingBottom: 16, borderBottom: idx < items.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                  <div style={{ width: 64, height: 64, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#999', overflow: 'hidden', flexShrink: 0 }}>
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (item.product_sku || 'IMG')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#333', marginBottom: 8 }}>{item.product_name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <div style={{ color: '#666' }}>จำนวน {item.qty}</div>
                      <div style={{ fontWeight: 400, color: '#444' }}>{(item.price * item.qty).toLocaleString('en-US', { minimumFractionDigits: 2 })} บาท</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* SUBTOTALS */}
            <div style={{ marginTop: 8, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                <span>มูลค่าสินค้า</span>
                <span>{items.reduce((sum, item) => sum + item.price * item.qty, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} บาท</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                <span>ค่าจัดส่ง</span>
                <span>{order.shipping_cost > 0 ? order.shipping_cost.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'} บาท</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                <span>ส่วนลด</span>
                <span>{order.discount > 0 ? order.discount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'} บาท</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: '1px solid #eaeaea' }}>
                <span style={{ fontSize: 16, color: '#333' }}>ยอดสุทธิ</span>
                <span style={{ fontSize: 24, fontWeight: 700, color: '#2b2b2b' }}>{order.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} บาท</span>
              </div>
            </div>
            
            {order.tracking && (
              <div style={{ marginTop: 24, padding: '16px', background: '#f8f8f8', border: '1px solid #ebebeb', borderRadius: 8 }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>📦 เลขพัสดุ (Tracking No.)</div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1, color: '#333' }}>{order.tracking}</div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: PAYMENT & SHIPPING */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          <div style={{ background: '#fff', color: '#333', borderRadius: 12, padding: '24px', border: '1px solid #eaeaea' }}>
            {['pending', 'shipped', 'completed'].includes(order.status) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: 20, color: '#2b2b2b', margin: 0, fontWeight: 700 }}>สถานะ</h3>
                  <div style={{ color: '#0ea5e9', fontWeight: 600 }}>{STATUS_LABELS[order.status] || order.status}</div>
                </div>

                {/* GREEN BOX */}
                <div style={{ background: '#22c55e20', color: '#166534', padding: '24px', borderRadius: 8, textAlign: 'center', border: '1px solid #22c55e' }}>
                  <div style={{ fontSize: 28, marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
                     <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#22c55e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✓</div>
                  </div>
                  <div style={{ fontWeight: 600 }}>
                    {order.status === 'completed' ? 'ได้รับสินค้าเรียบร้อยแล้ว' :
                     order.status === 'shipped' ? 'จัดส่งสินค้าเรียบร้อยแล้ว' :
                     'ร้านได้รับเงินแล้ว อยู่ในขั้นตอนจัดส่ง'}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>การจัดส่ง</div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{order.shipping_cost > 0 ? 'จัดส่งพัสดุมาตรฐาน' : 'รับสินค้าด้วยตนเอง'}</div>
                  </div>

                  <div>
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>รหัสพัสดุ</div>
                    <div style={{ fontSize: 15, color: order.tracking ? '#333' : '#999', fontWeight: order.tracking ? 700 : 400 }}>
                      {order.tracking || 'สามารถติดตามรหัสได้ที่นี่'}
                    </div>
                  </div>

                  {/* SHIPPING DETAILS */}
                  <div style={{ borderTop: '1px solid #eaeaea', paddingTop: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                       <div style={{ fontSize: 13, color: '#666' }}>รายละเอียดจัดส่ง</div>
                    </div>
                    <div style={{ fontSize: 14, color: '#333', lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 600 }}>{order.receiver_name || order.customer_name}</div>
                      <div>{order.shipping_address || '-'} {order.address_subdistrict} {order.address_district} {order.address_province} {order.address_zipcode}</div>
                      <div>{order.receiver_phone || order.customer_phone || '-'}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <h3 style={{ fontSize: 20, color: '#2b2b2b', marginTop: 0, marginBottom: 24, fontWeight: 700 }}>วิธีชำระเงิน</h3>

                {/* SHIPPING DETAILS */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eaeaea', paddingBottom: 8, marginBottom: 12 }}>
                     <div style={{ fontSize: 14, color: '#666' }}>รายละเอียดจัดส่ง</div>
                  </div>
                  <div style={{ fontSize: 14, color: '#333', lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 600 }}>{order.receiver_name || order.customer_name}</div>
                    <div>{order.shipping_address || '-'} {order.address_subdistrict} {order.address_district} {order.address_province} {order.address_zipcode}</div>
                    <div>{order.receiver_phone || order.customer_phone || '-'}</div>
                  </div>
                </div>

                {/* PAYMENT LOGIC */}
                <div style={{ borderTop: '1px solid #eaeaea', paddingTop: 24 }}>
                  <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>โอนผ่านบัญชีธนาคาร</div>
                  
                  {!['cancelled', 'expired'].includes(order.status) && (
                    <>
                      {!order.payment_slip_url || ['draft', 'unpaid'].includes(order.status) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                          
                          {/* MULTIPLE BANK ACCOUNTS */}
                          {banks.length === 0 ? (
                            <div style={{ padding: 16, background: '#fee2e2', color: '#ef4444', borderRadius: 8, textAlign: 'center', fontSize: 14 }}>
                               ไม่พบบัญชีธนาคารที่เปิดใช้งาน กรุณาตั้งค่าธนาคารในระบบ หรือติดต่อร้านค้า
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {banks.map((b: any) => {
                               const isSelected = selectedBankId === b.id
                               return (
                                 <div 
                                   key={b.id} 
                                   onClick={() => setSelectedBankId(b.id)}
                                   style={{ 
                                     display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                                     background: isSelected ? '#f0fdf4' : '#fafafa', 
                                     padding: '12px 16px', borderRadius: 8, 
                                     border: isSelected ? '2px solid #2ecc71' : '1px solid #eaeaea', 
                                     cursor: 'pointer', transition: 'all 0.2s',
                                     position: 'relative'
                                   }}
                                 >
                                   <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                     <div style={{ width: 40, height: 40, background: '#138f2d', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                                        {b.bank_name?.charAt(0) || '-'}
                                     </div>
                                     <div style={{ textAlign: 'left' }}>
                                       <div style={{ fontSize: 13, fontWeight: 600 }}>{b.bank_name || 'ไม่ระบุธนาคาร'}</div>
                                       <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1, marginTop: 2, color: '#333' }}>{b.account_no || '-'}</div>
                                       <div style={{ fontSize: 12, color: '#666' }}>{b.account_name || '-'}</div>
                                     </div>
                                   </div>
                                   
                                   <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                     {isSelected && (
                                       <button 
                                         onClick={(e) => { e.stopPropagation(); handleCopyAccount(); }}
                                         style={{ background: 'var(--gold-light)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
                                       >
                                         {copiedAccount ? 'คัดลอกแล้ว ✓' : 'คัดลอกเลข'}
                                       </button>
                                     )}
                                     <div style={{ 
                                       width: 20, height: 20, borderRadius: '50%', border: isSelected ? '6px solid #2ecc71' : '2px solid #ccc', 
                                       background: '#fff', transition: 'all 0.2s'
                                     }} />
                                   </div>
                                 </div>
                               )
                            })}
                          </div>
                          )}

                          {/* QR CODE (updates based on selected bank) */}
                          {banks.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 12 }}>
                              <QRCodeSVG value={payload} size={150} />
                              <div style={{ color: '#000', textAlign: 'center' }}>
                                <div style={{ fontSize: 12, fontWeight: 500, color: '#666' }}>สแกน QR เพื่อชำระผ่านแอปธนาคาร</div>
                              </div>
                            </div>
                          )}

                          {/* SLIP UPLOAD / PREVIEW */}
                          <div style={{ borderTop: '1px solid #eaeaea', paddingTop: 20 }}>
                            {pendingSlipUrl ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #eaeaea', position: 'relative' }}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={pendingSlipUrl} alt="Preview" style={{ width: '100%', display: 'block' }} />
                                  <button 
                                    onClick={() => setPendingSlipUrl('')}
                                    style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                  >✕</button>
                                </div>
                                <button
                                  onClick={submitSlip}
                                  disabled={uploading}
                                  style={{ width: '100%', padding: '14px 0', background: 'var(--gold-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: uploading ? 0.7 : 1 }}
                                >
                                  {uploading ? 'กำลังบันทึก...' : 'แจ้งการโอนเงิน'}
                                </button>
                                {uploadError && <div style={{ color: 'var(--danger)', fontSize: 13, textAlign: 'center' }}>{uploadError}</div>}
                              </div>
                            ) : (
                              <label htmlFor="slip-upload" style={{ 
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                                padding: '24px 16px', border: '2px dashed #ddd', borderRadius: 8, 
                                cursor: uploading ? 'not-allowed' : 'pointer', background: '#fafafa',
                                transition: 'all 0.2s', opacity: uploading ? 0.6 : 1
                              }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: '#108ee9' }}>{uploading ? 'กำลังอัปโหลด...' : 'แนบสลิปโอนเงิน'}</span>
                                <span style={{ fontSize: 11, color: '#999', marginTop: 4 }}>รองรับ JPG, PNG</span>
                                
                                <input 
                                  id="slip-upload" type="file" accept="image/*" 
                                  onChange={handleFileUpload}
                                  disabled={uploading}
                                  style={{ display: 'none' }} 
                                />
                              </label>
                            )}
                            {!pendingSlipUrl && uploadError && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8, textAlign: 'center' }}>{uploadError}</div>}
                          </div>
                        </div>
                      ) : (
                        /* IF HAS SLIP AND IT'S "TRANSFERRED" */
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', paddingTop: 16 }}>
                          <div style={{ width: 64, height: 64, background: '#edfdf8', border: '1px solid #2ecc71', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#2ecc71' }}>✓</div>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: '#333' }}>ส่งหลักฐานแล้ว</div>
                            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>แอดมินกำลังตรวจสอบความถูกต้อง</div>
                          </div>
                          <div style={{ width: '100%', overflow: 'hidden', borderRadius: 8, border: '1px solid #eaeaea' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={order.payment_slip_url} alt="Payment Slip" style={{ width: '100%', display: 'block' }} />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: '#666' }}>
              หากมีข้อสงสัย หรือต้องการเปลี่ยนแปลงข้อมูลใดๆ<br/>ติดต่อร้านค้าโดยตรง
            </div>
            <a 
              href="https://line.me/R/ti/p/@asterna" 
              target="_blank" rel="noreferrer"
              style={{ display: 'inline-block', margin: '0 auto', background: '#d69e2e', color: '#fff', textDecoration: 'none', padding: '12px 32px', borderRadius: 4, fontWeight: 600, fontSize: 14 }}
            >
              ติดต่อร้านค้า
            </a>
          </div>

          {/* COMPLIANCE FOOTER */}
          <div style={{ textAlign: 'center', fontSize: 11, color: '#999', lineHeight: 1.6, marginTop: 24 }}>
            <p style={{ margin: '0 0 4px' }}>สร้างขึ้นโดยระบบอัตโนมัติของ Asterna</p>
            <p style={{ margin: 0 }}>บริษัทฯ ขอสงวนสิทธิ์ไม่รับเปลี่ยนหรือคืนสินค้า เว้นแต่กรณีที่เกิดจากความผิดพลาดของบริษัทฯ</p>
          </div>
        </div>
      </div>
      
      {/* GLOBAL CSS OVERRIDE FOR PUBLIC INVOICE (Since layout uses dark mode default) */}
      <style dangerouslySetInnerHTML={{__html: `
        body { background-color: #f7f7f7 !important; color: #333 !important; }
        @media (max-width: 768px) {
          .invoice-grid { grid-template-columns: 1fr !important; }
        }
      `}} />
    </div>
  )
}
