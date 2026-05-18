'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, Upload, RotateCcw, CircleCheck as CheckCircle2, CircleAlert as AlertCircle, Loader as Loader2, ScanLine, User, Phone, Hash, Calendar, MapPin, Truck, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { recognizeImage } from '@/lib/ocr-worker';
import { compressImage, captureFrameFromVideo, fileToDataURL } from '@/lib/image-utils';
import { extractFields, type ExtractedBillFields } from '@/lib/field-extractor';

type ScanState = 'idle' | 'scanning' | 'processing' | 'success' | 'error';

interface FieldConfig {
  key: keyof ExtractedBillFields;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  required?: boolean;
  placeholder: string;
}

const FIELDS: FieldConfig[] = [
  { key: 'customer_name', label: 'Customer Name', icon: User, placeholder: 'John Doe' },
  { key: 'contact_number', label: 'Contact Number', icon: Phone, required: true, placeholder: '9876543210' },
  { key: 'bill_number', label: 'Bill Number', icon: Hash, placeholder: 'INV-001' },
  { key: 'bill_date', label: 'Bill Date', icon: Calendar, placeholder: '01/01/2025' },
  { key: 'restaurant', label: 'Restaurant', icon: Store, placeholder: 'Restaurant name' },
  { key: 'address', label: 'Address', icon: MapPin, placeholder: 'Address' },
  { key: 'delivery_partner', label: 'Delivery Partner', icon: Truck, placeholder: 'Zomato / Swiggy' },
];

const EMPTY_FIELDS: ExtractedBillFields = {
  customer_name: '',
  contact_number: '',
  bill_number: '',
  bill_date: '',
  restaurant: '',
  address: '',
  delivery_partner: '',
};

export default function ScanPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [cameraActive, setCameraActive] = useState(false);
  const [fields, setFields] = useState<ExtractedBillFields>(EMPTY_FIELDS);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  useEffect(() => {
    return () => {
      stopCamera();
      if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
    };
  }, []);

  const startCamera = async () => {
    try {
      if (streamRef.current) stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      toast({ title: 'Camera unavailable', description: 'Use file upload instead.', variant: 'destructive' });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const flipCamera = async () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    stopCamera();
    setTimeout(() => startCamera(), 100);
  };

  const processImage = useCallback(async (dataUrl: string) => {
    setScanState('processing');
    setCapturedImage(dataUrl);
    setErrorMsg('');

    try {
      const compressed = await compressImage(dataUrl);
      const rawText = await recognizeImage(compressed);
      const extracted = extractFields(rawText);

      if (!extracted.contact_number) {
        setScanState('error');
        setErrorMsg('Contact number not found in the bill. Please try again with a clearer image.');
        return;
      }

      setFields({ ...extracted, ...Object.fromEntries(
        Object.entries(extracted).map(([k, v]) => [k, v])
      ) as ExtractedBillFields });

      // Auto-save
      const { error } = await supabase.from('bill_records').insert({
        user_id: user!.id,
        ...extracted,
        raw_text: rawText,
      });

      if (error) throw error;

      setSavedCount((c) => c + 1);
      setScanState('success');
      stopCamera();

      // Auto-reset after 3s for next scan
      autoResetTimerRef.current = setTimeout(() => {
        resetForNextScan();
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OCR processing failed';
      setScanState('error');
      setErrorMsg(msg);
    }
  }, [user]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const dataUrl = captureFrameFromVideo(videoRef.current);
    processImage(dataUrl);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const dataUrl = await fileToDataURL(file);
    setScanState('scanning');
    stopCamera();
    processImage(dataUrl);
  };

  const resetForNextScan = () => {
    setScanState('idle');
    setCapturedImage(null);
    setFields(EMPTY_FIELDS);
    setErrorMsg('');
  };

  const handleFieldChange = (key: keyof ExtractedBillFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="max-w-2xl mx-auto page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Scan Bill</h1>
          <p className="text-sm text-muted-foreground">Point camera at a bill or upload an image</p>
        </div>
        {savedCount > 0 && (
          <div className="flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-full text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {savedCount} saved
          </div>
        )}
      </div>

      {/* Camera / Upload area */}
      {scanState !== 'success' && scanState !== 'processing' && !capturedImage && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm mb-4">
          {/* Camera viewfinder */}
          <div className="relative bg-black" style={{ aspectRatio: '4/3' }}>
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
            />

            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center">
                  <Camera className="h-10 w-10 text-white/60" />
                </div>
                <p className="text-white/60 text-sm">Camera off</p>
              </div>
            )}

            {cameraActive && (
              <>
                {/* Corner guides */}
                <div className="absolute inset-8 pointer-events-none">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-sm" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-sm" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-sm" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-sm" />
                </div>
                {/* Scan line */}
                <div className="absolute inset-x-8 h-0.5 bg-primary/80 scan-line shadow-[0_0_8px_2px_rgba(59,130,246,0.5)]" />
              </>
            )}

            {scanState === 'scanning' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-white text-sm">Processing OCR...</p>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="p-4 flex gap-2">
            {!cameraActive ? (
              <Button onClick={startCamera} className="flex-1 gap-2">
                <Camera className="h-4 w-4" />
                Start Camera
              </Button>
            ) : (
              <>
                <Button onClick={capturePhoto} className="flex-1 gap-2">
                  <ScanLine className="h-4 w-4" />
                  Capture & Scan
                </Button>
                <Button variant="outline" size="icon" onClick={flipCamera} title="Flip camera">
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={stopCamera} title="Stop camera">
                  <Camera className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>
      )}

      {/* Processing state */}
      {scanState === 'processing' && (
        <div className="bg-card rounded-2xl border border-border p-8 mb-4 flex flex-col items-center gap-4 shadow-sm">
          {capturedImage && (
            <img
              src={capturedImage}
              alt="Captured"
              className="w-full max-h-48 object-contain rounded-xl bg-muted"
            />
          )}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              <ScanLine className="h-4 w-4 text-primary absolute inset-0 m-auto" />
            </div>
            <div>
              <p className="font-medium text-foreground">Running OCR...</p>
              <p className="text-sm text-muted-foreground">Extracting bill details</p>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {scanState === 'error' && (
        <div className="bg-card rounded-2xl border border-destructive/30 p-6 mb-4 shadow-sm">
          {capturedImage && (
            <img
              src={capturedImage}
              alt="Captured"
              className="w-full max-h-36 object-contain rounded-xl bg-muted mb-4"
            />
          )}
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="font-semibold text-destructive">Scan Failed</p>
              <p className="text-sm text-muted-foreground mt-0.5">{errorMsg}</p>
            </div>
          </div>
          <Button onClick={resetForNextScan} className="w-full gap-2">
            <RotateCcw className="h-4 w-4" />
            Try Again
          </Button>
        </div>
      )}

      {/* Success state */}
      {scanState === 'success' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800">Saved successfully!</p>
            <p className="text-xs text-green-600">Next scan starts in 3 seconds...</p>
          </div>
          <Button size="sm" onClick={resetForNextScan} className="gap-1.5 bg-green-600 hover:bg-green-700">
            <ScanLine className="h-3.5 w-3.5" />
            Scan Now
          </Button>
        </div>
      )}

      {/* Extracted fields */}
      {(scanState === 'success' || scanState === 'error') && fields.contact_number && (
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h3 className="text-sm font-semibold text-foreground">Extracted Data</h3>
          </div>
          <div className="divide-y divide-border">
            {FIELDS.map(({ key, label, icon: Icon, required }) => (
              <div key={key} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">
                    {label}
                    {required && <span className="text-destructive ml-1">*</span>}
                  </p>
                  <p className={`text-sm font-medium truncate ${fields[key] ? 'text-foreground' : 'text-muted-foreground/50 italic'}`}>
                    {fields[key] || 'Not detected'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tips (idle state) */}
      {scanState === 'idle' && (
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-2">Scanning Tips</h3>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-2"><span className="text-primary font-bold mt-0.5">1.</span>Ensure good lighting on the bill</li>
            <li className="flex items-start gap-2"><span className="text-primary font-bold mt-0.5">2.</span>Hold camera steady — keep bill flat</li>
            <li className="flex items-start gap-2"><span className="text-primary font-bold mt-0.5">3.</span>Contact number is required for saving</li>
            <li className="flex items-start gap-2"><span className="text-primary font-bold mt-0.5">4.</span>OCR processes entirely in your browser</li>
          </ul>
        </div>
      )}
    </div>
  );
}
