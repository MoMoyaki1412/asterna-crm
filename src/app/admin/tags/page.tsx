'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type Tier = {
  id: number
  name: string
  discount_percent: number
  product_discounts?: { sku: string, amount: number }[]
  is_dealer: boolean
}

type Tag = {
  id: number
  name: string
  color: string
}

export default function TagsManagementPage() {
  const [tiers, setTiers] = useState<Tier[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [products, setProducts] = useState<{id:number, name:string, sku:string}[]>([])
  const [loading, setLoading] = useState(true)

  // New Tier form
  const [newTierName, setNewTierName] = useState('')
  const [tierMode, setTierMode] = useState<'PERCENT'|'PER_PRODUCT'>('PERCENT')
  const [newTierDiscount, setNewTierDiscount] = useState('')
  const [newTierProductDiscounts, setNewTierProductDiscounts] = useState<{sku:string, amount:number}[]>([])
  const [newTierIsDealer, setNewTierIsDealer] = useState(false)

  // New Tag form
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#2ecc71')
  const [confirmDeleteTagId, setConfirmDeleteTagId] = useState<number | null>(null)
  const [confirmDeleteTierId, setConfirmDeleteTierId] = useState<number | null>(null)

  useEffect(() => {
    async function loadData() {
      const [tRes, cRes, pRes] = await Promise.all([
        supabase.from('customer_tiers').select('*').order('discount_percent', { ascending: true }),
        supabase.from('customer_tags').select('*').order('name', { ascending: true }),
        supabase.from('products').select('id, name, sku').eq('is_active', true).order('id')
      ])

      if (tRes.data) setTiers(tRes.data)
      if (cRes.data) setTags(cRes.data)
      if (pRes.data) setProducts(pRes.data)
      setLoading(false)
    }
    loadData()
  }, [])

  async function addTier(e: React.FormEvent) {
    e.preventDefault()
    if (!newTierName.trim()) return
    const payload = {
      name: newTierName.trim(),
      discount_percent: tierMode === 'PERCENT' ? (parseFloat(newTierDiscount) || 0) : 0,
      product_discounts: tierMode === 'PER_PRODUCT' ? newTierProductDiscounts.filter(pd => pd.amount > 0) : [],
      is_dealer: newTierIsDealer
    }
    const { data, error } = await supabase.from('customer_tiers').insert(payload).select().single()

    if (error) {
      toast.error('Error: ' + error.message)
    } else if (data) {
      setTiers([...tiers, data].sort((a,b) => a.discount_percent - b.discount_percent))
      setNewTierName('')
      setNewTierDiscount('')
      setNewTierProductDiscounts([])
      setTierMode('PERCENT')
      setNewTierIsDealer(false)
    }
  }

  async function deleteTier(id: number) {
    if (confirmDeleteTierId !== id) {
      setConfirmDeleteTierId(id)
      return
    }
    const { error } = await supabase.from('customer_tiers').delete().eq('id', id)
    if (error) {
      toast.error('ลบไม่สำเร็จ: ' + error.message)
    } else {
      setTiers(tiers.filter(t => t.id !== id))
    }
    setConfirmDeleteTierId(null)
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault()
    if (!newTagName.trim()) return
    const { data, error } = await supabase.from('customer_tags').insert({
      name: newTagName.trim(),
      color: newTagColor
    }).select().single()

    if (error) {
      toast.error('Error: ' + error.message)
    } else if (data) {
      setTags([...tags, data].sort((a,b) => a.name.localeCompare(b.name)))
      setNewTagName('')
    }
  }

  async function deleteTag(id: number) {
    if (confirmDeleteTagId !== id) {
      setConfirmDeleteTagId(id)
      return
    }
    const { error } = await supabase.from('customer_tags').delete().eq('id', id)
    if (error) {
      toast.error('ลบไม่สำเร็จ: ' + error.message)
    } else {
      setTags(tags.filter(t => t.id !== id))
    }
    setConfirmDeleteTagId(null)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>⏳ กำลังโหลดข้อมูล...</div>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">🏷️ จัดการระดับและแท็ก (Tiers & Tags)</span>
      </div>

      <div className="page-body animate-in" style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 64 }}>
        
        {/* Page Description */}
        <div style={{ marginBottom: 32, background: 'var(--black-card)', padding: 24, borderRadius: 12, border: '1px solid var(--gray-border)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-primary)', marginBottom: 8 }}>ตั้งค่าระบบการผูกติดส่วนลด (Auto Pricing Engine)</h2>
          <p style={{ color: 'var(--gray-text)', fontSize: 13, lineHeight: 1.6 }}>จัดการระดับลูกค้า (Tiers) และผูกส่วนลด % อัตโนมัติ หรือใช้แท็ก (Tags) เพื่อทำเครื่องหมายแยกลูกค้า</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 1fr', gap: 32 }}>

          {/* ============ TIERS MANAGEMENT ============ */}
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              👑 ระดับลูกค้า (Tiers)
            </h3>
            
            {/* Add Form */}
            <form onSubmit={addTier} style={{ background: 'var(--black-deep)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', textTransform: 'uppercase', marginBottom: 8 }}>ชื่อระดับ (เช่น VIP, Dealer)</label>
                <input 
                  type="text" 
                  value={newTierName} 
                  onChange={e => setNewTierName(e.target.value)} 
                  className="input" 
                  style={{ width: '100%' }} 
                  placeholder="กรอกชื่อระดับ..." 
                  required 
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--gold-primary)', fontWeight: 'bold' }}>
                  <input type="checkbox" checked={newTierIsDealer} onChange={e => setNewTierIsDealer(e.target.checked)} />
                  ใช้ราคาส่งสำหรับ Dealer (จะดึงราคา Dealer จากสินค้าโดยตรง)
                </label>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', textTransform: 'uppercase', marginBottom: 8 }}>รูปแบบส่วนลด</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="radio" checked={tierMode === 'PERCENT'} onChange={() => setTierMode('PERCENT')} />
                    ลดทั้งบิลแบบเปอร์เซ็นต์ (%)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="radio" checked={tierMode === 'PER_PRODUCT'} onChange={() => setTierMode('PER_PRODUCT')} />
                    ระบุส่วนลดรายสินค้า (฿)
                  </label>
                </div>
              </div>

              {tierMode === 'PERCENT' ? (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', textTransform: 'uppercase', marginBottom: 8 }}>ส่วนลดอัตโนมัติ (%)</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="number" 
                      value={newTierDiscount} 
                      onChange={e => setNewTierDiscount(e.target.value)} 
                      className="input" 
                      style={{ width: '100%', paddingRight: 32 }} 
                      placeholder="0" 
                      min="0" max="100" 
                    />
                    <span style={{ position: 'absolute', right: 12, top: 10, color: 'var(--gray-text)' }}>%</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gray-text)', marginTop: 8 }}>ทุกออร์เดอร์ของลูกค้าระดับนี้จะได้ลดตาม % นี้อัตโนมัติ</div>
                </div>
              ) : (
                <div style={{ marginBottom: 16, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', textTransform: 'uppercase' }}>ลดรายสินค้า</label>
                    <button type="button" onClick={() => {
                        if (products.length > 0) setNewTierProductDiscounts([...newTierProductDiscounts, {sku: products[0].sku, amount: 0}])
                      }} className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11, borderColor: 'var(--gold-dark)', color: 'var(--gold-primary)' }}>+ เพิ่ม
                    </button>
                  </div>
                  
                  {newTierProductDiscounts.length === 0 ? (
                     <div style={{ fontSize: 12, color: 'var(--gray-text)', fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>คลิก + เพิ่ม เพื่อระบุส่วนลดสินค้า</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {newTierProductDiscounts.map((pd, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8 }}>
                          <select className="input" value={pd.sku} onChange={e => {
                            const list = [...newTierProductDiscounts]; list[i].sku = e.target.value; setNewTierProductDiscounts(list);
                          }} style={{ flex: 1, padding: '6px 10px', fontSize: 12 }}>
                            {products.map(p => <option key={p.id} value={p.sku}>[{p.sku}] {p.name}</option>)}
                          </select>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ color: 'var(--danger)' }}>-</span>
                            <input type="number" className="input" min={1} value={pd.amount || ''} onChange={e => {
                              const list = [...newTierProductDiscounts]; list[i].amount = parseInt(e.target.value) || 0; setNewTierProductDiscounts(list);
                            }} placeholder="บาท" style={{ width: 70, padding: '6px 10px', textAlign: 'right', fontSize: 12 }} />
                            <button type="button" onClick={() => {
                              const list = [...newTierProductDiscounts]; list.splice(i, 1); setNewTierProductDiscounts(list);
                            }} style={{ background: 'transparent', border: 'none', color: 'var(--gray-text)', cursor: 'pointer', outline: 'none' }}>✖</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>+ เพิ่มระดับลูกค้า</button>
            </form>

            <div style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--gray-border)' }}>
                  <tr>
                    <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, color: 'var(--gray-text)', fontWeight: 600 }}>ชื่อระดับ</th>
                    <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12, color: 'var(--gray-text)', fontWeight: 600 }}>ส่วนลด</th>
                    <th style={{ width: 40, padding: '12px 20px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ padding: 20, textAlign: 'center', color: 'var(--gray-text)', fontSize: 13 }}>ไม่มีระดับลูกค้า</td>
                    </tr>
                  ) : tiers.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '14px 20px', fontWeight: 600, fontSize: 14 }}>{t.name} {t.is_dealer && <span style={{ fontSize: 11, background: 'var(--gold-primary)', color: '#000', padding: '2px 6px', borderRadius: 4, marginLeft: 8 }}>DEALER</span>}</td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: (t.is_dealer || t.discount_percent > 0 || (t.product_discounts && t.product_discounts.length > 0)) ? 'var(--success)' : 'var(--gray-text)', fontWeight: 700 }}>
                        {t.is_dealer ? 'ราคา Dealer' : (
                          t.discount_percent > 0 ? `${t.discount_percent}%` : (
                            t.product_discounts && t.product_discounts.length > 0 ? `ลด ${t.product_discounts.length} สินค้า` : '-'
                          )
                        )}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        {confirmDeleteTierId === t.id ? (
                          <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button
                              onClick={() => deleteTier(t.id)}
                              style={{ background: '#e53e3e', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                              ยืนยันลบ
                            </button>
                            <button
                              onClick={() => setConfirmDeleteTierId(null)}
                              style={{ background: 'none', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: 'var(--gray-text)' }}
                            >
                              ✕
                            </button>
                          </span>
                        ) : (
                          <button onClick={() => deleteTier(t.id)} title="ลบ" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', opacity: 0.6 }}>✖</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ============ TAGS MANAGEMENT ============ */}
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              🏷️ แท็กทั่วไป (General Tags)
            </h3>
            
            {/* Add Form */}
            <form onSubmit={addTag} style={{ background: 'var(--black-deep)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', textTransform: 'uppercase', marginBottom: 8 }}>ชื่อแท็ก (เช่น ผู้ชาย, โอนช้า)</label>
                <input 
                  type="text" 
                  value={newTagName} 
                  onChange={e => setNewTagName(e.target.value)} 
                  className="input" 
                  style={{ width: '100%' }} 
                  placeholder="กรอกชื่อแท็ก..." 
                  required 
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', textTransform: 'uppercase', marginBottom: 8 }}>สีของแท็ก (Badge Color)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 220 }}>
                  {[
                    '#e84118', '#4cd137', '#0097e6', '#fbc531', '#9c88ff', '#e67e22', '#ff9ff3',
                    '#273c75', '#1abc9c', '#c0392b', '#1dd1a1', '#d35400', '#ced6e0', '#2f3640',
                    '#5f27cd', '#00d2d3', '#ff9f43', '#ff6b6b', '#1e3799', '#82589f', '#48dbfb'
                  ].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewTagColor(color)}
                      style={{
                        width: 24, height: 24, borderRadius: '50%', background: color, border: 'none', cursor: 'pointer',
                        outline: newTagColor === color ? `2px solid #fff` : 'none', outlineOffset: 2
                      }}
                    />
                  ))}
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', background: '#34495e' }}>+ เพิ่มแท็ก</button>
            </form>

            <div style={{ background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 20 }}>
              {tags.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--gray-text)', fontSize: 13 }}>ไม่มีแท็กทั่วไป</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {tags.map(t => (
                    <div 
                      key={t.id} 
                      style={{ 
                        background: t.color, 
                        color: t.color === '#f1c40f' ? '#000' : '#fff', 
                        padding: '4px 12px', 
                        borderRadius: 16, 
                        fontSize: 12, 
                        fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 6 
                      }}
                    >
                      {t.name}
                      {confirmDeleteTagId === t.id ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <button
                            onClick={() => deleteTag(t.id)}
                            style={{ background: 'rgba(0,0,0,0.3)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: 4, padding: '0px 5px', fontSize: 10, fontWeight: 700 }}
                          >ยืนยัน</button>
                          <button
                            onClick={() => setConfirmDeleteTagId(null)}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 0, fontSize: 12 }}
                          >✕</button>
                        </span>
                      ) : (
                        <button
                          onClick={() => deleteTag(t.id)}
                          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7, padding: 0 }}
                        >✖</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </>
  )
}
