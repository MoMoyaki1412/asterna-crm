'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type Campaign = {
  id: number
  name: string
  discount_amount: number | null
  discount_percent: number | null
  is_active: boolean
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newPercent, setNewPercent] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  useEffect(() => {
    loadCampaigns()
  }, [])

  async function loadCampaigns() {
    setLoading(true)
    const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false })
    if (data) setCampaigns(data)
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    if (!newAmount && !newPercent) {
      toast.error('กรุณาใส่ส่วนลดอย่างน้อยหนึ่งช่อง (฿ หรือ %)')
      return
    }
    setSaving(true)
    const { data, error } = await supabase.from('campaigns').insert({
      name: newName.trim(),
      discount_amount: newAmount ? parseFloat(newAmount) : null,
      discount_percent: newPercent ? parseFloat(newPercent) : null,
      is_active: true,
    }).select().single()

    if (error) {
      toast.error('เพิ่มแคมเปญไม่สำเร็จ: ' + error.message)
    } else if (data) {
      setCampaigns([data, ...campaigns])
      setNewName('')
      setNewAmount('')
      setNewPercent('')
    }
    setSaving(false)
  }

  async function toggleActive(campaign: Campaign) {
    const { error } = await supabase
      .from('campaigns')
      .update({ is_active: !campaign.is_active })
      .eq('id', campaign.id)
    if (!error) {
      setCampaigns(campaigns.map(c => c.id === campaign.id ? { ...c, is_active: !c.is_active } : c))
    }
  }

  async function handleDelete(id: number) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      return
    }
    const { error } = await supabase.from('campaigns').delete().eq('id', id)
    if (!error) {
      setCampaigns(campaigns.filter(c => c.id !== id))
    } else {
      toast.error('ลบไม่สำเร็จ: ' + error.message)
    }
    setConfirmDeleteId(null)
  }

  const formatDiscount = (c: Campaign) => {
    const parts: string[] = []
    if (c.discount_amount) parts.push(`${c.discount_amount.toLocaleString()} ฿`)
    if (c.discount_percent) parts.push(`${c.discount_percent}%`)
    return parts.join(' + ') || '—'
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">🎯 จัดการแคมเปญส่วนลด</span>
      </div>

      <div className="page-body animate-in" style={{ maxWidth: 860 }}>

        {/* Add Form */}
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>+ เพิ่มแคมเปญใหม่</h3>
          <p style={{ fontSize: 12, color: 'var(--gray-text)', marginBottom: 16 }}>
            กรอกส่วนลดแบบ ฿ หรือ % หรือทั้งคู่ก็ได้ (ระบบจะคิดลดสะสม)
          </p>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 6 }}>ชื่อแคมเปญ <span style={{ color: 'red' }}>*</span></label>
              <input
                type="text"
                className="input"
                placeholder="เช่น โปรเดือนเกิด ลด 10%"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                style={{ width: '100%' }}
                required
              />
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 6 }}>ส่วนลดคงที่ (฿)</label>
              <input
                type="number"
                className="input"
                placeholder="0"
                min={0}
                value={newAmount}
                onChange={e => setNewAmount(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 6 }}>ส่วนลด % (จากยอดรวม)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  className="input"
                  placeholder="0"
                  min={0}
                  max={100}
                  value={newPercent}
                  onChange={e => setNewPercent(e.target.value)}
                  style={{ width: '100%', paddingRight: 28 }}
                />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-text)', fontSize: 13 }}>%</span>
              </div>
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
              style={{ padding: '10px 22px', whiteSpace: 'nowrap' }}
            >
              {saving ? '⏳...' : '+ เพิ่ม'}
            </button>
          </form>
        </div>

        {/* Campaigns List */}
        <div className="card">
          <div className="card-body table-wrap">
            {loading ? (
              <div className="empty-state"><p>⏳ กำลังโหลด...</p></div>
            ) : campaigns.length === 0 ? (
              <div className="empty-state">
                <div className="emoji">🎯</div>
                <p>ยังไม่มีแคมเปญส่วนลด</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>ชื่อแคมเปญ</th>
                    <th style={{ textAlign: 'center' }}>ลดคงที่ (฿)</th>
                    <th style={{ textAlign: 'center' }}>ลด (%)</th>
                    <th style={{ textAlign: 'center' }}>สถานะ</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td style={{ textAlign: 'center', color: c.discount_amount ? 'var(--danger)' : 'var(--gray-text)', fontWeight: c.discount_amount ? 700 : 400 }}>
                        {c.discount_amount ? `-${c.discount_amount.toLocaleString()} ฿` : '—'}
                      </td>
                      <td style={{ textAlign: 'center', color: c.discount_percent ? 'var(--danger)' : 'var(--gray-text)', fontWeight: c.discount_percent ? 700 : 400 }}>
                        {c.discount_percent ? `-${c.discount_percent}%` : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => toggleActive(c)}
                          style={{
                            background: c.is_active ? 'rgba(76,175,118,0.15)' : 'rgba(255,255,255,0.05)',
                            color: c.is_active ? 'var(--success)' : 'var(--gray-text)',
                            border: `1px solid ${c.is_active ? 'var(--success)' : 'var(--gray-border)'}`,
                            borderRadius: 20, padding: '4px 12px', fontSize: 12,
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          {c.is_active ? '✓ เปิดใช้งาน' : '✕ ปิดการใช้งาน'}
                        </button>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {confirmDeleteId === c.id ? (
                          <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => handleDelete(c.id)}
                              style={{ background: '#e53e3e', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                              ยืนยันลบ
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: 'var(--gray-text)' }}
                            >
                              ✕
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleDelete(c.id)}
                            title="ลบแคมเปญ"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#e53e3e', padding: '4px 8px', borderRadius: 6 }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(229,62,62,0.12)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            🗑️
                          </button>
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
    </>
  )
}
