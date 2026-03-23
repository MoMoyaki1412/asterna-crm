/**
 * import_page365.mjs
 * ดึงข้อมูลลูกค้าจาก customers_data.json และออร์เดอร์จาก CSV
 * แล้วอัปโหลดขึ้น Supabase ทั้งหมด
 * 
 * วิธีใช้:
 *   node scripts/import_page365.mjs
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'

// ──── CONFIG ────
const SUPABASE_URL  = 'https://nyczcwsdfklqzofeddom.supabase.co'
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55Y3pjd3NkZmtscXpvZmVkZG9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MjM0MjMsImV4cCI6MjA4OTM5OTQyM30.cOp7g-BFMaw9QwyrO-V8A8qMxnsvKWxtbp0rSQFpcPQ'
const CUSTOMERS_JSON = path.resolve('C:/For ai/Asterna/data dowload/customers_data.json')
const ORDERS_CSV     = path.resolve('C:/For ai/Asterna/data dowload/ASTERNA-2603095474d49e.csv')

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ──── IMPORT CUSTOMERS ────
async function importCustomers() {
  console.log('\n📥 กำลัง import ลูกค้าจาก customers_data.json...')
  const raw = JSON.parse(fs.readFileSync(CUSTOMERS_JSON, 'utf-8'))
  const customers = raw.customers || []
  
  const rows = customers.map(c => ({
    name: c.name,
    total_orders: c.orders || 0,
    note: '',
    phone: '',
    address: '',
    tags: c.orders >= 5 ? 'VIP' : c.orders >= 2 ? 'repeat' : 'new',
  }))

  const { error, count } = await supabase
    .from('customers')
    .upsert(rows, { onConflict: 'name', ignoreDuplicates: false })
    .select('id', { count: 'exact', head: true })
  
  if (error) console.error('❌ Error:', error.message)
  else console.log(`✅ นำเข้าลูกค้า ${rows.length} คน`)
}

// ──── IMPORT ORDERS ────
async function importOrders() {
  console.log('\n📥 กำลัง import ออร์เดอร์จาก CSV...')
  const rawCsv = fs.readFileSync(ORDERS_CSV, 'utf-8')
  const records = parse(rawCsv, { columns: true, skip_empty_lines: true, relax_column_count: true })

  const seen = new Set()
  const rows = []

  for (const r of records) {
    const orderId = r['No.']
    if (!orderId || seen.has(orderId)) continue
    seen.add(orderId)

    const customerName = r['Customer Name']?.trim() || r['Profile name']?.trim() || 'ไม่ระบุ'
    const dateStr = r['Created At']?.trim() || null
    const total   = parseFloat(r['Total'] || '0')
    const status  = r['Status']?.trim() || 'shipped'
    const tracking = r['Tracking Number']?.trim() || ''
    const note    = r['Note']?.trim() || ''

    rows.push({
      customer_name: customerName,
      order_date: dateStr,
      total,
      status,
      tracking,
      note,
      source: 'Page365',
      items_summary: r['Item Name']?.trim() || '',
    })
  }

  const BATCH = 100
  let imported = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await supabase.from('orders').insert(chunk)
    if (error) console.error(`❌ Error batch ${i}: ${error.message}`)
    else imported += chunk.length
  }

  console.log(`✅ นำเข้าออร์เดอร์ ${imported} รายการ`)
}

// ──── MAIN ────
;(async () => {
  console.log('🚀 เริ่มต้น Import ข้อมูล Page365 → Supabase')
  
  // NOTE: ต้อง login ด้วย Service Role Key หรือเปิด RLS ก่อน
  await importCustomers()
  await importOrders()
  
  console.log('\n🎉 Import สำเร็จ! เปิดเว็บเพื่อดูข้อมูลได้เลย')
})()
