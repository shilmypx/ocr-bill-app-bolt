'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types'

interface AuthCtx {
  user: User | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  isApproved: boolean
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({ user: null, profile: null, loading: true, isAdmin: false, isApproved: false, signOut: async () => {} })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (u: User) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', u.id).single()
    setProfile(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        await loadProfile(u)
        if (event === 'SIGNED_IN') {
          // Log login audit
          const { data: p } = await supabase.from('profiles').select('full_name,email').eq('id', u.id).single()
          await supabase.from('audit_logs').insert({
            user_id: u.id, user_email: p?.email || u.email || '',
            user_name: p?.full_name || '', action_type: 'LOGIN',
            module: 'Auth', description: `User ${u.email} logged in`,
            metadata: {}, ip_address: 'client',
          })
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  const signOut = async () => {
    if (user && profile) {
      await supabase.from('audit_logs').insert({
        user_id: user.id, user_email: profile.email || user.email || '',
        user_name: profile.full_name || '', action_type: 'LOGOUT',
        module: 'Auth', description: `User ${user.email} logged out`,
        metadata: {}, ip_address: 'client',
      })
    }
    await supabase.auth.signOut()
  }

  const isAdmin = profile?.role === 'admin'
  const isApproved = profile?.is_approved ?? false

  return <Ctx.Provider value={{ user, profile, loading, isAdmin, isApproved, signOut }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
