'use client'
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
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
  refreshProfile: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  user: null, profile: null, loading: true,
  isAdmin: false, isApproved: false,
  signOut: async () => {}, refreshProfile: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)

  const loadProfile = useCallback(async (uid: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    if (mounted.current) setProfile(data)
    return data
  }, [])

  const refreshProfile = useCallback(async () => {
    const { data: { user: u } } = await supabase.auth.getUser()
    if (u) await loadProfile(u.id)
  }, [loadProfile])

  useEffect(() => {
    mounted.current = true

    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted.current) return
      const u = session?.user ?? null
      setUser(u)
      if (u) await loadProfile(u.id)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted.current) return
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        const p = await loadProfile(u.id)
        if (event === 'SIGNED_IN' && p) {
          supabase.from('audit_logs').insert({
            user_id: u.id, user_email: p.email || u.email || '',
            user_name: p.full_name || '', action_type: 'LOGIN',
            module: 'Auth', description: `${u.email} logged in`,
            metadata: {}, ip_address: 'client',
          }).then(() => {})
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => { mounted.current = false; subscription.unsubscribe() }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    if (user && profile) {
      await supabase.from('audit_logs').insert({
        user_id: user.id, user_email: profile.email || '',
        user_name: profile.full_name || '', action_type: 'LOGOUT',
        module: 'Auth', description: `${user.email} logged out`,
        metadata: {}, ip_address: 'client',
      })
    }
    await supabase.auth.signOut()
  }, [user, profile])

  return (
    <Ctx.Provider value={{
      user, profile, loading,
      isAdmin: profile?.role === 'admin',
      isApproved: profile?.is_approved ?? false,
      signOut, refreshProfile,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
