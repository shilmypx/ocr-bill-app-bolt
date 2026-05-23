import { RecordsTable } from '@/components/records/RecordsTable'

export default function RecordsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bill Records</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Search, filter, and export captured bill data</p>
      </div>
      <RecordsTable />
    </div>
  )
}
