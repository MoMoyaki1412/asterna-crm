'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type PaperSettings = {
  store_name: string
  store_address: string
  store_province: string
  store_phone: string
  paper_size: 'a4' | 'a6'
  show_product_image: boolean
  show_store_details: boolean
  show_customer_details: boolean
  show_prices_on_packing: boolean
  show_shipping_label: boolean
  brand_name: string
  brand_logo: string
}

const DEFAULT_SETTINGS: PaperSettings = {
  store_name: 'ASTERNA',
  store_address: '18/2 ถนนวังพาน ตำบลหัวเวียง อำเภอเมือง',
  store_province: 'จังหวัดลำปาง 52000',
  store_phone: '0819605469',
  paper_size: 'a4',
  show_product_image: false,
  show_store_details: true,
  show_customer_details: true,
  show_prices_on_packing: true,
  show_shipping_label: true,
  brand_name: 'ASTERNA',
  brand_logo: '',
}

export default function PaperSettingsPage() {
  const [settings, setSettings] = useState<PaperSettings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'paper_settings')
        .single()
      if (data?.value) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.value })
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'paper_settings', value: settings }, { onConflict: 'key' })
      if (error) throw error
    } catch (e: any) {
      console.warn('Supabase save failed, falling back to localStorage.', e.message || '')
      try {
        localStorage.setItem('paper_settings', JSON.stringify(settings))
      } catch (err) {
        toast.error('เกิดข้อผิดพลาดในการบันทึก: ไฟล์รูปภาพอาจใหญ่เกินไป กรุณาใช้ไฟล์ขนาดเล็ก หรือเลือกรูปภาพโปร่งใสขนาดไม่เกิน 500kb')
      }
    } finally {
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const update = (key: keyof PaperSettings, val: any) => {
    setSettings(prev => ({ ...prev, [key]: val }))
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        // Resize height to 54px to match print label size
        if (height > 54) {
          width = Math.round((width * 54) / height)
          height = 54
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        update('brand_logo', canvas.toDataURL('image/png'))
      }
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const ToggleSwitch = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--gray-border)' }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
          background: checked ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)',
          position: 'relative', transition: 'background 0.2s',
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3,
          left: checked ? 25 : 3, transition: 'left 0.2s',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }} />
      </button>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🖨️ ตั้งค่าหน้ากระดาษ</h1>
          <p className="page-subtitle">ปรับแต่งข้อมูลร้านค้าและตัวเลือกการพิมพ์ใบจัดส่ง / ใบแพ็คของ</p>
        </div>
        <button onClick={handleSave} className="btn btn-primary" disabled={saving} style={{ padding: '10px 24px' }}>
          {saving ? '⏳ กำลังบันทึก...' : saved ? '✅ บันทึกแล้ว!' : '💾 บันทึกการตั้งค่า'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        {/* Left: Store Info */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            🏪 ข้อมูลร้านค้า (ผู้ส่ง)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--gray-text)' }}>ชื่อแบรนด์ (ท้ายบิลพิมพ์)</label>
              <input className="input" value={settings.brand_name} onChange={e => update('brand_name', e.target.value)} style={{ width: '100%', fontSize: 14 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--gray-text)' }}>โลโก้แบรนด์ (แทนที่ชื่อแบรนด์)</label>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {settings.brand_logo && (
                  <div style={{ position: 'relative', background: '#fff', padding: 4, borderRadius: 4 }}>
                    <img src={settings.brand_logo} alt="Logo" style={{ height: 54, objectFit: 'contain', display: 'block' }} />
                    <button type="button" onClick={() => update('brand_logo', '')} style={{ position: 'absolute', top: -6, right: -6, background: '#EE4D2D', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✖</button>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ fontSize: 12, color: 'var(--gray-text)' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray-text)', marginTop: 8 }}>* แนะนำรูปแนวนอน พื้นหลังโปร่งใส (PNG) ความสูงรูปจะถูกปรับเป็น 54px</div>
            </div>
            <div style={{ height: 1, background: 'var(--gray-border)', margin: '8px 0' }}></div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--gray-text)' }}>ชื่อร้าน</label>
              <input className="input" value={settings.store_name} onChange={e => update('store_name', e.target.value)} style={{ width: '100%', fontSize: 14 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--gray-text)' }}>ที่อยู่ (บ้านเลขที่ ถนน ตำบล อำเภอ)</label>
              <textarea className="input" rows={2} value={settings.store_address} onChange={e => update('store_address', e.target.value)} style={{ width: '100%', fontSize: 13, resize: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--gray-text)' }}>จังหวัด / รหัสไปรษณีย์</label>
              <input className="input" value={settings.store_province} onChange={e => update('store_province', e.target.value)} style={{ width: '100%', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--gray-text)' }}>โทรศัพท์</label>
              <input className="input" value={settings.store_phone} onChange={e => update('store_phone', e.target.value)} style={{ width: '100%', fontSize: 13 }} />
            </div>
          </div>
        </div>

        {/* Right: Print Options */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            ⚙️ ตัวเลือกการพิมพ์
          </h3>

          {/* Paper Size */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--gray-text)' }}>ขนาดกระดาษ</label>
            <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--gray-border)' }}>
              {([['a4', 'A4 (210 × 297mm)'], ['a6', 'A6 (105 × 148mm)']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => update('paper_size', val)}
                  style={{
                    flex: 1, padding: '10px', fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                    background: settings.paper_size === val ? 'var(--gold-primary)' : 'transparent',
                    border: 'none', borderRight: val === 'a4' ? '1px solid var(--gray-border)' : 'none',
                    color: settings.paper_size === val ? '#1a1a1a' : 'var(--gray-text)',
                    fontWeight: settings.paper_size === val ? 700 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <ToggleSwitch checked={settings.show_store_details} onChange={v => update('show_store_details', v)} label="แสดงรายละเอียดร้านค้า" />
          <ToggleSwitch checked={settings.show_customer_details} onChange={v => update('show_customer_details', v)} label="แสดงรายละเอียดลูกค้า" />
          <ToggleSwitch checked={settings.show_product_image} onChange={v => update('show_product_image', v)} label="แสดงรูปสินค้า" />
          <ToggleSwitch checked={settings.show_prices_on_packing} onChange={v => update('show_prices_on_packing', v)} label="แสดงราคาในใบแพ็คของ" />
          <ToggleSwitch checked={settings.show_shipping_label} onChange={v => update('show_shipping_label', v)} label="แสดงจ่าหน้าที่หน้าสุดท้าย" />
        </div>
      </div>

      {/* Preview Section */}
      <div className="card" style={{ padding: 24, marginTop: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>👁️ ตัวอย่างรูปแบบการพิมพ์</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { icon: '🏷️', title: 'จ่าหน้าผู้รับผู้ส่ง', desc: 'ป้ายจ่าหน้าแสดงที่อยู่ผู้ส่งและผู้รับ' },
            { icon: '📦', title: 'ใบแพ็คของ (ใหญ่)', desc: 'รายการสินค้าพร้อมราคาและจ่าหน้า (A4)' },
            { icon: '📋', title: 'ใบแพ็คของ (เล็ก)', desc: 'รายการสินค้าไม่มีราคา ขนาดกะทัดรัด' },
          ].map((t, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--gray-border)', borderRadius: 12, padding: 16, textAlign: 'center', cursor: 'default' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{t.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{t.title}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-text)' }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
