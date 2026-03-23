/**
 * scrape_page365_customers.mjs
 * ใช้ Playwright (Node.js) เปิด Page365 แบบมีหน้าต่าง
 * scroll จนครบ แล้วดึง JSON ลูกค้าทั้งหมด
 * 
 * ติดตั้ง playwright ก่อน:
 *   npm install playwright
 *   npx playwright install chromium
 * 
 * รันด้วย:
 *   node scripts/scrape_page365_customers.mjs
 */

import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const TARGET_URL = 'https://app.page365.net/181941098341888/customers'
const API_URL    = 'https://page365.net/181941098341888/customers.json'
const OUTPUT_JSON = path.resolve('C:/For ai/Asterna/data dowload/customers_data_full.json')

;(async () => {
  console.log('\n🚀 เริ่ม Scrape Page365 Customers...')
  console.log('📌 จะเปิด Browser ขึ้นมา — กรุณาอย่าปิด!\n')

  const browser = await chromium.launch({ headless: false, slowMo: 100 })
  const context = await browser.newContext()
  const page = await context.newPage()

  console.log(`[1/4] กำลังเปิด ${TARGET_URL}`)
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 })

  // รอให้ login (ถ้ายังไม่ได้ login ให้ login ใน browser ที่เปิดขึ้นมา)
  console.log('[2/4] รอโหลดหน้า customers...')
  console.log('      ⚠️  ถ้าเจอหน้า Login ให้ Login ใน Browser ที่เปิดขึ้นมาก่อนนะครับ')
  
  // รอ 30 วินาที เพื่อให้ผู้ใช้ login ถ้าจำเป็น
  console.log('      ⏳ รอ 30 วินาที — ถ้าเจอหน้า Login ให้รีบ Login ในช่วงนี้ครับ')
  await page.waitForTimeout(30000)
  console.log('      ✅ ผ่านช่วง login แล้ว กำลัง scroll...')

  // Scroll จนครบ
  console.log('[3/4] กำลัง Scroll เพื่อโหลดลูกค้าทั้งหมด...')
  let prevCount = -1
  let stallCount = 0
  let loopCount = 0

  while (stallCount < 5 && loopCount < 60) {
    loopCount++

    // Scroll ใน customer list panel (ลอง selector หลายแบบ)
    await page.evaluate(() => {
      const selectors = [
        '.customer-area',
        '.customer-list',
        '.customers-list',
        '[class*="customer"]',
        '.list-group',
        '.infinite-scroll',
      ]
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el && el.scrollHeight > el.clientHeight) {
          el.scrollTop = el.scrollHeight
          return
        }
      }
      // Fallback: scroll window
      window.scrollTo(0, document.body.scrollHeight)
    })

    await page.waitForTimeout(1500)

    // อ่านจำนวนจาก footer text
    const bodyText = await page.innerText('body').catch(() => '')
    const match = bodyText.match(/(\d+)\s*คน/)
    const currentCount = match ? parseInt(match[1]) : 0

    process.stdout.write(`\r  📊 ลูกค้าที่โหลดแล้ว: ${currentCount} คน (รอบที่ ${loopCount})   `)

    if (currentCount >= 231) {
      console.log(`\n  ✅ โหลดครบ ${currentCount} คนแล้ว!`)
      break
    }

    if (currentCount === prevCount) {
      stallCount++
    } else {
      stallCount = 0
      prevCount = currentCount
    }
  }

  // ดึงข้อมูลผ่าน API (ใช้ session เดิม)
  console.log('\n[4/4] กำลังดึง JSON จาก API...')
  let customers = []
  
  try {
    // เปิดหน้า API ใน tab เดิม
    await page.goto(API_URL, { timeout: 30000 })
    const bodyText = await page.innerText('body')
    const json = JSON.parse(bodyText)
    
    // Page365 JSON อาจมีหลายรูปแบบ
    if (Array.isArray(json)) {
      customers = json
    } else if (json && Array.isArray(json.customers)) {
      customers = json.customers
    } else if (json && typeof json === 'object') {
      // หา array ที่ใหญ่ที่สุดใน object
      const arrays = Object.values(json).filter(v => Array.isArray(v))
      customers = arrays.sort((a, b) => b.length - a.length)[0] || []
    }
    console.log(`  ✅ ดึงได้ ${customers.length} รายการ (raw JSON keys: ${Object.keys(json).join(', ')})`)
  } catch (e) {
    console.error('  ❌ ดึง JSON ไม่ได้:', e.message)
    customers = []
  }

  // บันทึกไฟล์
  const output = {
    total_customers: customers.length,
    scraped_at: new Date().toISOString(),
    customers: customers.map(c => ({
      name: c.name || c.customer_name || '',
      orders: c.orders_count || c.orders || 0,
    }))
  }

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2), 'utf-8')
  console.log(`\n✅ บันทึกไฟล์ที่: ${OUTPUT_JSON}`)
  console.log(`👥 ลูกค้าทั้งหมด: ${customers.length} คน`)

  await browser.close()
  console.log('\n🎉 เสร็จสิ้น! รัน import script ต่อได้เลย:\n')
  console.log('  node scripts/fix_customers.mjs <SERVICE_ROLE_KEY>\n')
})()
