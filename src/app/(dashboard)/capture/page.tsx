import { CaptureWidget } from '@/components/capture/CaptureWidget'

export default function CapturePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Capture Bill</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Scan, upload or manually enter bill details</p>
      </div>
      <CaptureWidget />
    </div>
  )
}
