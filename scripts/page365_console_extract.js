/**
 * วิธีใช้:
 * 1. เปิด https://app.page365.net/181941098341888/customers
 * 2. Scroll ซ้ายลงไปจนเห็น "231 คน" ใน footer
 * 3. กด F12 เปิด DevTools → แท็บ "Console"
 * 4. วาง code ด้านล่างทั้งหมดแล้วกด Enter
 * 5. Copy JSON ที่ได้วางใน Notepad แล้วส่งให้ผม
 */

(async () => {
  // ลองดึงจาก API endpoint โดยตรง
  try {
    const res = await fetch('/181941098341888/customers.json', {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    const json = await res.json();
    const customers = (json.customers || json || []);
    console.log('✅ พบลูกค้า:', customers.length, 'คน');
    
    // แสดงในรูปแบบที่ copy ได้ง่าย
    const output = JSON.stringify({
      total_customers: customers.length,
      customers: customers.map(c => ({
        name: c.name || c.customer_name || '',
        orders: c.orders_count || c.orders || 0
      }))
    }, null, 2);
    
    console.log('=== COPY ข้อความด้านล่างนี้ทั้งหมด ===');
    console.log(output);
    console.log('=== สิ้นสุด ===');
    
  } catch(e) {
    console.error('Error:', e);
    // ลอง endpoint สำรอง
    console.log('กำลังลอง endpoint สำรอง...');
    const res2 = await fetch('https://page365.net/181941098341888/customers.json', {
      credentials: 'include'
    });
    const j2 = await res2.json();
    console.log('Result:', JSON.stringify(j2).substring(0, 500));
  }
})()
