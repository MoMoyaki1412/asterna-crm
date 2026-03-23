import Link from 'next/link'

export default function Home() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--black-deep)', color: 'var(--white)', alignItems: 'center', justifyContent: 'center' }}>
      
      {/* Background Decor */}
      <div style={{ position: 'absolute', top: '10%', left: '20%', width: 300, height: 300, background: 'var(--gold-primary)', filter: 'blur(150px)', opacity: 0.1, borderRadius: '50%', pointerEvents: 'none' }}></div>
      <div style={{ position: 'absolute', bottom: '10%', right: '20%', width: 300, height: 300, background: 'var(--gold-dark)', filter: 'blur(150px)', opacity: 0.1, borderRadius: '50%', pointerEvents: 'none' }}></div>

      {/* Content */}
      <div className="animate-in" style={{ textAlign: 'center', zIndex: 10, maxWidth: 600 }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 64, fontWeight: 900, letterSpacing: 4, background: 'linear-gradient(to right, var(--gold-light), var(--gold-primary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
            ASTERNA
          </h1>
          <p style={{ fontSize: 18, color: 'var(--gray-text)', marginTop: 8, letterSpacing: 6, textTransform: 'uppercase' }}>
            Commerce Management System
          </p>
        </div>

        <p style={{ fontSize: 16, color: 'var(--white-muted)', marginBottom: 48, lineHeight: 1.6 }}>
          ระบบจัดการความสัมพันธ์ลูกค้า (CRM) และสถิติร้านค้าครบวงจรระดับพรีเมียม สำหรับแบรนด์ Asterna โดยเฉพาะ
        </p>

        <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
          <Link href="/admin" className="btn btn-primary" style={{ padding: '16px 40px', fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
            เข้าสู่ระบบ Admin Dashboard 🚀
          </Link>
        </div>
      </div>

    </div>
  )
}
