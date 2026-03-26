'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import toast from 'react-hot-toast'
import { maskPhone, maskAddress } from '@/lib/security'
import { logActivity } from '@/lib/logger'

type Customer = {
  id: number
  name: string
  phone: string
  address: string
  tags: string
  note: string
  total_orders: number
  created_at: string
}

type Message = {
  id: string
  customer_id: number
  content: string
  sender: 'admin' | 'customer'
  platform: 'crm' | 'facebook' | 'line' | 'instagram' | 'tiktok'
  is_read: boolean
  created_at: string
}

type Order = {
  id: number
  total: number
  status: string
  order_date: string
  items_summary: string
}

type BankAccount = {
  id: number
  bank_name: string
  account_name: string
  account_number: string
  branch: string
  prompt_pay: string
  qr_code_url: string
  is_active: boolean
}

type CustomerTag = {
  id: number
  name: string
  color: string
}

type Tier = {
  id: number
  name: string
  discount_percent: number
}

const PLATFORM_ICONS: Record<string, string> = {
  crm: '🏬', facebook: '📘', line: '💚', instagram: '📷', tiktok: '🎵',
}
const PLATFORM_COLORS: Record<string, string> = {
  crm: '#C9A84C', facebook: '#1877F2', line: '#06C755', instagram: '#E1306C', tiktok: '#FE2C55',
}

// ── Quick Replies ──────────────────────────────────────────────────────────────
type QuickReply = { label: string; text: string }
const QUICK_REPLIES: Record<string, QuickReply[]> = {
  'ทักทาย': [
    {
      label: 'ทักทายแรก',
      text: 'สวัสดีค่ะ ขอบคุณที่ให้ความสนใจ Asterna Skincare นะคะ 🌿\nทางเราเชี่ยวชาญด้านสกินแคร์ระดับคลินิก ที่ออกแบบมาเพื่อผิวของคุณโดยเฉพาะค่ะ\nมีอะไรให้ดูแลได้บ้างคะ? 💛',
    },
    {
      label: 'ตอบรับความสนใจ',
      text: 'ขอบคุณที่ไว้ใจสอบถามมานะคะ 🌸\nยินดีให้คำแนะนำแบบตรงๆ ตามสภาพผิวของคุณเลยค่ะ\nขอทราบปัญหาผิวหลักที่ต้องการแก้ไขได้เลยนะคะ?',
    },
  ],
  'จัดการข้อโต้แย้ง': [
    {
      label: 'แพงไป',
      text: 'เข้าใจค่ะ 💛 ราคาของ Asterna สะท้อนถึงคุณภาพของสารสกัดระดับ Medical Grade ที่ใช้จริงนะคะ\nสกินแคร์ถูกที่ใช้ไม่ได้ผล vs แพงกว่าหน่อยแต่ใช้แล้วเห็นผลจริง — ลูกค้าส่วนใหญ่เลือกอันหลังค่ะ 😊',
    },
    {
      label: 'ขอคิดดูก่อน',
      text: 'ได้เลยค่ะ ไม่รีบนะคะ 😊\nถ้ามีข้อสงสัยเรื่องส่วนผสมหรือวิธีใช้ ทักมาได้ตลอดเลยค่ะ\nของเราไม่มีกดดันค่ะ แต่ถ้าตัดสินใจแล้ว มีโปรพิเศษอยู่นะคะ 💛',
    },
    {
      label: 'ของแท้มั้ย',
      text: 'แน่นอนค่ะ 🌿 Asterna ผลิตในประเทศไทย มาตรฐาน GMP จาก อย. ไทยค่ะ\nทุกชิ้นมีสติกเกอร์ Lot Number ตรวจสอบได้\nถ้าต้องการดูเอกสารรับรองเพิ่มเติม ส่งให้ได้เลยนะคะ 😊',
    },
  ],
  'ปิดการขาย': [
    {
      label: 'สรุปและชวนสั่ง',
      text: 'สรุปนะคะ สิ่งที่เหมาะกับคุณที่สุดตอนนี้คือ:\n🌟 Reju Gold Serum — ลดริ้วรอยและฟื้นฟูผิวได้ดีที่สุดค่ะ\nราคา 500 บาท / ส่งฟรีทุกออร์เดอร์ค่ะ\nรบกวนแจ้งชื่อ-ที่อยู่ได้เลยนะคะ 💛',
    },
    {
      label: 'ยืนยันออร์เดอร์',
      text: 'ขอบคุณมากเลยค่ะ 🌸 รับออร์เดอร์แล้วนะคะ!\nจะแพ็คของอย่างดีและจัดส่งภายใน 1-2 วันทำการค่ะ\nถ้ามีคำถามอะไรเพิ่มเติม ทักมาได้ตลอดนะคะ 💛',
    },
    {
      label: 'จัดส่งแล้ว',
      text: 'จัดส่งสินค้าเรียบร้อยแล้วนะคะ 🚀\nติดตามพัสดุได้เลยค่ะ ถ้าได้รับสินค้าแล้วรบกวนแจ้งให้ทราบด้วยนะคะ 🌸\nขอบคุณที่ไว้ใจ Asterna นะคะ 💛',
    },
    {
      label: 'ส่งเลขบัญชี',
      text: '📋 ชำระเงินได้ที่:\n🏦 ธนาคารกสิกรไทย\n📌 ชื่อบัญชี: บริษัท แอสเทอร์นา จำกัด\n💳 เลขบัญชี: XXX-X-XXXXX-X\nรบกวนโอนและส่งสลิปมาให้ด้วยนะคะ จะได้จัดส่งได้เลยค่ะ 🚀',
    },
  ],
}

// ── Skin Tag Labels ────────────────────────────────────────────────────────────
const SKIN_TAGS: { tag: string; emoji: string; color: string }[] = [
  { tag: 'SKIN_ANTI_AGING', emoji: '⏳', color: '#8B5CF6' },
  { tag: 'SKIN_FIRMING', emoji: '💪', color: '#EC4899' },
  { tag: 'SKIN_SENSITIVE', emoji: '🌸', color: '#F59E0B' },
  { tag: 'SKIN_DRY', emoji: '💧', color: '#3B82F6' },
  { tag: 'SKIN_DULL', emoji: '✨', color: '#10B981' },
]
const INTEREST_TAGS: { tag: string; emoji: string; color: string }[] = [
  { tag: 'INTEREST_HOT', emoji: '🔥', color: '#EF4444' },
  { tag: 'INTEREST_WARM', emoji: '🌡️', color: '#F97316' },
  { tag: 'INTEREST_COLD', emoji: '❄️', color: '#6366F1' },
  { tag: 'INTEREST_REPEAT', emoji: '💎', color: '#C9A84C' },
  { tag: 'FOLLOWUP_NEEDED', emoji: '⏰', color: '#64748B' },
]

const STATUS_LABELS: Record<string, string> = {
  shipped: 'จัดส่งแล้ว', pending: 'รอดำเนินการ', completed: 'สำเร็จ', cancelled: 'ยกเลิก',
}
const STATUS_COLORS: Record<string, string> = {
  shipped: '#2ecc71', pending: '#f39c12', completed: '#95a5a6', cancelled: '#e74c3c',
}

function ConversationsPageContent() {
  const { profile } = useAdminAuth()
  const searchParams = useSearchParams()
  const urlCustomerId = searchParams.get('customer_id')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selected, setSelected] = useState<Customer | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [newMsg, setNewMsg] = useState('')
  const [platform, setPlatform] = useState<'crm' | 'facebook' | 'line' | 'instagram' | 'tiktok'>('crm')
  const [search, setSearch] = useState('')
  const [closedIds, setClosedIds] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem('crm_closed_conversations')
      return stored ? new Set<number>(JSON.parse(stored)) : new Set<number>()
    } catch { return new Set<number>() }
  })
  const [unreadCount, setUnreadCount] = useState<Record<number, number>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const { can } = useAdminAuth()
  const [revealedPhoneIds, setRevealedPhoneIds] = useState<Set<number>>(new Set())
  const [revealedAddressIds, setRevealedAddressIds] = useState<Set<number>>(new Set())

  const [tierTag, setTierTag] = useState('NORMAL')
  const [generalTags, setGeneralTags] = useState('')
  const [availableTiers, setAvailableTiers] = useState<Tier[]>([])
  const [activeQuickTab, setActiveQuickTab] = useState<string>('ทักทาย')

  // Custom tag input
  const [tagInput, setTagInput] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // Order History State
  const [showOrderHistory, setShowOrderHistory] = useState(false)
  const [orderHistory, setOrderHistory] = useState<Order[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  // Bank Accounts State
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [showBankPicker, setShowBankPicker] = useState(false)
  const [showQrPicker, setShowQrPicker] = useState(false)
  // Available general tags from customer_tags DB
  const [availableCustomTags, setAvailableCustomTags] = useState<CustomerTag[]>([])

  useEffect(() => {
    async function loadCustomers() {
      // 1. Get unique customer_ids that have messages
      const { data: msgData } = await supabase.from('messages').select('customer_id')
      const customerIdsWithMessages = [...new Set((msgData || []).map(m => Number(m.customer_id)))]

      // 2. If urlCustomerId is present, ensure it's in the list
      if (urlCustomerId && !customerIdsWithMessages.includes(Number(urlCustomerId))) {
        customerIdsWithMessages.push(Number(urlCustomerId))
      }

      const [cRes, tRes, bRes, gRes] = await Promise.all([
        customerIdsWithMessages.length > 0
          ? supabase.from('customers').select('id, name, phone, address, tags, note, total_orders, created_at').in('id', customerIdsWithMessages).eq('is_active', true).order('name', { ascending: true })
          : Promise.resolve({ data: [] as Customer[] }),
        supabase.from('customer_tiers').select('*').order('discount_percent', { ascending: true }),
        supabase.from('bank_accounts').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase.from('customer_tags').select('*').order('name', { ascending: true }),
      ])
      
      const loadedCustomers = (cRes.data || []) as Customer[]
      setCustomers(loadedCustomers)
      if (tRes.data) setAvailableTiers(tRes.data)
      if (bRes.data) setBankAccounts(bRes.data)
      if (gRes.data) setAvailableCustomTags(gRes.data)

      // 3. Auto-select if urlCustomerId present
      if (urlCustomerId) {
        const target = loadedCustomers.find(c => c.id === Number(urlCustomerId))
        if (target) setSelected(target)
      }
    }
    loadCustomers()
  }, [urlCustomerId])

  useEffect(() => {
    if (!selected) return
    setLoadingMsgs(true)
    setShowOrderHistory(false)
    setOrderHistory([])
    async function loadMessages() {
      const { data } = await supabase.from('messages').select('*').eq('customer_id', selected!.id).order('created_at', { ascending: true })
      if (data) setMessages(data)
      setLoadingMsgs(false)
      await supabase.from('messages').update({ is_read: true }).eq('customer_id', selected!.id).eq('is_read', false)
      setUnreadCount(prev => ({ ...prev, [selected!.id]: 0 }))
    }
    loadMessages()
    const tagsArray = selected.tags ? selected.tags.split(',').map(s => s.trim()).filter(Boolean) : []
    const tierMap = new Set(availableTiers.map(t => t.name))
    setTierTag(tagsArray.find(t => tierMap.has(t)) || 'NORMAL')
    setGeneralTags(tagsArray.filter(t => !tierMap.has(t) && !t.startsWith('DISC_') && !t.startsWith('SKIN_') && !t.startsWith('INTEREST_') && t !== 'FOLLOWUP_NEEDED' && t !== 'VIP' && t !== 'BUYER_NURSE' && t !== 'BUYER_PHARMACIST').join(', '))
  }, [selected])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function saveTagsToDB(newTier: string, newGenTags: string, extraTagsOverride?: string[]) {
    if (!selected) return
    const existingTags = (selected.tags || '').split(',').map(t => t.trim()).filter(Boolean)
    const discTags = existingTags.filter(t => t.startsWith('DISC_'))
    const skinTags = existingTags.filter(t => t.startsWith('SKIN_') || t.startsWith('INTEREST_') || t === 'FOLLOWUP_NEEDED' || t === 'VIP' || t === 'BUYER_NURSE' || t === 'BUYER_PHARMACIST')
    
    const tierMap = new Set(availableTiers.map(t => t.name))
    const currentSkinTags = extraTagsOverride !== undefined ? extraTagsOverride : skinTags

    const finalTags = [
      ...(newGenTags.trim() ? newGenTags.split(',').map(t => t.trim()).filter(Boolean) : []),
      ...(newTier !== 'NORMAL' ? [newTier] : []),
      ...discTags,
      ...currentSkinTags,
    ]
    const finalStr = finalTags.join(', ')
    const updated = { ...selected, tags: finalStr }
    setSelected(updated)
    setCustomers(prev => prev.map(c => c.id === selected.id ? updated : c))
    await supabase.from('customers').update({ tags: finalStr }).eq('id', selected.id)
  }

  function addCustomTag() {
    const newTag = tagInput.trim().toUpperCase().replace(/\s+/g, '_')
    if (!newTag || !selected) return
    const existing = (selected.tags || '').split(',').map(t => t.trim()).filter(Boolean)
    if (existing.includes(newTag)) { setTagInput(''); return }
    const updated = [...existing, newTag].join(', ')
    const updatedCustomer = { ...selected, tags: updated }
    setSelected(updatedCustomer)
    setCustomers(prev => prev.map(c => c.id === selected.id ? updatedCustomer : c))
    supabase.from('customers').update({ tags: updated }).eq('id', selected.id)
    // Auto-register this tag to customer_tags if it's not SKIN_/INTEREST_/DISC_/tier-related
    const isPreset = newTag.startsWith('SKIN_') || newTag.startsWith('INTEREST_') || newTag.startsWith('DISC_') || availableTiers.some(t => t.name === newTag)
    if (!isPreset && !availableCustomTags.find(t => t.name === newTag)) {
      const colors = ['#2ecc71', '#3498db', '#9b59b6', '#e67e22', '#1abc9c', '#e74c3c']
      const defaultColor = colors[newTag.length % colors.length]
      supabase.from('customer_tags').insert({ name: newTag, color: defaultColor }).select().single().then(({ data }) => {
        if (data) setAvailableCustomTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      })
    }
    setTagInput('')
    setShowTagInput(false)
  }

  function removeTag(tag: string) {
    if (!selected) return
    const existing = (selected.tags || '').split(',').map(t => t.trim()).filter(Boolean)
    const updated = existing.filter(t => t !== tag).join(', ')
    const updatedCustomer = { ...selected, tags: updated }
    setSelected(updatedCustomer)
    setCustomers(prev => prev.map(c => c.id === selected.id ? updatedCustomer : c))
    supabase.from('customers').update({ tags: updated }).eq('id', selected.id)
  }

  function toggleQuickTag(tag: string) {
    if (!selected) return
    const existingTags = (selected.tags || '').split(',').map(t => t.trim()).filter(Boolean)
    let newSkinTags: string[]
    if (existingTags.includes(tag)) {
      newSkinTags = existingTags.filter(t => t !== tag).filter(t => t.startsWith('SKIN_') || t.startsWith('INTEREST_') || t === 'FOLLOWUP_NEEDED' || t === 'VIP' || t === 'BUYER_NURSE' || t === 'BUYER_PHARMACIST')
    } else {
      const skinTags = existingTags.filter(t => t.startsWith('SKIN_') || t.startsWith('INTEREST_') || t.startsWith('INTEREST_') || t === 'FOLLOWUP_NEEDED' || t === 'VIP' || t === 'BUYER_NURSE' || t === 'BUYER_PHARMACIST')
      newSkinTags = [...skinTags, tag]
    }
    saveTagsToDB(tierTag, generalTags, newSkinTags)
  }

  function toggleGeneralTag(tagName: string) {
    if (!selected) return
    const currentGen = generalTags.split(',').map(t => t.trim()).filter(Boolean)
    const exists = currentGen.includes(tagName)
    const updatedGen = exists ? currentGen.filter(t => t !== tagName) : [...currentGen, tagName]
    const updatedGenStr = updatedGen.join(', ')
    setGeneralTags(updatedGenStr)
    saveTagsToDB(tierTag, updatedGenStr)
  }

  async function fetchOrderHistory() {
    if (!selected) return
    setLoadingOrders(true)
    const { data } = await supabase.from('orders').select('id, total, status, order_date, items_summary').eq('customer_id', selected.id).order('order_date', { ascending: false }).limit(5)
    if (data) setOrderHistory(data)
    setLoadingOrders(false)
  }

  async function sendMessage() {
    if (!newMsg.trim() || !selected) return
    // Build payload — admin_id only if supported
    const basePayload: Record<string, unknown> = {
      customer_id: selected.id,
      content: newMsg.trim(),
      sender: 'admin',
      platform,
      is_read: true,
    }
    if (profile?.id) basePayload.admin_id = profile.id
    const { data, error } = await supabase.from('messages').insert(basePayload).select().single()
    if (error) {
      // Retry without admin_id if that field caused the error
      const fallback = { customer_id: selected.id, content: newMsg.trim(), sender: 'admin', platform, is_read: true }
      const { data: d2, error: e2 } = await supabase.from('messages').insert(fallback).select().single()
      if (!e2 && d2) { setMessages(prev => [...prev, d2 as Message]); setNewMsg('') }
      return
    }
    if (data) { setMessages(prev => [...prev, data as Message]); setNewMsg('') }
  }

  function buildBankText(acc: BankAccount) {
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

  async function handleSendQR(acc?: BankAccount) {
    const target = acc || (bankAccounts.length === 1 ? bankAccounts[0] : null)
    if (!target) {
      if (bankAccounts.length > 1) { setShowQrPicker(v => !v); setShowBankPicker(false) }
      else toast.error('⚠️ ยังไม่ได้ตั้งค่าบัญชีธนาคาร กรุณาไปที่ การตั้งค่า > บัญชีธนาคาร')
      return
    }
    if (!target.qr_code_url) {
      toast.error('⚠️ บัญชีนี้ยังไม่มี QR Code กรุณาอัปโหลดที่หน้า ตั้งค่าบัญชีธนาคาร')
      return
    }
    if (!selected) return
    // Send as image message directly — stored with [IMG] prefix so bubble renders as <img>
    const caption = `📱 QR Code สำหรับโอนเงิน\nรบกวนสแกน QR แล้วโอนมาได้เลยนะคะ จากนั้นส่งสลิปมาให้ด้วยนะคะ 🚀`
    const content = `[IMG]${target.qr_code_url}\n${caption}`
    const basePayload: Record<string, unknown> = {
      customer_id: selected.id, content, sender: 'admin', platform, is_read: true,
    }
    if (profile?.id) basePayload.admin_id = profile.id
    const { data, error } = await supabase.from('messages').insert(basePayload).select().single()
    if (error) {
      const { data: d2 } = await supabase.from('messages').insert({ customer_id: selected.id, content, sender: 'admin', platform, is_read: true }).select().single()
      if (d2) setMessages(prev => [...prev, d2 as Message])
    } else if (data) {
      setMessages(prev => [...prev, data as Message])
    }
    setShowQrPicker(false)
  }

  function handleSendBank(acc?: BankAccount) {
    const target = acc || (bankAccounts.length === 1 ? bankAccounts[0] : null)
    if (target) { setNewMsg(buildBankText(target)); setShowBankPicker(false) }
    else if (bankAccounts.length > 1) setShowBankPicker(v => !v)
    else setNewMsg('⚠️ ยังไม่ได้ตั้งค่าบัญชีธนาคาร กรุณาไปที่ การตั้งค่า > บัญชีธนาคาร')
  }

  async function simulateCustomerReply(text: string) {
    if (!selected) return
    const { data, error } = await supabase.from('messages').insert({ customer_id: selected.id, content: text, sender: 'customer', platform, is_read: false }).select().single()
    if (!error && data) setMessages(prev => [...prev, data as Message])
  }

  function closeConversation(id: number) {
    setClosedIds(prev => {
      const next = new Set([...prev, id])
      try { localStorage.setItem('crm_closed_conversations', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function restoreConversation(id: number) {
    setClosedIds(prev => {
      const next = new Set([...prev].filter(x => x !== id))
      try { localStorage.setItem('crm_closed_conversations', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  // ไม่มี search: ซ่อนรายชื่อที่ถูกปิด | มี search: แสดงทุกรายชื่อที่ตรงคำค้น (รวม closed) เพื่อให้เปิดกลับมาได้
  const filteredCustomers = customers.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
    if (search.trim()) return matchSearch
    return matchSearch && !closedIds.has(c.id)
  })

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }
  function formatDate(ts: string) {
    return new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const getActiveTags = (tags: string) => {
    const tagArr = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []
    const skinActive = SKIN_TAGS.filter(t => tagArr.includes(t.tag))
    const interestActive = INTEREST_TAGS.filter(t => tagArr.includes(t.tag))
    const presetTagNames = new Set([
      ...SKIN_TAGS.map(t => t.tag),
      ...INTEREST_TAGS.map(t => t.tag),
      ...availableTiers.map(t => t.name),
    ])
    const generalActive = tagArr.filter(t =>
      !presetTagNames.has(t) &&
      !t.startsWith('DISC_') &&
      t !== 'FOLLOWUP_NEEDED' &&
      t !== 'VIP' &&
      t !== 'BUYER_NURSE' &&
      t !== 'BUYER_PHARMACIST'
    )
    return { skinActive, interestActive, generalActive }
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">💬 การสนทนา (Conversations)</span>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>

        {/* ============ LEFT: CHAT LIST ============ */}
        <div style={{ width: 300, minWidth: 300, borderRight: '1px solid var(--gray-border)', display: 'flex', flexDirection: 'column', background: 'var(--black-deep)' }}>
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--gray-border)' }}>
            <input
              type="text"
              placeholder="🔍 ค้นหาลูกค้า..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-border)', borderRadius: 8, background: 'var(--black-card)', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredCustomers.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--gray-text)', fontSize: 13 }}>ไม่พบลูกค้า</div>
            ) : filteredCustomers.map(c => {
              const { skinActive, interestActive, generalActive } = getActiveTags(c.tags || '')
              const hasAnyTags = skinActive.length > 0 || interestActive.length > 0 || generalActive.length > 0
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    if (closedIds.has(c.id)) restoreConversation(c.id)
                    setSelected(c)
                  }}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--gray-border)',
                    cursor: 'pointer',
                    background: selected?.id === c.id ? 'rgba(201,168,76,0.12)' : closedIds.has(c.id) ? 'rgba(255,255,255,0.02)' : 'transparent',
                    borderLeft: selected?.id === c.id ? '3px solid var(--gold-primary)' : '3px solid transparent',
                    transition: 'all 0.15s ease',
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    opacity: closedIds.has(c.id) ? 0.6 : 1,
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0, color: '#fff' }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {(unreadCount[c.id] ?? 0) > 0 && (
                          <span style={{ background: '#e74c3c', color: '#fff', borderRadius: 10, fontSize: 10, padding: '2px 6px', fontWeight: 700 }}>{unreadCount[c.id]}</span>
                        )}
                        {!closedIds.has(c.id) && (
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              closeConversation(c.id)
                              if (selected?.id === c.id) setSelected(null)
                            }}
                            title="ซ่อนออกจากรายชื่อ"
                            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--gray-text)', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, flexShrink: 0, transition: 'all 0.15s', opacity: selected?.id === c.id ? 1 : 0.4 }}
                            onMouseOver={e => { e.currentTarget.style.background = 'rgba(231,76,60,0.3)'; e.currentTarget.style.color = '#e74c3c'; e.currentTarget.style.opacity = '1' }}
                            onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--gray-text)'; e.currentTarget.style.opacity = selected?.id === c.id ? '1' : '0.4' }}
                          >×</button>
                        )}
                        {closedIds.has(c.id) && (
                          <span title="แชทถูกปิด - กดเพื่อเปิดอีกครั้ง" style={{ fontSize: 10, color: 'var(--gray-text)', border: '1px solid var(--gray-border)', borderRadius: 4, padding: '1px 4px' }}>ปิดแล้ว</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--gray-text)', marginTop: 2 }}>
                      {(!can('view_full_pii') && !revealedPhoneIds.has(c.id)) ? maskPhone(c.phone) : (c.phone || 'ไม่ระบุเบอร์')}
                    </div>
                    {hasAnyTags && (
                      <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                        {[...skinActive, ...interestActive].map(t => (
                          <span key={t.tag} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 6, background: `${t.color}22`, color: t.color, fontWeight: 600 }}>{t.emoji} {t.tag.replace('SKIN_', '').replace('INTEREST_', '')}</span>
                        ))}
                        {generalActive.map(tag => (
                          <span key={tag} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 6, background: 'rgba(201,168,76,0.15)', color: 'var(--gold-primary)', fontWeight: 600 }}>🏷 {tag.replace(/_/g, ' ')}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ============ CENTER: CHAT WINDOW ============ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f5f5f5', minWidth: 0 }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#95a5a6', gap: 8 }}>
              <span style={{ fontSize: 48 }}>💬</span>
              <span style={{ fontSize: 16 }}>เลือกลูกค้าเพื่อเริ่มการสนทนา</span>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div style={{ padding: '12px 20px', background: '#fff', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: '#2c3e50' }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: '#7f8c8d', marginTop: 1 }}>
                    {(!can('view_full_pii') && !revealedPhoneIds.has(selected.id)) ? maskPhone(selected.phone) : selected.phone} · 🛍️ {selected.total_orders} คำสั่งซื้อ
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['crm', 'facebook', 'line', 'instagram', 'tiktok'] as const).map(p => (
                    <button key={p} onClick={() => setPlatform(p)} title={p}
                      style={{
                        width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 14,
                        background: platform === p ? PLATFORM_COLORS[p] : '#ecf0f1',
                        outline: platform === p ? `2px solid ${PLATFORM_COLORS[p]}` : 'none',
                        outlineOffset: 2, transition: 'all 0.15s ease',
                      }}>
                      {PLATFORM_ICONS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Messages Area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {loadingMsgs ? (
                  <div style={{ textAlign: 'center', color: '#95a5a6', marginTop: 40 }}>⏳ กำลังโหลดการสนทนา...</div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#95a5a6', marginTop: 60 }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
                    <div>ยังไม่มีการสนทนากับลูกค้าคนนี้</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>เริ่มการสนทนาด้วย Quick Replies ด้านล่างได้เลยค่ะ</div>
                  </div>
                ) : messages.map((msg, i) => {
                  const isAdmin = msg.sender === 'admin'
                  const showDate = i === 0 || formatDate(messages[i - 1].created_at) !== formatDate(msg.created_at)
                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div style={{ textAlign: 'center', margin: '12px 0' }}>
                          <span style={{ background: '#ecf0f1', padding: '4px 12px', borderRadius: 12, fontSize: 11, color: '#7f8c8d' }}>{formatDate(msg.created_at)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8 }}>
                        {!isAdmin && (
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff', flexShrink: 0 }}>
                            {selected.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          {msg.content.startsWith('[IMG]') ? (() => {
                            const parts = msg.content.slice(5).split('\n')
                            const imgUrl = parts[0]
                            const caption = parts.slice(1).join('\n')
                            return (
                              <div style={{
                                maxWidth: 240,
                                borderRadius: isAdmin ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                background: isAdmin ? '#2c3e50' : '#fff',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                overflow: 'hidden',
                              }}>
                                <img src={imgUrl} alt="QR Code"
                                  style={{ width: '100%', display: 'block', background: '#fff' }} />
                                {caption && (
                                  <div style={{ padding: '8px 12px', fontSize: 12, lineHeight: 1.5,
                                    color: isAdmin ? '#fff' : '#2c3e50', whiteSpace: 'pre-line' }}>
                                    {caption}
                                  </div>
                                )}
                              </div>
                            )
                          })() : (
                            <div style={{
                              maxWidth: 360, padding: '10px 14px',
                              borderRadius: isAdmin ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                              background: isAdmin ? '#2c3e50' : '#fff',
                              color: isAdmin ? '#fff' : '#2c3e50',
                              fontSize: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', lineHeight: 1.5,
                              whiteSpace: 'pre-line',
                            }}>
                              {msg.content}
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: '#95a5a6', marginTop: 4, textAlign: isAdmin ? 'right' : 'left' }}>
                            {PLATFORM_ICONS[msg.platform]} {formatTime(msg.created_at)}
                          </div>
                        </div>
                        {isAdmin && (
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2c3e50', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: 'var(--gold-primary)', flexShrink: 0 }}>A</div>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Replies — Tabbed */}
              <div style={{ background: '#fff', borderTop: '1px solid #e0e0e0' }}>
                {/* Tab Headers */}
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e0e0e0', paddingLeft: 12 }}>
                  {Object.keys(QUICK_REPLIES).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveQuickTab(tab)}
                      style={{
                        padding: '7px 14px', fontSize: 11, fontWeight: 700,
                        border: 'none', background: 'none', cursor: 'pointer',
                        color: activeQuickTab === tab ? 'var(--gold-primary)' : '#95a5a6',
                        borderBottom: activeQuickTab === tab ? '2px solid var(--gold-primary)' : '2px solid transparent',
                        transition: 'all 0.15s',
                      }}>
                      {tab}
                    </button>
                  ))}
                </div>
                {/* Reply Pills */}
                <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap' }}>
                  {QUICK_REPLIES[activeQuickTab]?.map(qr => (
                    <button
                      key={qr.label}
                      onClick={() => setNewMsg(qr.text)}
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: '1px solid #e0e0e0', background: '#f8f9fa', cursor: 'pointer', color: '#2c3e50', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                      onMouseOver={e => (e.currentTarget.style.background = '#fffbf0')}
                      onMouseOut={e => (e.currentTarget.style.background = '#f8f9fa')}
                    >
                      ⚡ {qr.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Area */}
              <div style={{ padding: '10px 16px 14px', background: '#fff', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <textarea
                  value={newMsg}
                  onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder="พิมพ์ข้อความ... (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
                  rows={2}
                  style={{ flex: 1, padding: '10px 14px', border: '1px solid #e0e0e0', borderRadius: 12, fontSize: 14, resize: 'none', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    onClick={sendMessage}
                    disabled={!newMsg.trim()}
                    style={{ padding: '10px 18px', background: 'var(--gold-primary)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: newMsg.trim() ? 'pointer' : 'default', opacity: newMsg.trim() ? 1 : 0.5, fontSize: 14 }}>
                    ส่ง ➤
                  </button>
                  <button
                    onClick={() => simulateCustomerReply('สนใจค่ะ ขอราคาหน่อยได้มั้ยคะ?')}
                    style={{ padding: '5px 8px', background: '#ecf0f1', color: '#7f8c8d', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 10 }}
                    title="จำลองข้อความจากลูกค้า (สำหรับทดสอบ)">
                    🔁 จำลอง
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ============ RIGHT: CUSTOMER PROFILE ============ */}
        {selected && (
          <div style={{ width: 300, minWidth: 300, borderLeft: '1px solid var(--gray-border)', background: 'var(--black-deep)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-border)', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22, color: '#fff', margin: '0 auto 10px' }}>
                {selected.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{selected.name}</div>
              <div style={{ fontSize: 11, color: 'var(--gold-primary)', marginTop: 4 }}>🛍️ {selected.total_orders} คำสั่งซื้อ</div>
            </div>

            {/* ── FAST ACTIONS ── */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gray-border)' }}>
              <div style={{ fontSize: 11, color: 'var(--gray-text)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>⚡ Fast Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Open Bill */}
                <a
                  href={`/admin/orders/create?customer_id=${selected.id}&customer_name=${encodeURIComponent(selected.name)}`}
                  style={{ display: 'block', padding: '9px 12px', background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-dark))', color: '#fff', borderRadius: 8, fontWeight: 700, textAlign: 'center', textDecoration: 'none', fontSize: 13 }}>
                  🧾 เปิดบิลให้ลูกค้า
                </a>
                {/* Fast Send Bank + picker */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => handleSendBank()}
                    style={{ padding: '8px 12px', background: 'var(--black-card)', border: '1px solid var(--gray-border)', color: '#fff', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 12, textAlign: 'left', width: '100%' }}>
                    💳 ส่งเลขบัญชีธนาคาร{bankAccounts.length > 1 ? ` (${bankAccounts.length})` : ''}
                  </button>
                  {showBankPicker && bankAccounts.length > 1 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--black-deep)', border: '1px solid var(--gray-border)', borderRadius: 8, overflow: 'hidden', marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                      {bankAccounts.map(acc => (
                        <button key={acc.id} onClick={() => handleSendBank(acc)}
                          style={{ display: 'block', width: '100%', padding: '10px 12px', background: 'none', border: 'none', color: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--gray-border)' }}
                          onMouseOver={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.12)')}
                          onMouseOut={e => (e.currentTarget.style.background = 'none')}>
                          🏦 {acc.bank_name.split('(')[0].trim()}
                          <div style={{ color: 'var(--gray-text)', fontSize: 11, marginTop: 2 }}>{acc.account_number}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* QR Code Button */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => handleSendQR()}
                    style={{ padding: '8px 12px', background: 'var(--black-card)', border: '1px solid var(--gray-border)', color: '#fff', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 12, textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>📱</span>
                    <span>ส่ง QR Code{bankAccounts.filter(b => b.qr_code_url).length > 1 ? ` (${bankAccounts.filter(b => b.qr_code_url).length})` : ''}</span>
                  </button>
                  {showQrPicker && bankAccounts.filter(b => b.qr_code_url).length > 1 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--black-deep)', border: '1px solid var(--gray-border)', borderRadius: 8, overflow: 'hidden', marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                      {bankAccounts.filter(b => b.qr_code_url).map(acc => (
                        <button key={acc.id} onClick={() => handleSendQR(acc)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', background: 'none', border: 'none', color: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--gray-border)' }}
                          onMouseOver={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.12)')}
                          onMouseOut={e => (e.currentTarget.style.background = 'none')}>
                          <img src={acc.qr_code_url} alt="QR" style={{ width: 28, height: 28, borderRadius: 4, background: '#fff', padding: 2, objectFit: 'contain' }} />
                          <span>{acc.bank_name.split('(')[0].trim()}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Order History */}
                <button
                  onClick={async () => {
                    if (!showOrderHistory) { await fetchOrderHistory() }
                    setShowOrderHistory(!showOrderHistory)
                  }}
                  style={{ padding: '8px 12px', background: 'var(--black-card)', border: '1px solid var(--gray-border)', color: '#fff', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 12, textAlign: 'left' }}>
                  📦 {showOrderHistory ? 'ซ่อน' : 'ดู'} ประวัติการซื้อ
                </button>
              </div>

              {/* Order History Panel */}
              {showOrderHistory && (
                <div style={{ marginTop: 10, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--gray-border)' }}>
                  {loadingOrders ? (
                    <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--gray-text)' }}>⏳ กำลังโหลด...</div>
                  ) : orderHistory.length === 0 ? (
                    <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--gray-text)' }}>ยังไม่มีประวัติการซื้อ</div>
                  ) : orderHistory.map(o => (
                    <div key={o.id} style={{ padding: '8px 12px', borderBottom: '1px solid var(--gray-border)', fontSize: 11 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: 'var(--gold-primary)' }}>{o.total.toLocaleString()} ฿</span>
                        <span style={{ color: STATUS_COLORS[o.status] || '#95a5a6', fontWeight: 600 }}>{STATUS_LABELS[o.status] || o.status}</span>
                      </div>
                      <div style={{ color: 'var(--gray-text)', marginTop: 2 }}>{new Date(o.order_date).toLocaleDateString('th-TH')}</div>
                      <div style={{ color: 'var(--white-muted)', marginTop: 1, fontSize: 10 }}>{o.items_summary}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── SKIN PROFILE TAGS ── */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gray-border)' }}>
              <div style={{ fontSize: 11, color: 'var(--gray-text)', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>🌿 โปรไฟล์ผิว & ความสนใจ</div>

              {/* ── Current tags (all) as removable chips ── */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8, minHeight: 26, alignItems: 'center' }}>
                {((selected.tags || '').split(',').map(t => t.trim()).filter(Boolean)).map(tag => {
                  const skinMeta = [...SKIN_TAGS, ...INTEREST_TAGS].find(t => t.tag === tag)
                  return (
                    <span key={tag} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontSize: 10, padding: '2px 7px 2px 8px', borderRadius: 10,
                      background: skinMeta ? `${skinMeta.color}28` : 'rgba(201,168,76,0.15)',
                      color: skinMeta ? skinMeta.color : 'var(--gold-primary)',
                      border: `1px solid ${skinMeta ? skinMeta.color : 'var(--gold-primary)'}55`,
                      fontWeight: 600,
                    }}>
                      {skinMeta ? `${skinMeta.emoji} ` : ''}{tag.replace('SKIN_', '').replace('INTEREST_', '')}
                      <button onClick={() => removeTag(tag)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 11, padding: '0 0 0 2px', lineHeight: 1, opacity: 0.7, display: 'flex', alignItems: 'center' }}
                        title={`ลบแท็ก ${tag}`}>
                        ×
                      </button>
                    </span>
                  )
                })}

                {/* + Add Tag button / input */}
                {showTagInput ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, position: 'relative' }}>
                    <input
                      ref={tagInputRef}
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addCustomTag(); if (e.key === 'Escape') { setShowTagInput(false); setTagInput('') } }}
                      onBlur={() => { setTimeout(() => { if (!tagInput.trim()) setShowTagInput(false) }, 150) }}
                      placeholder="ชื่อแท็ก..."
                      autoFocus
                      style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, border: '1px solid var(--gold-primary)', background: 'transparent', color: '#fff', outline: 'none', width: 90 }}
                    />
                    <button onClick={addCustomTag}
                      style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'var(--gold-primary)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                      ตกลง
                    </button>
                    {/* Suggestion dropdown */}
                    {tagInput.trim().length > 0 && (() => {
                      const existingTags = (selected.tags || '').split(',').map(t => t.trim()).filter(Boolean)
                      const q = tagInput.trim().toUpperCase()
                      const suggestions = availableCustomTags.filter(t =>
                        t.name.includes(q) && !existingTags.includes(t.name)
                      ).slice(0, 5)
                      if (suggestions.length === 0) return null
                      return (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, zIndex: 100,
                          background: 'var(--black-deep)', border: '1px solid var(--gray-border)',
                          borderRadius: 8, marginTop: 4, minWidth: 140,
                          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden',
                        }}>
                          {suggestions.map(s => (
                            <button key={s.id}
                              onMouseDown={() => { setTagInput(s.name.toLowerCase()); setTimeout(addCustomTag, 50) }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                                padding: '6px 10px', background: 'none', border: 'none',
                                color: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: 10,
                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                              }}
                              onMouseOver={e => e.currentTarget.style.background = 'rgba(201,168,76,0.15)'}
                              onMouseOut={e => e.currentTarget.style.background = 'none'}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                              {s.name}
                            </button>
                          ))}
                        </div>
                      )
                    })()}
                  </span>
                ) : (
                  <button
                    onClick={() => { setShowTagInput(true); setTimeout(() => tagInputRef.current?.focus(), 50) }}
                    style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, border: '1.5px dashed var(--gray-border)', background: 'transparent', color: 'var(--gray-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, transition: 'all 0.15s' }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--gold-primary)'; e.currentTarget.style.color = 'var(--gold-primary)' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--gray-border)'; e.currentTarget.style.color = 'var(--gray-text)' }}>
                    <span style={{ fontSize: 13, lineHeight: 1 }}>+</span> เพิ่ม Tag
                  </button>
                )}
              </div>

              {/* ── Quick preset toggles ── */}
              <div style={{ borderTop: '1px solid var(--gray-border)', paddingTop: 8, marginTop: 4 }}>
                <div style={{ fontSize: 9, color: 'var(--gray-text)', marginBottom: 5, opacity: 0.7 }}>ประเภทผิว (กดเพื่อเพิ่มอัตโนมัติ)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {SKIN_TAGS.map(t => {
                    const active = (selected.tags || '').includes(t.tag)
                    return (
                      <button key={t.tag} onClick={() => toggleQuickTag(t.tag)}
                        style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, border: `1px solid ${active ? t.color : 'var(--gray-border)'}`, background: active ? `${t.color}22` : 'transparent', color: active ? t.color : 'var(--gray-text)', cursor: 'pointer', fontWeight: active ? 700 : 400, transition: 'all 0.15s', opacity: active ? 1 : 0.6 }}>
                        {t.emoji} {t.tag.replace('SKIN_', '')}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 9, color: 'var(--gray-text)', marginBottom: 5, opacity: 0.7 }}>ความสนใจ</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {INTEREST_TAGS.map(t => {
                    const active = (selected.tags || '').includes(t.tag)
                    return (
                      <button key={t.tag} onClick={() => toggleQuickTag(t.tag)}
                        style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, border: `1px solid ${active ? t.color : 'var(--gray-border)'}`, background: active ? `${t.color}22` : 'transparent', color: active ? t.color : 'var(--gray-text)', cursor: 'pointer', fontWeight: active ? 700 : 400, transition: 'all 0.15s', opacity: active ? 1 : 0.6 }}>
                        {t.emoji} {t.tag.replace('INTEREST_', '')}
                      </button>
                    )
                  })}
                </div>
                {/* General Tags from DB */}
                <div style={{ fontSize: 9, color: 'var(--gray-text)', marginBottom: 5, opacity: 0.7 }}>แท็กทั่วไป</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {availableCustomTags.map(t => {
                    const active = (selected.tags || '').split(',').map(s => s.trim()).includes(t.name)
                    return (
                      <button key={t.id} onClick={() => toggleGeneralTag(t.name)}
                        style={{
                          fontSize: 9, padding: '2px 7px', borderRadius: 8,
                          border: `1px solid ${active ? t.color : 'var(--gray-border)'}`,
                          background: active ? `${t.color}22` : 'transparent',
                          color: active ? t.color : 'var(--gray-text)',
                          cursor: 'pointer', fontWeight: active ? 700 : 400,
                          transition: 'all 0.15s', opacity: active ? 1 : 0.7,
                          display: 'flex', alignItems: 'center', gap: 3
                        }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.color }} />
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── CONTACT & TIER ── */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gray-border)' }}>
              <div style={{ fontSize: 11, color: 'var(--gray-text)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>ข้อมูลติดต่อ</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>📞</span>
                  <span style={{ fontSize: 12, color: 'var(--white-muted)' }}>
                    {(!can('view_full_pii') && !revealedPhoneIds.has(selected.id)) ? maskPhone(selected.phone) : (selected.phone || 'ไม่ระบุ')}
                  </span>
                  {!can('view_full_pii') && can('reveal_pii') && !revealedPhoneIds.has(selected.id) && selected.phone && (
                    <button 
                      onClick={() => {
                        setRevealedPhoneIds(prev => new Set(prev).add(selected.id))
                        logActivity(profile?.id || 'unknown', 'VIEW_PII_PHONE', 'conversations', selected.id.toString())
                        toast.success('แสดงเบอร์โทรศัพท์แล้ว (บันทึกประวัติการเข้าชม)')
                      }}
                      style={{ background: 'var(--gold-dark)', border: 'none', borderRadius: 4, color: '#fff', fontSize: 9, padding: '1px 4px', cursor: 'pointer' }}
                    >👁️</button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span>📍</span>
                  <span style={{ fontSize: 12, color: 'var(--white-muted)', lineHeight: 1.5, flex: 1 }}>
                    {(!can('view_full_pii') && !revealedAddressIds.has(selected.id)) ? maskAddress(selected.address) : (selected.address || 'ไม่ระบุ')}
                  </span>
                  {!can('view_full_pii') && can('reveal_pii') && !revealedAddressIds.has(selected.id) && selected.address && (
                    <button 
                      onClick={() => {
                        setRevealedAddressIds(prev => new Set(prev).add(selected.id))
                        logActivity(profile?.id || 'unknown', 'VIEW_PII_ADDRESS', 'conversations', selected.id.toString())
                        toast.success('แสดงที่อยู่แล้ว (บันทึกประวัติการเข้าชม)')
                      }}
                      style={{ background: 'var(--gold-dark)', border: 'none', borderRadius: 4, color: '#fff', fontSize: 9, padding: '1px 4px', cursor: 'pointer', marginTop: 2 }}
                    >👁️</button>
                  )}
                </div>
              </div>
            </div>

            {/* ── TIER / AUTO PRICING ── */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gray-border)' }}>
              <div style={{ fontSize: 11, color: 'var(--gold-primary)', fontWeight: 700, marginBottom: 8 }}>🏷️ Auto Pricing Tier</div>
              <select
                className="input"
                value={tierTag}
                onChange={e => { const val = e.target.value; setTierTag(val); saveTagsToDB(val, generalTags) }}
                style={{ width: '100%', padding: '6px 10px', fontSize: 12 }}>
                <option value="NORMAL">ลูกค้าระดับทั่วไป (ราคา Retail)</option>
                {availableTiers.filter(t => t.name !== 'NORMAL').map(t => (
                  <option key={t.id} value={t.name}>{t.name} (ลด {t.discount_percent}%)</option>
                ))}
              </select>
              <div style={{ marginTop: 8 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--gray-text)', marginBottom: 4 }}>แท็กทั่วไปอื่นๆ</label>
                <input type="text" value={generalTags} onChange={e => setGeneralTags(e.target.value)}
                  onBlur={() => saveTagsToDB(tierTag, generalTags)}
                  onKeyDown={e => { if (e.key === 'Enter') saveTagsToDB(tierTag, generalTags) }}
                  placeholder="เช่น VIP, BUYER_NURSE..."
                  className="input" style={{ width: '100%', padding: '6px 10px', fontSize: 12 }} />
              </div>
            </div>

            {/* ── NOTE ── */}
            {selected.note && (
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--gray-text)', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>โน้ตส่วนตัว</div>
                <div style={{ fontSize: 12, color: 'var(--white-muted)', background: 'var(--black-card)', padding: 10, borderRadius: 8, lineHeight: 1.6 }}>{selected.note}</div>
              </div>
            )}

            {/* Footer Link */}
            <div style={{ padding: '0 16px 16px', marginTop: 'auto' }}>
              <a href="/admin/customers" style={{ display: 'block', textAlign: 'center', fontSize: 12, color: 'var(--gold-primary)', textDecoration: 'none', padding: 10 }}>
                ดูโปรไฟล์เต็ม →
              </a>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default function ConversationsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-text)' }}>⏳ กำลังโหลด...</div>}>
      <ConversationsPageContent />
    </Suspense>
  )
}
