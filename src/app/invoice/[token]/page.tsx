import { Metadata } from 'next'
import InvoiceClient from './InvoiceClient'

export const metadata: Metadata = {
  title: 'ASTERNA | ใบแจ้งรายการสินค้า',
  description: 'ระบบใบแจ้งรายการสินค้าและการชำระเงินออนไลน์',
}

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Pass token to client component which will fetch data via RPC.
  // We do it on the client so we can use RLS easily, but since we use RPC with anon key,
  // we could also fetch it here. For simplicity and real-time updates (like slip upload),
  // Client component handles the state.
  return (
    <main style={{ minHeight: '100vh', background: 'var(--black-bg, #121212)', color: '#fff', fontFamily: 'sans-serif' }}>
      <InvoiceClient token={token} />
    </main>
  )
}
