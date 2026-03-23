/**
 * Masks a phone number for privacy (e.g., 081-234-5678 -> 081-XXX-XXXX)
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  return `********** (ซ่อนโดยระบบ)`
}

/**
 * Masks an address for privacy
 */
export function maskAddress(address: string | null | undefined): string {
  if (!address) return '—'
  return `********** (ซ่อนโดยระบบ)`
}
