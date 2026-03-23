/**
 * setup_and_import.mjs
 * ทำครั้งเดียว: สร้าง Admin Account + Import ข้อมูลจาก Page365
 * 
 * วิธีใช้:
 *   node scripts/setup_and_import.mjs <SERVICE_ROLE_KEY>
 *
 * หา Service Role Key:
 *   Supabase Dashboard → Settings (gear) → API → Project API keys → "service_role"
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'

const SUPABASE_URL = 'https://nyczcwsdfklqzofeddom.supabase.co'
const SERVICE_ROLE_KEY = process.argv[2]

if (!SERVICE_ROLE_KEY) {
  console.error('\n❌ กรุณาใส่ Service Role Key:')
  console.error('   node scripts/setup_and_import.mjs <SERVICE_ROLE_KEY>')
  console.error('\n📍 หา key ได้ที่: Supabase → Settings → API → service_role\n')
  process.exit(1)
}

const CUSTOMERS_JSON = path.resolve('C:/For ai/Asterna/data dowload/customers_data.json')
const ORDERS_CSV     = path.resolve('C:/For ai/Asterna/data dowload/ASTERNA-2603095474d49e.csv')
const ADMIN_EMAIL    = 'admin@asterna.com'
const ADMIN_PASSWORD = 'Asterna2026!'

// ใช้ service_role key เพื่อ bypass RLS และใช้ admin auth
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ─── STEP 1: สร้าง Admin User ──────────────────────────
async function createAdminUser() {
  console.log(`\n👤 กำลังสร้าง Admin Account: ${ADMIN_EMAIL}`)

  const { data, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,   // ไม่ต้องยืนยัน email
  })

  if (error) {
    if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
      console.log('ℹ️  Admin account มีอยู่แล้ว ข้ามขั้นตอนนี้')
    } else {
      console.error('❌ Error:', error.message)
    }
  } else {
    console.log(`✅ สร้าง Admin Account สำเร็จ!`)
    console.log(`   📧 Email: ${ADMIN_EMAIL}`)
    console.log(`   🔑 Password: ${ADMIN_PASSWORD}`)
  }
}

// ─── STEP 2: Import ลูกค้า ─────────────────────────────
async function importCustomers() {
  console.log('\n📥 กำลัง import ลูกค้าจาก customers_data.json...')
  
  if (!fs.existsSync(CUSTOMERS_JSON)) {
    console.error(`❌ ไม่พบไฟล์: ${CUSTOMERS_JSON}`)
    return 0
  }

  const raw = JSON.parse(fs.readFileSync(CUSTOMERS_JSON, 'utf-8'))
  const customers = raw.customers || []
  
  const rows = customers.map(c => ({
    name: c.name?.trim() || 'ไม่ระบุ',
    total_orders: c.orders || 0,
    note: '',
    phone: '',
    address: '',
    tags: c.orders >= 10 ? 'VIP-Gold' : c.orders >= 5 ? 'VIP' : c.orders >= 2 ? 'repeat' : 'new',
  }))

  // Import เป็น batch
  const BATCH = 50
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from('customers').insert(rows.slice(i, i + BATCH))
    if (error) console.error(`  ⚠️  batch ${i}: ${error.message}`)
    else total += Math.min(BATCH, rows.length - i)
  }

  console.log(`✅ Import ลูกค้าสำเร็จ: ${total}/${rows.length} คน`)
  return total
}

// ─── STEP 3: Import ออร์เดอร์ ─────────────────────────
async function importOrders() {
  console.log('\n📥 กำลัง import ออร์เดอร์จาก CSV...')

  if (!fs.existsSync(ORDERS_CSV)) {
    console.error(`❌ ไม่พบไฟล์: ${ORDERS_CSV}`)
    return 0
  }

  // Page365 CSV is exported in UTF-16 LE — read as buffer then convert
  const buf = fs.readFileSync(ORDERS_CSV)
  // Detect UTF-16 LE BOM (FF FE) and decode accordingly
  let rawCsv
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    rawCsv = buf.toString('utf16le').replace(/^\uFEFF/, '')
  } else {
    rawCsv = buf.toString('utf-8').replace(/^\uFEFF/, '')
  }
  let records
  try {
    records = parse(rawCsv, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      delimiter: '\t',  // Page365 uses tab-delimited
    })
  } catch (e) {
    console.error('❌ Error parsing CSV:', e.message)
    return 0
  }

  const seen = new Set()
  const rows = []

  for (const r of records) {
    const orderId = r['No.']?.trim()
    if (!orderId || seen.has(orderId)) continue
    seen.add(orderId)

    const customerName = (r['Customer Name'] || r['Profile name'] || 'ไม่ระบุ').trim()
    const dateStr = r['Created At']?.trim() || null
    const total   = parseFloat(r['Total'] || '0') || 0
    const status  = r['Status']?.trim() || 'shipped'
    const tracking = r['Tracking Number']?.trim() || ''
    const note    = r['Note']?.trim() || ''
    const itemName = r['Item Name']?.trim() || ''
    const itemQty  = r['Item Qty']?.trim() || '1'
    const source  = r['Source']?.trim() || 'Page365'

    rows.push({
      customer_name: customerName,
      order_date: dateStr,
      total,
      status,
      tracking,
      note,
      source,
      items_summary: itemName ? `${itemName} x${itemQty}` : '',
    })
  }

  const BATCH = 50
  let imported = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from('orders').insert(rows.slice(i, i + BATCH))
    if (error) console.error(`  ⚠️  batch ${i}: ${error.message}`)
    else imported += Math.min(BATCH, rows.length - i)
  }

  console.log(`✅ Import ออร์เดอร์สำเร็จ: ${imported}/${rows.length} รายการ`)
  return imported
}

// ─── MAIN ────────────────────────────────────────────
;(async () => {
  console.log('╔════════════════════════════════════════╗')
  console.log('║   ASTERNA CRM — Setup & Import Tool   ║')
  console.log('╚════════════════════════════════════════╝')
  console.log(`📡 Supabase: ${SUPABASE_URL}`)

  await createAdminUser()
  const custCount  = await importCustomers()
  const orderCount = await importOrders()

  console.log('\n╔════════════════════════════════════════╗')
  console.log('║              ✅ เสร็จสิ้น!              ║')
  console.log('╚════════════════════════════════════════╝')
  console.log(`  👥 ลูกค้า:      ${custCount} คน`)
  console.log(`  📦 ออร์เดอร์:   ${orderCount} รายการ`)
  console.log(`\n  🔑 Login เว็บ:  http://localhost:3000/login`)
  console.log(`  📧 Email:       ${ADMIN_EMAIL}`)
  console.log(`  🔒 Password:    ${ADMIN_PASSWORD}`)
  console.log()
})()
