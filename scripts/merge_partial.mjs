import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = 'https://nyczcwsdfklqzofeddom.supabase.co'
const SERVICE_ROLE_KEY = process.argv[2]

if (!SERVICE_ROLE_KEY) {
  console.error('❌ ใส่ Service Role Key ด้วยครับ')
  process.exit(1)
}

const PARTIAL_JSON = path.resolve('C:/For ai/Asterna/data dowload/customers_partial.json')
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function run() {
  console.log('\n╔════════════════════════════════════════╗')
  console.log('║     ASTERNA — Merge Partial Customers   ║')
  console.log('╚════════════════════════════════════════╝\n')

  try {
    const rawFile = fs.readFileSync(PARTIAL_JSON, 'utf-8')
    const jsonStart = rawFile.indexOf('{')
    const cleanJson = jsonStart >= 0 ? rawFile.substring(jsonStart) : rawFile
    const rawData = JSON.parse(cleanJson)
    const newCustomers = rawData.customers || []
    console.log(`📋 พบรายชื่อในไฟล์: ${newCustomers.length} คน`)

    console.log('🔍 ดึงรายชื่อปัจจุบันจาก Supabase...')
    const { data: current } = await supabase.from('customers').select('name')
    const existingNames = new Set((current || []).map(c => (c.name || '').trim().toLowerCase()))
    console.log(`  ปัจจุบันมีในระบบ: ${existingNames.size} คน`)

    const missing = newCustomers.filter(c =>
      !existingNames.has((c.name || '').trim().toLowerCase())
    )
    console.log(`  ⚠️  รายชื่อใหม่ที่ยังไม่มี: ${missing.length} คน`)

    if (missing.length > 0) {
      const rowsToInsert = missing.map(c => {
        const orders = c.orders || c.orders_count || 0
        return {
          name: c.name.trim(),
          total_orders: orders,
          phone: '',
          address: '',
          note: '',
          tags: orders >= 10 ? 'VIP-Gold' : orders >= 5 ? 'VIP' : orders >= 2 ? 'repeat' : 'new',
        }
      })
      const { error } = await supabase.from('customers').insert(rowsToInsert)
      if (error) {
        console.error(`  ❌ Error insert: ${error.message}`)
      } else {
        console.log(`  ✅ เพิ่มรายชื่อใหม่เข้า DB สำเร็จ: ${rowsToInsert.length} คน`)
      }
    }

    // สรุปยอดรวม
    const { count } = await supabase.from('customers').select('*', { count: 'exact', head: true })
    console.log('\n╔════════════════════════════════════════╗')
    console.log('║              ✅ เสร็จสิ้น!              ║')
    console.log('╚════════════════════════════════════════╝')
    console.log(`  👥 จำนวนลูกค้าทั้งหมดในระบบตอนนี้: ${count} คน\n`)

  } catch (e) {
    console.error('❌ เกิดข้อผิดพลาด:', e.message)
  }
}

run()
