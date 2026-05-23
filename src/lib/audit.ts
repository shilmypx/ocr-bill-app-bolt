import { supabase } from './supabase'

export async function logAudit(
  actionType: string,
  module: string,
  description: string,
  metadata?: Record<string, unknown>
) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action_type: actionType,
      module,
      description,
      ip_address: 'client',
      metadata: metadata ?? {},
      user_email: profile?.email || user.email,
      user_name: profile?.full_name || '',
    })
  } catch (err) {
    console.error('Audit log failed:', err)
  }
}
