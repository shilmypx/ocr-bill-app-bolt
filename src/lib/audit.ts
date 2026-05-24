import { supabase } from './supabase'

export async function logAudit(
  action_type: string,
  module: string,
  description: string,
  metadata?: Record<string, unknown>
) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('profiles').select('full_name, email').eq('id', user.id).single()
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      user_email: profile?.email || user.email || '',
      user_name: profile?.full_name || '',
      action_type,
      module,
      description,
      metadata: metadata || {},
      ip_address: 'client',
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    console.error('Audit log error:', e)
  }
}
