import { useState, FormEvent, ChangeEvent, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAudits } from '../AuditContext';
import { CHECKLIST_TEMPLATES } from '../constants';
import { Audit } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { uploadAuditPhotoWithMeta } from '../lib/firebaseStorage';
import { compressImage } from '../lib/utils';
import { Camera, Loader2, X } from 'lucide-react';
import { getTemplateForNewAudit } from '../lib/templateManager';

const STEP_TIMEOUT_MS = 15000;

const withTimeout = async <T,>(promise: Promise<T>, label: string, timeoutMs = STEP_TIMEOUT_MS): Promise<T> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
};

const createAuditId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export default function NewAudit() {
  const navigate = useNavigate();
  const { saveAudit } = useAudits();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    clientName: '',
    siteName: '',
    siteAddress: '',
    auditDate: new Date().toISOString().split('T')[0],
    auditorName: user?.email?.split('@')[0] || '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Logo upload state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Building photo upload state
  const [buildingFile, setBuildingFile] = useState<File | null>(null);
  const [buildingPreview, setBuildingPreview] = useState('');
  const [buildingDataUrl, setBuildingDataUrl] = useState('');
  const buildingInputRef = useRef<HTMLInputElement>(null);

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image data URL'));
      reader.readAsDataURL(file);
    });

  const setField = (key: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleLogoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    try {
      setLogoDataUrl(await fileToDataUrl(file));
    } catch {
      setLogoDataUrl('');
    }
  };

  const handleBuildingChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBuildingFile(file);
    setBuildingPreview(URL.createObjectURL(file));
    try {
      setBuildingDataUrl(await fileToDataUrl(file));
    } catch {
      setBuildingDataUrl('');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const auditId = createAuditId();

    const normalizedData = {
      clientName: formData.clientName.trim(),
      siteName: formData.siteName.trim(),
      siteAddress: formData.siteAddress.trim(),
      auditDate: formData.auditDate,
      auditorName: formData.auditorName.trim(),
    };

    try {
      let templateSections = JSON.parse(JSON.stringify(CHECKLIST_TEMPLATES));
      let templateMainResponseOptions: Audit['mainResponseOptions'] = ['positive', 'negative', 'na'];
      let templateReportDefaults: Partial<Audit> = {};

      try {
        const { template, sections, reportDefaults } = await getTemplateForNewAudit();
        templateSections = sections;
        templateMainResponseOptions = template.mainResponseOptions;
        templateReportDefaults = {
          introduction: reportDefaults.introduction,
          scope: reportDefaults.scope,
          methodology: reportDefaults.methodology,
          legislation: reportDefaults.legislation,
          disclaimer: reportDefaults.disclaimer,
          conclusion: reportDefaults.conclusion,
        };
      } catch (templateError) {
        console.warn('⚠️ Failed to load active template, falling back to local defaults:', templateError);
      }

      const now = new Date().toISOString();
      const assessmentReference = `RA-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}-${auditId.slice(0, 6).toUpperCase()}`;
      const newAudit: Audit = {
        id: auditId,
        userId: user?.uid,
        assessmentReference,
        ...normalizedData,
        siteLogoDataUrl: logoDataUrl || undefined,
        siteBuildingPhotoDataUrl: buildingDataUrl || undefined,
        status: 'draft',
        mainResponseOptions: templateMainResponseOptions,
        sections: templateSections,
        ...templateReportDefaults,
        findings: [],
        actions: [],
        createdAt: now,
        updatedAt: now,
      };

      // Save immediately so the user can continue without waiting for image work.
      await withTimeout(saveAudit(newAudit), 'Audit save', 10000);
      navigate(`/audit/${newAudit.id}/narrative`);

      // Upload optional images in the background and patch the audit once done.
      if (logoFile || buildingFile) {
        void (async () => {
          try {
            const [compressedLogo, compressedBuilding] = await Promise.all([
              logoFile ? withTimeout(compressImage(logoFile, 800, 0.85), 'Logo compression') : Promise.resolve(null),
              buildingFile ? withTimeout(compressImage(buildingFile, 1200, 0.78), 'Building photo compression') : Promise.resolve(null),
            ]);

            const [logoUrl, buildingUrl] = await Promise.all([
              compressedLogo ? uploadAuditPhotoWithMeta(auditId, compressedLogo) : Promise.resolve(undefined),
              compressedBuilding ? uploadAuditPhotoWithMeta(auditId, compressedBuilding) : Promise.resolve(undefined),
            ]);

            if (!logoUrl && !buildingUrl) return;

            await withTimeout(
              saveAudit({
                ...newAudit,
                siteLogoUrl: logoUrl?.downloadURL,
                siteLogoPath: logoUrl?.storagePath,
                siteBuildingPhotoUrl: buildingUrl?.downloadURL,
                siteBuildingPhotoPath: buildingUrl?.storagePath,
                updatedAt: new Date().toISOString(),
              }),
              'Audit image update',
              10000,
            );
          } catch (error) {
            console.warn('⚠️ Background image upload failed:', error);
          }
        })();
      }
    } catch (error) {
      console.error('❌ Failed to create audit:', error);
      alert('Failed to create audit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="New Audit" showBack>
      <div className="card p-6 md:p-8">
        <h2 className="text-xl font-bold mb-6">Audit Details</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="label">Client Name</label>
            <input 
              type="text" 
              className="input" 
              placeholder="e.g. Acme Corp"
              value={formData.clientName}
              onChange={(e) => setField('clientName', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">Site Name</label>
            <input 
              type="text" 
              className="input" 
              placeholder="e.g. London HQ"
              value={formData.siteName}
              onChange={(e) => setField('siteName', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">Site Address</label>
            <textarea 
              className="input min-h-[100px] py-3" 
              placeholder="Full site address..."
              value={formData.siteAddress}
              onChange={(e) => setField('siteAddress', e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Audit Date</label>
              <input 
                type="date" 
                className="input" 
                value={formData.auditDate}
                onChange={(e) => setField('auditDate', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Auditor Name</label>
              <input 
                type="text" 
                className="input" 
                value={formData.auditorName}
                onChange={(e) => setField('auditorName', e.target.value)}
                required
              />
            </div>
          </div>

          {/* Photo Upload Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Client / Company Logo */}
            <div className="space-y-2">
              <label className="label">Client / Company Logo</label>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
              {logoPreview ? (
                <div className="relative w-full h-36 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 group">
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain p-2" />
                  <button
                    type="button"
                    onClick={() => { setLogoFile(null); setLogoPreview(''); }}
                    className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="btn btn-secondary w-full h-36 flex-col gap-2 border-dashed text-slate-400"
                >
                  <Camera className="w-6 h-6" />
                  <span className="text-sm">Upload logo</span>
                </button>
              )}
            </div>

            {/* Building / Site Photo */}
            <div className="space-y-2">
              <label className="label">Building / Site Photo</label>
              <input
                ref={buildingInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBuildingChange}
              />
              {buildingPreview ? (
                <div className="relative w-full h-36 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 group">
                  <img src={buildingPreview} alt="Building preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => { setBuildingFile(null); setBuildingPreview(''); }}
                    className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => buildingInputRef.current?.click()}
                  className="btn btn-secondary w-full h-36 flex-col gap-2 border-dashed text-slate-400"
                >
                  <Camera className="w-6 h-6" />
                  <span className="text-sm">Upload building photo</span>
                </button>
              )}
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary w-full py-4 text-lg gap-2"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {submitting ? 'Creating Audit...' : 'Start Inspection'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
