import { DashboardStats } from '@/components/dashboard/DashboardStats'
import Link from 'next/link'

export default function DashboardPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Overview of bill capture operations</p>
        </div>
        <Link href="/capture"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all">
          📷 <span>Capture Bill</span>
        </Link>
      </div>
      <DashboardStats />
    </div>
  )
}
