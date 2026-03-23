'use client'

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { logActivity } from '@/lib/logger'

interface Product {
  id: number
  sku: string
  name: string
  description: string
  size: string
  cost: number
  price_retail: number
  price_dealer: number
  price_online: number
  image_url: string
  stock_total: number
  stock_reserved: number
  stock_shipped: number
  active_ingredients: string[]
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isStockModalOpen, setIsStockModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [stockForm, setStockForm] = useState({
    id: 0, 
    total: 0, adj_total: 0,
    reserved: 0, adj_reserved: 0,
    shipped: 0, adj_shipped: 0
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentUploadProductId = useRef<number | null>(null)
  const { can, profile: myProfile } = useAdminAuth()
  
  const [productForm, setProductForm] = useState({
    sku: '', name: '', description: '', size: '', cost: 0, 
    price_retail: 0, price_online: 0, price_dealer: 0, 
    active_ingredients: ''
  })

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('sku', { ascending: true })

      if (error) throw error
      setProducts(data || [])
    } catch (err) {
      console.error('Error fetching products:', err)
    } finally {
      setLoading(false)
    }
  }

  const openAddModal = () => {
    setEditingId(null)
    setProductForm({
      sku: '', name: '', description: '', size: '', cost: 0, 
      price_retail: 0, price_online: 0, price_dealer: 0, 
      active_ingredients: ''
    })
    setIsModalOpen(true)
  }

  const openEditModal = (p: Product) => {
    setEditingId(p.id)
    setProductForm({
      sku: p.sku,
      name: p.name,
      description: p.description || '',
      size: p.size || '',
      cost: p.cost,
      price_retail: p.price_retail,
      price_online: p.price_online,
      price_dealer: p.price_dealer,
      active_ingredients: p.active_ingredients?.join(', ') || ''
    })
    setIsModalOpen(true)
  }

  const openStockModal = (p: Product) => {
    setStockForm({
      id: p.id,
      total: p.stock_total,
      adj_total: 0,
      reserved: p.stock_reserved,
      adj_reserved: 0,
      shipped: p.stock_shipped,
      adj_shipped: 0
    })
    setIsStockModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      const ingredientsArray = productForm.active_ingredients.split(',').map(s => s.trim()).filter(s => s !== '')
      
      if (editingId) {
        // UPDATE
        const { error } = await supabase
          .from('products')
          .update({
            ...productForm,
            active_ingredients: ingredientsArray
          })
          .eq('id', editingId)
          
        if (error) throw error
        logActivity(myProfile?.id || 'system', 'UPDATE_PRODUCT', 'products', editingId.toString(), { name: productForm.name })
        setProducts(prev => prev.map(p => p.id === editingId ? { ...p, ...productForm, active_ingredients: ingredientsArray } : p))
        toast.success('แก้ไขข้อมูลสินค้าสำเร็จ!')
      } else {
        // INSERT
        const { data, error } = await supabase
          .from('products')
          .insert([{
            ...productForm,
            active_ingredients: ingredientsArray,
            stock_total: 0,
            stock_reserved: 0,
            stock_shipped: 0,
            image_url: ''
          }])
          .select()

        if (error) throw error
        logActivity(myProfile?.id || 'system', 'CREATE_PRODUCT', 'products', data[0].id.toString(), { name: productForm.name })
        setProducts(prev => [...prev, data[0]])
        toast.success('เพิ่มสินค้าใหม่สำเร็จ!')
      }
      
      setIsModalOpen(false)
    } catch (err: any) {
      toast.error('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleStockUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      const newTotal = stockForm.total + stockForm.adj_total
      const newReserved = stockForm.reserved + stockForm.adj_reserved
      const newShipped = stockForm.shipped + stockForm.adj_shipped

      const { error } = await supabase
        .from('products')
        .update({
          stock_total: newTotal,
          stock_reserved: newReserved,
          stock_shipped: newShipped
        })
        .eq('id', stockForm.id)

      if (error) throw error
      
      logActivity(myProfile?.id || 'system', 'ADJUST_STOCK', 'products', stockForm.id.toString(), {
        adj_total: stockForm.adj_total,
        adj_reserved: stockForm.adj_reserved,
        adj_shipped: stockForm.adj_shipped
      })

      setProducts(prev => prev.map(p => p.id === stockForm.id ? { 
        ...p, 
        stock_total: newTotal,
        stock_reserved: newReserved,
        stock_shipped: newShipped
      } : p))
      
      setIsStockModalOpen(false)
      toast.success('อัปเดตสต็อกสำเร็จ!')
    } catch (err: any) {
      toast.error('เกิดข้อผิดพลาดในการอัปเดตสต็อก: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const triggerUpload = (productId: number) => {
    currentUploadProductId.current = productId
    fileInputRef.current?.click()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const productId = currentUploadProductId.current
    if (!file || !productId) return

    try {
      setUploading(productId)
      const fileExt = file.name.split('.').pop()
      const fileName = `product_${productId}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `products/${fileName}`

      // 1. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('products')
        .getPublicUrl(filePath)

      // 3. Update Database
      const { error: dbError } = await supabase
        .from('products')
        .update({ image_url: publicUrl })
        .eq('id', productId)

      if (dbError) throw dbError

      logActivity(myProfile?.id || 'system', 'UPLOAD_PRODUCT_IMAGE', 'products', productId.toString())

      // 4. Update UI
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, image_url: publicUrl } : p))
      toast.success('อัพโหลดรูปภาพสำเร็จ!')
    } catch (err: any) {
      console.error('Upload error:', err)
      toast.error('เกิดข้อผิดพลาดในการอัพโหลด: ' + err.message)
    } finally {
      setUploading(null)
      e.target.value = ''
    }
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">✨ สินค้า & สต็อก</span>
        
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        hidden 
        accept="image/*"
      />

      {!loading && !can('view_products') && !can('view_cost') && !can('view_stock') && !can('edit_products') && !can('edit_stock') ? (
        <div style={{ padding: 100, textAlign: 'center', color: 'var(--gray-text)' }}>
          <div style={{ fontSize: 40, marginBottom: 20 }}>🔒</div>
          <h2 style={{ color: '#fff', marginBottom: 8 }}>คุณไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
          <p>กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การใช้งาน</p>
        </div>
      ) : (
        <div className="page-body animate-in">
        {/* SECTION 1: VISUAL SHOWCASE (THE BEAUTIFUL CARDS) */}
        <div className="section-header">
          <div>
            <h2 className="section-title">Showcase Catalog</h2>
            <p className="section-sub">มุมมองนำเสนอผลิตภัณฑ์ระดับพรีเมียม</p>
          </div>
          {can('edit_products') && (
            <button onClick={openAddModal} className="btn btn-primary">+ เพิ่มสินค้าใหม่</button>
          )}
        </div>

        {loading && !isModalOpen && !isStockModalOpen ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-text)' }}>กำลังโหลดข้อมูลสินค้า...</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 40 }}>
              {products.map(p => {
                const margin = p.price_retail > 0 ? Math.round(((p.price_retail - p.cost) / p.price_retail) * 100) : 0
                return (
                  <div key={p.sku} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
                      <img 
                        src={p.image_url || 'https://via.placeholder.com/400x200?text=No+Image'} 
                        alt={p.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div style={{ 
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.8))'
                      }} />
                      {can('view_cost') && (
                        <span className="badge badge-gold" style={{ position: 'absolute', top: 12, right: 12 }}>{margin}% margin</span>
                      )}
                      
                      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8 }}>
                        {can('edit_products') && (
                          <>
                            <button 
                              onClick={() => triggerUpload(p.id)}
                              disabled={uploading === p.id}
                              style={{
                                padding: '4px 8px', borderRadius: 4,
                                background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 10, border: '1px solid rgba(255,255,255,0.2)',
                                backdropFilter: 'blur(4px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                              }}
                            >
                              {uploading === p.id ? '⏳ ' : '📷 '} รูป
                            </button>
                            <button 
                              onClick={() => openEditModal(p)}
                              style={{
                                padding: '4px 8px', borderRadius: 4,
                                background: 'rgba(255,215,0,0.2)', color: 'var(--gold-primary)', fontSize: 10, border: '1px solid var(--gold-primary)',
                                backdropFilter: 'blur(4px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                              }}
                            >
                              ✏️ แก้ไข
                            </button>
                          </>
                        )}
                      </div>

                      <div style={{ position: 'absolute', bottom: 12, left: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: 'var(--gold-primary)', letterSpacing: 2 }}>{p.sku}</span>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>• {p.size || 'ไม่มีขนาด'}</span>
                        </div>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--white)' }}>{p.name}</h3>
                      </div>
                    </div>
                    <div style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 16, borderBottom: '1px solid var(--gray-border)', paddingBottom: 16 }}>
                        {[
                          ...(can('view_cost') ? [{ label: 'ต้นทุน', value: `${p.cost} ฿`, color: 'var(--gray-text)' }] : []),
                          { label: 'ราคาปลีก', value: `${p.price_retail} ฿`, color: 'var(--gold-primary)' },
                          { label: 'ออนไลน์', value: `${p.price_online} ฿`, color: '#2ecc71' },
                          { label: 'ตัวแทน', value: `${p.price_dealer} ฿`, color: '#2980b9' },
                        ].map(item => (
                          <div key={item.label} style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: 13, color: 'var(--gray-text)', marginBottom: 2 }}>{item.label}</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.value}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--gray-text)', textTransform: 'uppercase', marginBottom: 8 }}>
                        Active Ingredients
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {p.active_ingredients && p.active_ingredients.length > 0 ? (
                          p.active_ingredients.map(ing => (
                            <span key={ing} className="badge badge-gray" style={{ fontSize: 10 }}>{ing}</span>
                          ))
                        ) : (
                          <span style={{ fontSize: 10, color: 'var(--gray-text)' }}>ไม่มีข้อมูลส่วนประกอบ</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* SECTION 2: INVENTORY MANAGER (THE DETAILED TABLE) */}
            <div className="section-header">
              <div>
                <h2 className="section-title">Stock & Inventory</h2>
                <p className="section-sub">จัดการสต็อกสินค้าแบบละเอียด (Total, Reserved, Ready, Shipped)</p>
              </div>
            </div>

            <div className="card" style={{ padding: 0, marginBottom: 40 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--gray-border)' }}>
                    <th style={{ padding: '12px 20px', textAlign: 'left', color: 'var(--gray-text)', fontWeight: 500 }}>สินค้า</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left', color: 'var(--gray-text)', fontWeight: 500 }}>รหัส SKU</th>
                    <th style={{ padding: '12px 20px', textAlign: 'right', color: 'var(--gray-text)', fontWeight: 500 }}>ราคากลาง</th>
                    {can('view_stock') && (
                      <>
                        <th style={{ padding: '12px 20px', textAlign: 'center', color: '#2ecc71', fontWeight: 600 }}>สต็อก</th>
                        <th style={{ padding: '12px 20px', textAlign: 'center', color: '#2980b9', fontWeight: 600 }}>ติดจอง</th>
                        <th style={{ padding: '12px 20px', textAlign: 'center', color: '#e67e22', fontWeight: 600 }}>พร้อมขาย</th>
                        <th style={{ padding: '12px 20px', textAlign: 'center', color: '#95a5a6', fontWeight: 600 }}>ส่งแล้ว</th>
                      </>
                    )}
                    {(can('edit_stock')) && (
                      <th style={{ padding: '12px 20px', textAlign: 'center', color: 'var(--gray-text)', fontWeight: 500 }}>Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }} className="table-row-hover">
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <img src={p.image_url || 'https://via.placeholder.com/36x36?text=?'} alt={p.name} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--gray-border)' }} />
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                        </div>
                      </td>
                       <td style={{ padding: '14px 20px', color: 'var(--gray-text)' }}>{p.sku}</td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700 }}>{p.price_online} ฿</td>
                      {can('view_stock') && (
                        <>
                          <td style={{ padding: '14px 20px', textAlign: 'center', color: '#2ecc71', fontWeight: 700 }}>{p.stock_total}</td>
                          <td style={{ padding: '14px 20px', textAlign: 'center', color: '#2980b9', fontWeight: 700 }}>{p.stock_reserved}</td>
                          <td style={{ padding: '14px 20px', textAlign: 'center', color: '#e67e22', fontWeight: 700 }}>{p.stock_total - p.stock_reserved}</td>
                          <td style={{ padding: '14px 20px', textAlign: 'center', color: '#95a5a6' }}>{p.stock_shipped}</td>
                        </>
                      )}
                      {can('edit_stock') && (
                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button 
                              onClick={() => openStockModal(p)}
                              title="แก้ไขสต็อก"
                              style={{ 
                                padding: '6px 12px', borderRadius: 4, border: '1px solid #e67e22', 
                                background: 'rgba(230, 126, 34, 0.1)', color: '#e67e22', fontSize: 11, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 4
                              }}
                            >
                              📈 แก้ไขสต็อก
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    )}

      {/* CREATE / EDIT PRODUCT MODAL */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: 20
        }}>
          <form onSubmit={handleSubmit} className="card animate-in" style={{ maxWidth: 600, width: '100%', padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>
              {editingId ? '✏️ แก้ไขข้อมูลสินค้า' : '📦 เพิ่มสินค้าใหม่'}
            </h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 4 }}>รหัส SKU</label>
                <input required className="input" style={{ width: '100%' }} value={productForm.sku} onChange={e => setProductForm({...productForm, sku: e.target.value})} placeholder="เช่น A05" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 4 }}>ขนาด/ปริมาณ</label>
                <input required className="input" style={{ width: '100%' }} value={productForm.size} onChange={e => setProductForm({...productForm, size: e.target.value})} placeholder="เช่น 30g" />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 4 }}>ชื่อสินค้า</label>
              <input required className="input" style={{ width: '100%' }} value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 4 }}>รายละเอียดสินค้า</label>
              <input className="input" style={{ width: '100%' }} value={productForm.description} onChange={e => setProductForm({...productForm, description: e.target.value})} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 4 }}>ต้นทุน (Cost)</label>
                <input type="number" className="input" style={{ width: '100%' }} value={productForm.cost} onChange={e => setProductForm({...productForm, cost: Number(e.target.value)})} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 4 }}>ราคาปลีก (Retail)</label>
                <input type="number" className="input" style={{ width: '100%' }} value={productForm.price_retail} onChange={e => setProductForm({...productForm, price_retail: Number(e.target.value)})} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 4 }}>ราคาออนไลน์ (Online)</label>
                <input type="number" className="input" style={{ width: '100%' }} value={productForm.price_online} onChange={e => setProductForm({...productForm, price_online: Number(e.target.value)})} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 4 }}>ราคาตัวแทน (Dealer)</label>
                <input type="number" className="input" style={{ width: '100%' }} value={productForm.price_dealer} onChange={e => setProductForm({...productForm, price_dealer: Number(e.target.value)})} />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--gray-text)', marginBottom: 4 }}>ส่วนประกอบ (แยกด้วยเครื่องหมาย , )</label>
              <input className="input" style={{ width: '100%' }} value={productForm.active_ingredients} onChange={e => setProductForm({...productForm, active_ingredients: e.target.value})} placeholder="เช่น Vitamin C, Aloevera" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-ghost">ยกเลิก</button>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? '⏳ กำลังบันทึก...' : '✅ บันทึกสินค้า'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      {isStockModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: 20
        }}>
          <form onSubmit={handleStockUpdate} className="card animate-in" style={{ maxWidth: 500, width: '100%', padding: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: '#e67e22' }}>📈 ปรับปรุงสต็อกสินค้า</h2>
            <p style={{ fontSize: 13, color: 'var(--gray-text)', marginBottom: 24 }}>เพิ่ม/ลดสต็อก หรือแก้ไขค่าโดยตรง</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
              {/* TOTAL STOCK ROW */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <label style={{ fontSize: 14, color: '#2ecc71', fontWeight: 600 }}>สต็อกทั้งหมด (Total)</label>
                  <div style={{ fontSize: 12, color: 'var(--gray-text)' }}>
                    ปัจจุบัน: <span style={{ color: '#fff', fontWeight: 600 }}>{stockForm.total}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-text)', marginBottom: 4 }}>+ เพิ่ม / - ลด</div>
                    <input type="number" className="input" style={{ width: '100%', fontSize: 16 }} 
                      value={stockForm.adj_total === 0 ? '' : stockForm.adj_total} 
                      onChange={e => setStockForm({...stockForm, adj_total: Number(e.target.value)})} 
                      placeholder="เช่น +50 หรือ -10" />
                  </div>
                  <div style={{ fontSize: 20, color: 'var(--gray-text)', paddingTop: 16 }}>=</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-text)', marginBottom: 4 }}>ยอดใหม่ (แก้ไขได้)</div>
                    <input type="number" className="input" style={{ width: '100%', fontSize: 16, color: '#2ecc71', fontWeight: 700 }} 
                      value={stockForm.total + stockForm.adj_total} 
                      onChange={e => {
                        const newVal = Number(e.target.value);
                        setStockForm({...stockForm, total: newVal, adj_total: 0})
                      }} />
                  </div>
                </div>
              </div>

              {/* RESERVED ROW */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <label style={{ fontSize: 14, color: '#2980b9', fontWeight: 600 }}>ติดจอง (Reserved)</label>
                  <div style={{ fontSize: 12, color: 'var(--gray-text)' }}>
                    ปัจจุบัน: <span style={{ color: '#fff', fontWeight: 600 }}>{stockForm.reserved}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-text)', marginBottom: 4 }}>+ เพิ่ม / - ลด</div>
                    <input type="number" className="input" style={{ width: '100%', fontSize: 16 }} 
                      value={stockForm.adj_reserved === 0 ? '' : stockForm.adj_reserved} 
                      onChange={e => setStockForm({...stockForm, adj_reserved: Number(e.target.value)})} 
                      placeholder="เช่น +5" />
                  </div>
                  <div style={{ fontSize: 20, color: 'var(--gray-text)', paddingTop: 16 }}>=</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-text)', marginBottom: 4 }}>ยอดใหม่ (แก้ไขได้)</div>
                    <input type="number" className="input" style={{ width: '100%', fontSize: 16, color: '#2980b9', fontWeight: 700 }} 
                      value={stockForm.reserved + stockForm.adj_reserved} 
                      onChange={e => {
                        const newVal = Number(e.target.value);
                        setStockForm({...stockForm, reserved: newVal, adj_reserved: 0})
                      }} />
                  </div>
                </div>
              </div>

              {/* SHIPPED ROW */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <label style={{ fontSize: 14, color: '#95a5a6', fontWeight: 600 }}>ส่งแล้ว (Shipped)</label>
                  <div style={{ fontSize: 12, color: 'var(--gray-text)' }}>
                    ปัจจุบัน: <span style={{ color: '#fff', fontWeight: 600 }}>{stockForm.shipped}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-text)', marginBottom: 4 }}>+ เพิ่ม / - ลด</div>
                    <input type="number" className="input" style={{ width: '100%', fontSize: 16 }} 
                      value={stockForm.adj_shipped === 0 ? '' : stockForm.adj_shipped} 
                      onChange={e => setStockForm({...stockForm, adj_shipped: Number(e.target.value)})} 
                      placeholder="+/-" />
                  </div>
                  <div style={{ fontSize: 20, color: 'var(--gray-text)', paddingTop: 16 }}>=</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-text)', marginBottom: 4 }}>ยอดใหม่ (แก้ไขได้)</div>
                    <input type="number" className="input" style={{ width: '100%', fontSize: 16, color: '#95a5a6', fontWeight: 700 }} 
                      value={stockForm.shipped + stockForm.adj_shipped} 
                      onChange={e => {
                        const newVal = Number(e.target.value);
                        setStockForm({...stockForm, shipped: newVal, adj_shipped: 0})
                      }} />
                  </div>
                </div>
              </div>

              {/* AUTO READY TO SELL PREVIEW */}
              <div style={{ background: 'rgba(230, 126, 34, 0.1)', borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#e67e22', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 2 }}>พร้อมขายหลังอัปเดต (Ready to Sell)</div>
                  <div style={{ fontSize: 11, color: 'rgba(230, 126, 34, 0.6)' }}>คำนวณจาก (สต็อกทั้งหมด + เพิ่ม) - (ยอดจอง + เพิ่ม)</div>
                </div>
                <span style={{ fontSize: 32, fontWeight: 800, color: '#e67e22' }}>
                  {(stockForm.total + stockForm.adj_total) - (stockForm.reserved + stockForm.adj_reserved)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button type="button" onClick={() => setIsStockModalOpen(false)} className="btn btn-ghost">ยกเลิก</button>
              <button type="submit" disabled={loading} className="btn btn-primary" style={{ background: '#e67e22', borderColor: '#e67e22' }}>
                {loading ? '⏳ กำลังอัปเดต...' : '✅ อัปเดตข้อมูลสต็อก'}
              </button>
            </div>
          </form>
        </div>
      )}

      <style jsx>{`
        .table-row-hover:hover {
          background: rgba(255,255,255,0.02);
        }
      `}</style>
    </>
  )
}
