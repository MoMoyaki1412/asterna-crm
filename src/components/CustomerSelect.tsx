'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

export type Customer = {
  id: number
  name: string
  phone?: string
  address?: string
  address_subdistrict?: string
  address_district?: string
  address_province?: string
  address_zipcode?: string
  total_orders?: number
  tags?: string
  reward_points?: number
}

export function CustomerSelect({ onSelect }: { onSelect: (c: Customer | null) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState<Customer | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // New customer mini-form
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newSubdistrict, setNewSubdistrict] = useState('')
  const [newDistrict, setNewDistrict] = useState('')
  const [newProvince, setNewProvince] = useState('')
  const [newZipcode, setNewZipcode] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setShowCreateForm(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setIsOpen(false)
      setShowCreateForm(false)
      return
    }
    if (selected && query === selected.name) return

    setShowCreateForm(false)
    const search = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, address, total_orders, tags, reward_points')
        .ilike('name', `%${query}%`)
        .order('total_orders', { ascending: false })
        .limit(10)
      
      setResults(data || [])
      setIsOpen(true)
      setLoading(false)
    }
    
    const timeoutId = setTimeout(search, 300)
    return () => clearTimeout(timeoutId)
  }, [query, selected])

  const handleSelect = (c: Customer) => {
    setSelected(c)
    setQuery(c.name)
    setIsOpen(false)
    setShowCreateForm(false)
    onSelect(c)
  }

  const handleClear = () => {
    setSelected(null)
    setQuery('')
    setShowCreateForm(false)
    onSelect(null)
  }

  const handleCreateNew = async () => {
    if (!query.trim()) return
    setCreating(true)
    const { data, error } = await supabase
      .from('customers')
      .insert({ 
        name: query.trim(), 
        phone: newPhone.trim() || null, 
        address: newAddress.trim() || null, 
        address_subdistrict: newSubdistrict.trim() || null,
        address_district: newDistrict.trim() || null,
        address_province: newProvince.trim() || null,
        address_zipcode: newZipcode.trim() || null,
        total_orders: 0 
      })
      .select()
      .single()

    if (error) {
      toast.error('สร้างลูกค้าไม่สำเร็จ: ' + error.message)
    } else if (data) {
      handleSelect(data)
      setNewPhone('')
      setNewAddress('')
      setNewSubdistrict('')
      setNewDistrict('')
      setNewProvince('')
      setNewZipcode('')
    }
    setCreating(false)
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        ค้นหา / เพิ่มลูกค้า <span style={{ color: 'red' }}>*</span>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (selected) onSelect(null)
            setSelected(null)
          }}
          placeholder="พิมพ์ชื่อลูกค้า..."
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)' }}
        />
        {selected && (
          <button type="button" onClick={handleClear} className="btn btn-ghost" style={{ padding: '0 12px' }}>
            ✕
          </button>
        )}
      </div>

      {/* Selected badge */}
      {selected && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
          <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>{selected.name}</span>
          {selected.phone && <span style={{ fontSize: 12, color: 'var(--gray-text)' }}>· {selected.phone}</span>}
        </div>
      )}

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'var(--black-card)', border: '1px solid var(--gray-border)', borderRadius: 8,
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)', zIndex: 100, maxHeight: 360, overflowY: 'auto'
        }}>
          {loading ? (
            <div style={{ padding: 12, fontSize: 14, color: 'var(--gray-text)' }}>กำลังค้นหา...</div>
          ) : results.length > 0 ? (
            <>
              {results.map(c => (
                <div
                  key={c.id}
                  onClick={() => handleSelect(c)}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--gray-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--black-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--black-card)')}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-text)' }}>{c.phone || 'ไม่มีเบอร์โทร'}</div>
                  </div>
                  <div style={{ fontSize: 12, background: 'var(--gold-light)', color: 'var(--gold-dark)', padding: '2px 8px', borderRadius: 12 }}>
                    ซื้อ {c.total_orders || 0} ครั้ง
                  </div>
                </div>
              ))}
              {/* Option to create even if there are partial matches */}
              <div
                onClick={() => { setIsOpen(false); setShowCreateForm(true) }}
                style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--gold-primary)', fontSize: 13, fontWeight: 600, borderTop: '1px solid var(--gray-border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--black-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--black-card)')}
              >
                <span style={{ fontSize: 18 }}>＋</span> สร้างลูกค้าใหม่ "{query}"
              </div>
            </>
          ) : (
            <div>
              <div style={{ padding: '12px 14px', fontSize: 14, color: 'var(--gray-text)' }}>
                ไม่พบลูกค้า "{query}"
              </div>
              <div
                onClick={() => { setIsOpen(false); setShowCreateForm(true) }}
                style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--gold-primary)', fontSize: 13, fontWeight: 700, borderTop: '1px solid var(--gray-border)', background: 'rgba(201,168,76,0.06)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.06)')}
              >
                <span style={{ fontSize: 20 }}>＋</span> สร้างลูกค้าใหม่ "{query}"
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inline create form */}
      {showCreateForm && !selected && (
        <div style={{
          marginTop: 8, padding: 16, background: 'rgba(201,168,76,0.07)',
          border: '1px solid var(--gold-dark)', borderRadius: 10
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold-primary)', marginBottom: 12 }}>
            ➕ สร้างลูกค้าใหม่: <span style={{ color: '#fff' }}>{query}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--gray-text)', marginBottom: 6 }}>ผู้รับ / เบอร์โทรศัพท์</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" className="input" placeholder="ชื่อผู้รับ" value={query} readOnly style={{ flex: 1.5, fontSize: 13, background: 'var(--black-deep)', opacity: 0.8 }} />
                <input type="tel" className="input" placeholder="เบอร์โทร" value={newPhone} onChange={e => setNewPhone(e.target.value)} style={{ flex: 1, fontSize: 13 }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--gray-text)', marginBottom: 6 }}>ที่อยู่จัดส่ง (บ้านเลขที่, ถนน, หมู่บ้าน)</label>
              <textarea className="input" rows={2} placeholder="รายละเอียดบ้านเลขที่ และถนน..." value={newAddress} onChange={e => setNewAddress(e.target.value)} style={{ width: '100%', fontSize: 13, resize: 'none' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--gray-text)', marginBottom: 4 }}>ตำบล / แขวง</label>
                <input type="text" className="input" value={newSubdistrict} onChange={e => setNewSubdistrict(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--gray-text)', marginBottom: 4 }}>อำเภอ / เขต</label>
                <input type="text" className="input" value={newDistrict} onChange={e => setNewDistrict(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--gray-text)', marginBottom: 4 }}>จังหวัด</label>
                <input type="text" className="input" value={newProvince} onChange={e => setNewProvince(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--gray-text)', marginBottom: 4 }}>รหัสไปรษณีย์</label>
                <input type="text" className="input" value={newZipcode} onChange={e => setNewZipcode(e.target.value)} style={{ width: '100%', fontSize: 12, letterSpacing: 1 }} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleCreateNew}
              disabled={creating}
              className="btn btn-primary"
              style={{ padding: '8px 20px', fontSize: 13 }}
            >
              {creating ? '⏳ กำลังสร้าง...' : '✓ ยืนยันสร้างลูกค้า'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="btn btn-ghost"
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
