import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/hooks/useAuth'
import { ToastContainer } from '@/components/ui/Toast'

export const metadata: Metadata = {
  title: 'BillCapture — Enterprise OCR',
  description: 'High-volume OCR bill capture for delivery operations',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white font-sans">
        <AuthProvider>
          {children}
          <ToastContainer />
        </AuthProvider>
      </body>
    </html>
  )
}
