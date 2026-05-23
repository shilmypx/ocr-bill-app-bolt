import { DashboardStats } from '@/components/dashboard/DashboardStats'

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Overview of bill capture operations</p>
      </div>
      <DashboardStats />
    </div>
  )
}
