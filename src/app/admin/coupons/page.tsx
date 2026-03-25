'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import Link from 'next/link'

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

export default function CouponsPage() {
  const { can, loading: authLoading } = useAdminAuth()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  // Form
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newPercent, setNewPercent] = useState('')
  const [newMaxUses, setNewMaxUses] = useState('')
  const [newExpires, setNewExpires] = useState('')

  useEffect(() => { loadCoupons() }, [])

  async function loadCoupons() {
    setLoading(true)
    const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false })
    if (data) setCoupons(data)
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newCode.trim() || !newName.trim()) return
    if (!newAmount && !newPercent) return toast.error('กรุณาใส่ส่วนลดอย่างน้อยหนึ่งช่อง')

    setSaving(true)
    const { data, error } = await supabase.from('coupons').insert({
      code: newCode.trim().toUpperCase(),
      name: newName.trim(),
      discount_amount: newAmount ? parseFloat(newAmount) : null,
      discount_percent: newPercent ? parseFloat(newPercent) : null,
      max_uses: newMaxUses ? parseInt(newMaxUses) : null,
      expires_at: newExpires ? new Date(newExpires).toISOString() : null,
      is_active: true,
    }).select().single()

    if (error) {
      toast.error('เพิ่มคูปองไม่สำเร็จ: ' + (error.code === '23505' ? 'รหัสคูปองนี้มีอยู่แล้ว' : error.message))
    } else if (data) {
      setCoupons([data, ...coupons])
      setNewCode(''); setNewName(''); setNewAmount(''); setNewPercent(''); setNewMaxUses(''); setNewExpires('')
    }
    setSaving(false)
  }

  async function toggleActive(coupon: Coupon) {
    const { error } = await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id)
    if (!error) setCoupons(coupons.map(c => c.id === coupon.id ? { ...c, is_active: !c.is_active } : c))
  }

  async function handleDelete(id: number) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return }
    const { error } = await supabase.from('coupons').delete().eq('id', id)
    if (!error) setCoupons(coupons.filter(c => c.id !== id))
    else toast.error('ลบไม่สำเร็จ: ' + error.message)
    setConfirmDeleteId(null)
  }

  const formatDiscount = (c: Coupon) => {
    const parts: string[] = []
    if (c.discount_amount) parts.push(`-${c.discount_amount.toLocaleString()} ฿`)
    if (c.discount_percent) parts.push(`-${c.discount_percent}%`)
    return parts.join(' + ') || '—'
  }

  const isExpired = (c: Coupon) => c.expires_at ? new Date(c.expires_at) < new Date() : false
  const isExhausted = (c: Coupon) => c.max_uses !== null && c.uses_count >= c.max_uses

  const getStatusBadge = (c: Coupon) => {
    if (!c.is_active) return { label: 'ปิดใช้งาน', color: 'var(--gray-text)', bg: 'rgba(255,255,255,0.05)', border: 'var(--gray-border)' }
    if (isExpired(c)) return { label: 'หมดอายุ', color: '#e74c3c', bg: 'rgba(231,76,60,0.1)', border: '#e74c3c' }
    if (isExhausted(c)) return { label: 'ใช้ครบแล้ว', color: '#e74c3c', bg: 'rgba(231,76,60,0.1)', border: '#e74c3c' }
    return { label: 'ใช้งานได้', color: 'var(--success)', bg: 'rgba(76,175,118,0.15)', border: 'var(--success)' }
  }

  if (authLoading) {
    return <div className="page-body" style={{ padding: 40, color: 'var(--gold-primary)' }}>⏳ กำลังโหลด...</div>
  }

  if (!can('view_vouchers')) {
    return (
      <div className="page-body animate-in" style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>🔒</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>ไม่มีสิทธิ์เข้าถึง</h2>
        <p style={{ color: 'var(--gray-text)', marginBottom: 24 }}>หน้านี้สำหรับผู้ที่มีสิทธิ์ดูคูปองส่วนลดเท่านั้น</p>
        <Link href="/admin" className="btn btn-primary">← กลับ Dashboard</Link>
      </div>
    )
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">🎟️ จัดการคูปอง</span>
      </div>

      <div className="page-body animate-in" style={{ maxWidth: 1000 }}>

        {/* Add Form */}
        {can('edit_vouchers') && (
          <div className="card" style={{ padding: 24, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>+ สร้างคูปองใหม่</h3>
            <p style={{ fontSize: 12, color: 'var(--gray-text)', marginBottom: 20 }}>
              รหัสคูปองจะถูกแปลงเป็นตัวพิมพ์ใหญ่อัตโนมัติ · ส่วนลด ฿ หรือ % หรือทั้งคู่
            </p>
            <form onSubmit={handleAdd}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 6 }}>
                    รหัสคูปอง <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="เช่น WELCOME100"
                    value={newCode}
                    onChange={e => setNewCode(e.target.value.toUpperCase())}
                    style={{ width: '100%', letterSpacing: 2, fontWeight: 700 }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 6 }}>
                    ชื่อคูปอง (สำหรับแอดมิน) <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="เช่น โปรต้อนรับสมาชิกใหม่"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    style={{ width: '100%' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 6 }}>ลดคงที่ (฿)</label>
                  <input type="number" className="input" placeholder="0" min={0} value={newAmount}
                    onChange={e => setNewAmount(e.target.value)} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 6 }}>ลด (%)</label>
                  <div style={{ position: 'relative' }}>
                    <input type="number" className="input" placeholder="0" min={0} max={100} value={newPercent}
                      onChange={e => setNewPercent(e.target.value)} style={{ width: '100%', paddingRight: 28 }} />
                    <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-text)', fontSize: 13 }}>%</span>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 6 }}>
                    จำกัดจำนวนครั้ง
                    <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>(ว่าง = ไม่จำกัด)</span>
                  </label>
                  <input type="number" className="input" placeholder="ไม่จำกัด" min={1} value={newMaxUses}
                    onChange={e => setNewMaxUses(e.target.value)} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 6 }}>
                    วันหมดอายุ
                    <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>(ว่าง = ถาวร)</span>
                  </label>
                  <input type="date" className="input" value={newExpires}
                    onChange={e => setNewExpires(e.target.value)} style={{ width: '100%' }} />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '10px 28px' }}>
                {saving ? '⏳ กำลังสร้าง...' : '+ สร้างคูปอง'}
              </button>
            </form>
          </div>
        )}

        {/* Coupons Table */}
        <div className="card">
          <div className="card-body table-wrap">
            {loading ? (
              <div className="empty-state"><p>⏳ กำลังโหลด...</p></div>
            ) : coupons.length === 0 ? (
              <div className="empty-state">
                <div className="emoji">🎟️</div>
                <p>ยังไม่มีคูปอง</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>รหัส</th>
                    <th>ชื่อ</th>
                    <th style={{ textAlign: 'center' }}>ส่วนลด</th>
                    <th style={{ textAlign: 'center' }}>การใช้งาน</th>
                    <th style={{ textAlign: 'center' }}>หมดอายุ</th>
                    <th style={{ textAlign: 'center' }}>สถานะ</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map(c => {
                    const badge = getStatusBadge(c)
                    return (
                      <tr key={c.id} style={{ opacity: (!c.is_active || isExpired(c) || isExhausted(c)) ? 0.55 : 1 }}>
                        <td>
                          <span style={{
                            fontFamily: 'monospace', fontWeight: 800, fontSize: 13,
                            background: 'rgba(201,168,76,0.12)', color: 'var(--gold-primary)',
                            padding: '4px 10px', borderRadius: 6, letterSpacing: 1
                          }}>
                            {c.code}
                          </span>
                        </td>
                        <td style={{ fontSize: 13 }}>{c.name}</td>
                        <td style={{ textAlign: 'center', color: 'var(--danger)', fontWeight: 700, fontSize: 13 }}>
                          {formatDiscount(c)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 13 }}>
                            {c.max_uses !== null ? (
                              <>
                                <span style={{ fontWeight: 700 }}>{c.uses_count}</span>
                                <span style={{ color: 'var(--gray-text)' }}>/{c.max_uses}</span>
                                <div style={{ marginTop: 4, height: 4, background: 'var(--gray-border)', borderRadius: 4, overflow: 'hidden', width: 60, margin: '4px auto 0' }}>
                                  <div style={{
                                    height: '100%', borderRadius: 4,
                                    width: `${Math.min(100, (c.uses_count / c.max_uses) * 100)}%`,
                                    background: isExhausted(c) ? '#e74c3c' : 'var(--success)'
                                  }} />
                                </div>
                              </>
                            ) : (
                              <span style={{ color: 'var(--gray-text)' }}>{c.uses_count} / ∞</span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontSize: 12, color: isExpired(c) ? '#e74c3c' : 'var(--gray-text)' }}>
                          {c.expires_at
                            ? new Date(c.expires_at).toLocaleDateString('th-TH')
                            : <span style={{ opacity: 0.5 }}>ถาวร</span>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => can('edit_vouchers') && toggleActive(c)}
                            disabled={isExpired(c) || isExhausted(c) || !can('edit_vouchers')}
                            style={{
                              background: badge.bg, color: badge.color,
                              border: `1px solid ${badge.border}`,
                              borderRadius: 20, padding: '4px 12px', fontSize: 11,
                              fontWeight: 600, cursor: (isExpired(c) || isExhausted(c) || !can('edit_vouchers')) ? 'default' : 'pointer',
                              opacity: can('edit_vouchers') ? 1 : 0.6
                            }}
                          >
                            {badge.label}
                          </button>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {can('edit_vouchers') ? (
                            confirmDeleteId === c.id ? (
                              <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button onClick={() => handleDelete(c.id)}
                                  style={{ background: '#e53e3e', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                  ยืนยันลบ
                                </button>
                                <button onClick={() => setConfirmDeleteId(null)}
                                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: 'var(--gray-text)' }}>
                                  ✕
                                </button>
                              </span>
                            ) : (
                              <button onClick={() => handleDelete(c.id)} title="ลบ"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#e53e3e', padding: '4px 8px', borderRadius: 6 }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(229,62,62,0.12)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                🗑️
                              </button>
                            )
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,0.1)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
