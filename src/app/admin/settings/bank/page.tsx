'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useRouter } from 'next/navigation'

type BankAccount = {
  id: number
  bank_name: string
  account_name: string
  account_number: string
  branch: string
  prompt_pay: string
  qr_code_url: string
  is_active: boolean
  sort_order: number
}

const BANK_OPTIONS = [
  'ธนาคารกสิกรไทย (KBANK)',
  'ธนาคารไทยพาณิชย์ (SCB)',
  'ธนาคารกรุงไทย (KTB)',
  'ธนาคารกรุงเทพ (BBL)',
  'ธนาคารทหารไทยธนชาต (TTB)',
  'ธนาคารกรุงศรีอยุธยา (BAY)',
  'ธนาคารซีไอเอ็มบี (CIMB)',
  'พร้อมเพย์ (PromptPay)',
]

type FormState = Omit<BankAccount, 'id' | 'sort_order' | 'is_active'>
const EMPTY_FORM: FormState = {
  bank_name: BANK_OPTIONS[0],
  account_name: '',
  account_number: '',
  branch: '',
  prompt_pay: '',
  qr_code_url: '',
}

const BUCKET = 'bank-qr-codes'

export default function BankSettingsPage() {
  const { can, loading: authLoading } = useAdminAuth()
  const router = useRouter()

  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // QR upload state
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [qrPreview, setQrPreview] = useState<string>('')
  const [uploadingQr, setUploadingQr] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authLoading && !can('manage_permissions')) {
      router.replace('/admin')
    }
  }, [authLoading, can])

  useEffect(() => { fetchAccounts() }, [])

  async function fetchAccounts() {
    setLoading(true)
    const { data } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('sort_order', { ascending: true })
    if (data) setAccounts(data)
    setLoading(false)
  }

  function openCreate() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setQrFile(null)
    setQrPreview('')
    setError('')
    setShowForm(true)
  }

  function openEdit(acc: BankAccount) {
    setEditingId(acc.id)
    setForm({
      bank_name: acc.bank_name,
      account_name: acc.account_name,
      account_number: acc.account_number,
      branch: acc.branch || '',
      prompt_pay: acc.prompt_pay || '',
      qr_code_url: acc.qr_code_url || '',
    })
    setQrFile(null)
    setQrPreview(acc.qr_code_url || '')
    setError('')
    setShowForm(true)
  }

  function handleQrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('กรุณาเลือกไฟล์รูปภาพเท่านั้น'); return }
    if (file.size > 2 * 1024 * 1024) { setError('ขนาดไฟล์ต้องไม่เกิน 2MB'); return }
    setQrFile(file)
    setQrPreview(URL.createObjectURL(file))
    setError('')
  }

  async function uploadQrImage(): Promise<string> {
    if (!qrFile) return form.qr_code_url
    setUploadingQr(true)
    const ext = qrFile.name.split('.').pop()
    const filename = `qr_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(filename, qrFile, { upsert: true, contentType: qrFile.type })
    setUploadingQr(false)
    if (upErr) { throw new Error('อัปโหลด QR ล้มเหลว: ' + upErr.message) }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
    return data.publicUrl
  }

  async function removeQrImage() {
    setQrFile(null)
    setQrPreview('')
    setForm(f => ({ ...f, qr_code_url: '' }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSave() {
    if (!form.account_name.trim() || !form.account_number.trim()) {
      setError('กรุณากรอกชื่อบัญชีและเลขบัญชี')
      return
    }
    setSaving(true)
    setError('')
    try {
      let qrUrl = form.qr_code_url
      if (qrFile) qrUrl = await uploadQrImage()

      const payload = { ...form, qr_code_url: qrUrl }

      if (editingId) {
        const { error: err } = await supabase.from('bank_accounts').update(payload).eq('id', editingId)
        if (err) throw new Error(err.message)
      } else {
        const { error: err } = await supabase.from('bank_accounts').insert({ ...payload, sort_order: accounts.length + 1 })
        if (err) throw new Error(err.message)
      }

      setShowForm(false)
      setSuccessMsg(editingId ? 'อัปเดตบัญชีสำเร็จ!' : 'เพิ่มบัญชีสำเร็จ!')
      setTimeout(() => setSuccessMsg(''), 3000)
      await fetchAccounts()
    } catch (e: any) {
      setError(e.message || 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(acc: BankAccount) {
    await supabase.from('bank_accounts').update({ is_active: !acc.is_active }).eq('id', acc.id)
    setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, is_active: !a.is_active } : a))
  }

  async function deleteAccount(id: number) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      return
    }
    await supabase.from('bank_accounts').delete().eq('id', id)
    setAccounts(prev => prev.filter(a => a.id !== id))
    setConfirmDeleteId(null)
  }

  function buildMessageText(acc: BankAccount) {
    const lines = [
      '📋 ชำระเงินได้ที่:',
      `🏦 ธนาคาร: ${acc.bank_name}`,
      `📌 ชื่อบัญชี: ${acc.account_name}`,
      `💳 เลขบัญชี: ${acc.account_number}`,
    ]
    if (acc.branch) lines.push(`🏢 สาขา: ${acc.branch}`)
    if (acc.prompt_pay) lines.push(`📱 พร้อมเพย์: ${acc.prompt_pay}`)
    lines.push('รบกวนโอนและส่งสลิปมาให้ด้วยนะคะ จะได้จัดส่งได้เลยค่ะ 🚀')
    return lines.join('\n')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid var(--gray-border)',
    borderRadius: 8, background: 'var(--black-card)', color: '#fff',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, color: 'var(--gray-text)', fontWeight: 600, marginBottom: 6,
  }

  if (authLoading || loading) {
    return <div style={{ padding: 40, color: 'var(--gray-text)' }}>⏳ กำลังโหลด...</div>
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">🏦 ตั้งค่าบัญชีธนาคาร</span>
      </div>

      <div style={{ padding: '32px 40px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>💳 บัญชีธนาคารสำหรับรับชำระเงิน</h2>
          <p style={{ color: 'var(--gray-text)', marginTop: 8, fontSize: 14 }}>
            จัดการข้อมูลบัญชีธนาคาร รองรับการอัปโหลด QR Code เพื่อส่งให้ลูกค้าสแกนจ่ายได้สะดวก
          </p>
        </div>

        {successMsg && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(46,204,113,0.15)', border: '1px solid #2ecc71', borderRadius: 8, color: '#2ecc71', fontSize: 14 }}>
            ✅ {successMsg}
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <button onClick={openCreate}
            style={{ padding: '11px 24px', background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-dark))', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            + เพิ่มบัญชีธนาคาร
          </button>
        </div>

        {accounts.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-text)', background: 'var(--black-card)', borderRadius: 12, border: '1px dashed var(--gray-border)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏦</div>
            <div style={{ fontWeight: 700 }}>ยังไม่มีบัญชีธนาคาร</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>กดปุ่ม "เพิ่มบัญชีธนาคาร" เพื่อเริ่มต้น</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {accounts.map(acc => (
              <div key={acc.id}
                style={{ background: 'var(--black-card)', borderRadius: 12, border: `1px solid ${acc.is_active ? 'rgba(201,168,76,0.4)' : 'var(--gray-border)'}`, padding: '20px 24px', opacity: acc.is_active ? 1 : 0.55, transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  {/* Info + QR */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 20 }}>
                    {/* QR Preview */}
                    {acc.qr_code_url && (
                      <div style={{ flexShrink: 0 }}>
                        <img src={acc.qr_code_url} alt="QR Code"
                          style={{ width: 90, height: 90, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--gray-border)', background: '#fff', padding: 4 }} />
                        <div style={{ fontSize: 10, color: 'var(--gray-text)', textAlign: 'center', marginTop: 4 }}>QR Code</div>
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 20 }}>🏦</span>
                        <span style={{ fontWeight: 800, fontSize: 16 }}>{acc.bank_name}</span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: acc.is_active ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.05)', color: acc.is_active ? '#2ecc71' : 'var(--gray-text)', fontWeight: 700 }}>
                          {acc.is_active ? '● ใช้งาน' : '○ ปิดใช้งาน'}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 13 }}>
                        <div><span style={{ color: 'var(--gray-text)' }}>ชื่อบัญชี:</span> <span style={{ fontWeight: 600 }}>{acc.account_name}</span></div>
                        <div><span style={{ color: 'var(--gray-text)' }}>เลขบัญชี:</span> <span style={{ fontWeight: 700, color: 'var(--gold-primary)', letterSpacing: 1 }}>{acc.account_number}</span></div>
                        {acc.branch && <div><span style={{ color: 'var(--gray-text)' }}>สาขา:</span> {acc.branch}</div>}
                        {acc.prompt_pay && <div><span style={{ color: 'var(--gray-text)' }}>พร้อมเพย์:</span> <span style={{ fontWeight: 600 }}>{acc.prompt_pay}</span></div>}
                      </div>
                      <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--gray-text)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>
                        <span style={{ color: 'var(--gold-primary)', fontWeight: 700, display: 'block', marginBottom: 4 }}>📋 ตัวอย่างข้อความที่ส่งในแชท:</span>
                        {buildMessageText(acc)}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => openEdit(acc)}
                      style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                      ✏️ แก้ไข
                    </button>
                    <button onClick={() => toggleActive(acc)}
                      style={{ padding: '7px 16px', background: acc.is_active ? 'rgba(231,76,60,0.15)' : 'rgba(46,204,113,0.15)', color: acc.is_active ? '#e74c3c' : '#2ecc71', border: `1px solid ${acc.is_active ? '#e74c3c' : '#2ecc71'}`, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                      {acc.is_active ? '⏸ ปิดใช้งาน' : '▶ เปิดใช้งาน'}
                    </button>
                    {confirmDeleteId === acc.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => deleteAccount(acc.id)} style={{ flex: 1, padding: '7px 0', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                          ยืนยัน
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} style={{ padding: '7px 10px', background: 'transparent', color: 'var(--gray-text)', border: '1px solid var(--gray-border)', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => deleteAccount(acc.id)} style={{ padding: '7px 16px', background: 'transparent', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                        🗑 ลบ
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MODAL FORM ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--black-deep)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 560, border: '1px solid var(--gray-border)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{editingId ? '✏️ แก้ไขบัญชีธนาคาร' : '+ เพิ่มบัญชีธนาคารใหม่'}</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--gray-text)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Bank name */}
              <div>
                <label style={labelStyle}>ธนาคาร *</label>
                <select value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} style={{ ...inputStyle }}>
                  {BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              {/* Account name */}
              <div>
                <label style={labelStyle}>ชื่อบัญชี *</label>
                <input type="text" value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}
                  placeholder="เช่น บริษัท แอสเทอร์นา จำกัด" style={inputStyle} />
              </div>
              {/* Account number */}
              <div>
                <label style={labelStyle}>เลขบัญชี *</label>
                <input type="text" value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
                  placeholder="เช่น 123-4-56789-0" style={inputStyle} />
              </div>
              {/* Branch */}
              <div>
                <label style={labelStyle}>สาขา (ไม่บังคับ)</label>
                <input type="text" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                  placeholder="เช่น สาขาสยามพารากอน" style={inputStyle} />
              </div>
              {/* PromptPay */}
              <div>
                <label style={labelStyle}>เบอร์พร้อมเพย์ (ไม่บังคับ)</label>
                <input type="text" value={form.prompt_pay} onChange={e => setForm(f => ({ ...f, prompt_pay: e.target.value }))}
                  placeholder="เช่น 081-234-5678" style={inputStyle} />
              </div>

              {/* ── QR CODE UPLOAD ── */}
              <div>
                <label style={labelStyle}>📱 QR Code สำหรับสแกนจ่าย (ไม่บังคับ)</label>
                {qrPreview ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={qrPreview} alt="QR Preview"
                        style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 10, border: '1px solid var(--gray-border)', background: '#fff', padding: 6 }} />
                      <button onClick={removeQrImage}
                        style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: '#e74c3c', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                        ✕
                      </button>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: '#2ecc71', marginBottom: 8 }}>✅ มี QR Code แล้ว</div>
                      <button onClick={() => fileInputRef.current?.click()}
                        style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid var(--gray-border)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        🔄 เปลี่ยนรูป
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{ border: '2px dashed var(--gray-border)', borderRadius: 10, padding: 24, textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--gold-primary)')}
                    onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--gray-border)')}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>คลิกเพื่ออัปโหลด QR Code</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-text)', marginTop: 4 }}>รองรับ JPG, PNG, WEBP ขนาดไม่เกิน 2MB</div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleQrFileChange}
                  style={{ display: 'none' }}
                />
              </div>
            </div>

            {error && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(231,76,60,0.15)', border: '1px solid #e74c3c', borderRadius: 8, color: '#e74c3c', fontSize: 13 }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowForm(false)}
                style={{ flex: 1, padding: '11px 0', background: 'rgba(255,255,255,0.06)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={saving || uploadingQr}
                style={{ flex: 2, padding: '11px 0', background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-dark))', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: (saving || uploadingQr) ? 'default' : 'pointer', opacity: (saving || uploadingQr) ? 0.7 : 1, fontSize: 15 }}>
                {uploadingQr ? '📤 กำลังอัปโหลด QR...' : saving ? '⏳ กำลังบันทึก...' : (editingId ? '💾 บันทึกการแก้ไข' : '✅ เพิ่มบัญชี')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
