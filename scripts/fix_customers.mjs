/**
 * fix_customers.mjs
 * 1. ลบรายชื่อลูกค้าที่ซ้ำ — เก็บเฉพาะ record ที่มี total_orders มากที่สุด
 * 2. เพิ่มลูกค้าที่ยังขาดอยู่จาก customers_data.json (เทียบกับชื่อที่มีในระบบ)
 * 
 * รันด้วย: node scripts/fix_customers.mjs <SERVICE_ROLE_KEY>
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = 'https://nyczcwsdfklqzofeddom.supabase.co'
const SERVICE_ROLE_KEY = process.argv[2]

if (!SERVICE_ROLE_KEY) {
  console.error('❌ ใส่ Service Role Key ด้วยครับ')
  process.exit(1)
}

const CUSTOMERS_JSON = path.resolve('C:/For ai/Asterna/data dowload/customers_data.json')
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function run() {
  console.log('\n╔════════════════════════════════════════╗')
  console.log('║     ASTERNA — Fix & Dedup Customers   ║')
  console.log('╚════════════════════════════════════════╝\n')

  // ─── STEP 1: ดึงลูกค้าทั้งหมดออกมา ────────────────
  console.log('📋 กำลังดึงรายชื่อลูกค้าทั้งหมดจาก Supabase...')
  const { data: all, error: fetchErr } = await supabase
    .from('customers')
    .select('id, name, total_orders')
    .order('name')

  if (fetchErr || !all) {
    console.error('❌ Error:', fetchErr?.message)
    process.exit(1)
  }
  console.log(`  พบ ${all.length} records ใน Supabase`)

  // ─── STEP 2: หารายชื่อซ้ำ ─────────────────────────
  // Group by normalized name (trim + lowercase)
  const groups = {}
  for (const c of all) {
    const key = (c.name || '').trim().toLowerCase()
    if (!groups[key]) groups[key] = []
    groups[key].push(c)
  }

  const duplicateKeys = Object.entries(groups).filter(([, rows]) => rows.length > 1)
  console.log(`  🔍 พบชื่อซ้ำ: ${duplicateKeys.length} กลุ่ม`)

  // ─── STEP 3: ลบ duplicates ────────────────────────
  // Keep record with highest total_orders (or highest id), delete the rest
  let deletedCount = 0
  for (const [, rows] of duplicateKeys) {
    rows.sort((a, b) => (b.total_orders || 0) - (a.total_orders || 0) || b.id - a.id)
    const [keep, ...toDelete] = rows
    const idsToDelete = toDelete.map(r => r.id)
    const { error } = await supabase
      .from('customers')
      .delete()
      .in('id', idsToDelete)
    if (error) console.error(`  ⚠️  ลบ dup ไม่ได้: ${error.message}`)
    else deletedCount += idsToDelete.length
  }
  console.log(`  ✅ ลบ duplicates แล้ว: ${deletedCount} records`)

  // ─── STEP 4: ดึงรายชื่อปัจจุบัน (หลัง dedup) ──────
  const { data: current } = await supabase.from('customers').select('name')
  const existingNames = new Set((current || []).map(c => (c.name || '').trim().toLowerCase()))
  console.log(`\n  รายชื่อปัจจุบันหลัง dedup: ${existingNames.size} คน`)

  // ─── STEP 5: โหลดข้อมูล source จาก JSON ──────────
  if (!fs.existsSync(CUSTOMERS_JSON)) {
    console.error(`❌ ไม่พบ: ${CUSTOMERS_JSON}`)
    process.exit(1)
  }
  const raw = JSON.parse(fs.readFileSync(CUSTOMERS_JSON, 'utf-8'))
  const sourceCustomers = raw.customers || []
  console.log(`  Source JSON มี: ${sourceCustomers.length} คน`)

  // ─── STEP 6: เพิ่มลูกค้าที่ขาด ───────────────────
  const missing = sourceCustomers.filter(c =>
    !existingNames.has((c.name || '').trim().toLowerCase())
  )
  console.log(`  ⚠️  ขาดอยู่: ${missing.length} คน`)

  if (missing.length > 0) {
    const newRows = missing.map(c => ({
      name: c.name.trim(),
      total_orders: c.orders || 0,
      phone: '',
      address: '',
      note: '',
      tags: c.orders >= 10 ? 'VIP-Gold' : c.orders >= 5 ? 'VIP' : c.orders >= 2 ? 'repeat' : 'new',
    }))
    const { error } = await supabase.from('customers').insert(newRows)
    if (error) console.error(`  ❌ Error insert: ${error.message}`)
    else console.log(`  ✅ เพิ่มลูกค้าใหม่: ${newRows.length} คน`)
  }

  // ─── STEP 7: นับผลสุดท้าย ─────────────────────────
  const { count } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })

  console.log('\n╔════════════════════════════════════════╗')
  console.log('║              ✅ เสร็จสิ้น!              ║')
  console.log('╚════════════════════════════════════════╝')
  console.log(`  👥 ลูกค้าทั้งหมดในระบบ: ${count} คน`)
  console.log(`  🗑️  ลบซ้ำไป: ${deletedCount} records`)
  console.log(`  ➕ เพิ่มใหม่: ${missing.length} คน`)
  console.log()
}

run()
