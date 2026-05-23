'use client'
import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'warning'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

let addToastFn: ((toast: Omit<Toast, 'id'>) => void) | null = null

export function toast(type: ToastType, message: string, duration = 3000) {
  addToastFn?.({ type, message, duration })
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    addToastFn = (t) => {
      const id = Math.random().toString(36).slice(2)
      setToasts(prev => [...prev, { ...t, id }])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), t.duration ?? 3000)
    }
    return () => { addToastFn = null }
  }, [])

  const icons = { success: CheckCircle, error: XCircle, warning: AlertCircle }
  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300',
    error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-300',
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => {
        const Icon = icons[t.type]
        return (
          <div key={t.id} className={cn('flex items-start gap-3 p-4 rounded-xl border shadow-lg animate-in slide-in-from-right', colors[t.type])}>
            <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <p className="text-sm font-medium flex-1">{t.message}</p>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
              <X className="h-4 w-4 opacity-60" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
