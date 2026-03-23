import { supabase } from './supabase'

export async function logActivity(
  adminId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, any>
) {
  try {
    const { error } = await supabase.from('activity_logs').insert({
      admin_id: adminId,
      action_type: action,
      entity_type: entityType,
      entity_id: entityId,
      details
    })
    if (error) {
      console.error('Activity Log Error:', error.message)
    }
  } catch (err) {
    console.error('Activity Log Exception:', err)
  }
}
