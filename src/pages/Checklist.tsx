import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAudits } from '../AuditContext';
import { Audit, ComplianceStatus, Finding, Action, ChecklistItem, ItemPhoto } from '../types';
import { X, MessageSquare, ChevronDown, ChevronUp, Save, Loader2, AlertTriangle, ChevronRight, ChevronLeft, Download, WifiOff, RefreshCw, ImagePlus, ZoomIn } from 'lucide-react';
import { cn, compressImageUnderSize, withTimeout } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { uploadAuditPhotoWithMeta } from '../lib/firebaseStorage';
import {
  addPendingUpload,
  dataUrlToFile,
  fileToDataUrl,
  getPendingUploadsForAudit,
  PendingPhotoUpload,
  removePendingUpload,
  removePendingUploadsForItem,
  removePendingUploadForPhoto,
  updatePendingUploadError,
} from '../lib/photoUploadQueue';
import {
  getNegativeResponseOptionsForItem,
  getPositiveResponseOptionsForItem,
  getPriorityFromRiskBand,
  getRecommendedActionFromNegativeOption,
} from '../constants';
import { normalizeRiskData } from '../lib/risk';

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export default function Checklist() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getAudit, saveAudit, loading } = useAudits();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<'idle' | 'compressing' | 'uploading'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingPhotoUpload[]>([]);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  // localPreviews is keyed by photoId (not itemId) so multiple photos per item each have their own slot
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [lightboxState, setLightboxState] = useState<{ itemId: string; photos: ItemPhoto[]; photoIndex: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncPendingUploadsRef = useRef<(() => void) | null>(null);
  const objectPreviewUrlsRef = useRef<Record<string, string>>({});
  const [currentUploadTarget, setCurrentUploadTarget] = useState<{ sectionId: string; itemId: string; photoId: string } | null>(null);

  const clearObjectPreview = (photoId: string) => {
    const previewUrl = objectPreviewUrlsRef.current[photoId];
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      delete objectPreviewUrlsRef.current[photoId];
    }
  };

  const setObjectPreview = (photoId: string, file: File) => {
    clearObjectPreview(photoId);
    const previewUrl = URL.createObjectURL(file);
    objectPreviewUrlsRef.current[photoId] = previewUrl;
    setLocalPreviews((prev) => ({ ...prev, [photoId]: previewUrl }));
  };

  const setPersistentPreview = (photoId: string, dataUrl: string) => {
    clearObjectPreview(photoId);
    setLocalPreviews((prev) => ({ ...prev, [photoId]: dataUrl }));
  };

  useEffect(() => {
    if (!id || loading) return;

    const found = getAudit(id);
    if (!found) {
      navigate('/');
      return;
    }

    setAudit(found);
    setActiveSection((current) => {
      if (!found.sections || found.sections.length === 0) {
        return null;
      }

      if (current && found.sections.some((section) => section.id === current)) {
        return current;
      }

      return found.sections[0].id;
    });
  }, [id, loading, getAudit, navigate]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!audit) return;
    const queue = getPendingUploadsForAudit(audit.id);
    setPendingUploads(queue);
    const previews: Record<string, string> = {};
    queue.forEach((entry) => {
      previews[entry.photoId] = entry.dataUrl;
      clearObjectPreview(entry.photoId);
    });
    setLocalPreviews(previews);
  }, [audit?.id]);

  useEffect(() => {
    return () => {
      Object.keys(objectPreviewUrlsRef.current).forEach((itemId) => clearObjectPreview(itemId));
    };
  }, []);

  // Auto-sync effect must be here (before early returns) to obey Rules of Hooks.
  useEffect(() => {
    if (!isOnline || !audit || pendingUploads.length === 0 || isSyncingQueue) return;
    // syncPendingUploads is defined later in the component; captured via ref to keep this effect stable.
    syncPendingUploadsRef.current?.();
  }, [isOnline, audit?.id, pendingUploads.length, isSyncingQueue]);

  if (!audit) return null;
  if (!audit.sections || audit.sections.length === 0) {
    return (
      <Layout title="Inspection" showBack>
        <div className="p-8 text-center text-slate-500">No checklist sections found for this audit.</div>
      </Layout>
    );
  }

  const buildLinkedFinding = (item: ChecklistItem, sectionId: string, sectionTitle: string, existing?: Finding): Finding => {
    const likelihood = existing?.likelihood ?? item.defaultLikelihood ?? 3;
    const severity = existing?.severity ?? item.defaultSeverity ?? 3;
    const risk = normalizeRiskData(likelihood, severity, existing?.finalRiskRating);
    const priority = getPriorityFromRiskBand(risk.finalRiskRating);

    const baseObservation = item.observation?.trim() || item.question?.trim() || item.negativeFinding || 'Non-compliance observed.';
    const note = item.comment?.trim();
    const observation = note && !baseObservation.toLowerCase().includes(note.toLowerCase())
      ? `${baseObservation}\nInspector Note: ${note}`
      : baseObservation;

    return {
      id: existing?.id || createId('finding'),
      itemId: item.id,
      sectionId,
      sectionTitle,
      title: item.negativeFinding || `Non-compliance in ${sectionTitle}`,
      observation,
      recommendedAction: item.defaultRecommendedAction || getRecommendedActionFromNegativeOption(item.negativeFinding),
      likelihood,
      severity,
      calculatedRiskScore: risk.calculatedRiskScore,
      calculatedRiskBand: risk.calculatedRiskBand,
      finalRiskRating: risk.finalRiskRating,
      riskScore: risk.riskScore,
      riskBand: risk.riskBand,
      priority,
      targetDate: existing?.targetDate,
      responsiblePerson: existing?.responsiblePerson,
      status: existing?.status || 'Open',
    };
  };

  const buildLinkedAction = (finding: Finding, existing?: Action): Action => ({
    id: existing?.id || createId('action'),
    findingId: finding.id,
    findingTitle: finding.title,
    actionRequired: finding.recommendedAction,
    priority: finding.priority,
    likelihood: finding.likelihood,
    severity: finding.severity,
    calculatedRiskScore: finding.calculatedRiskScore,
    calculatedRiskBand: finding.calculatedRiskBand,
    finalRiskRating: finding.finalRiskRating,
    riskBand: finding.riskBand,
    riskScore: finding.riskScore,
    responsiblePerson: existing?.responsiblePerson || finding.responsiblePerson,
    targetDate: existing?.targetDate || finding.targetDate,
    status: existing?.status || 'Open',
    comments: existing?.comments,
  });

  const updateItem = (sectionId: string, itemId: string, updates: Partial<ChecklistItem>) => {
    if (!audit) return;

    const newSections = audit.sections.map(section => {
      if (section.id === sectionId) {
        return {
          ...section,
          items: section.items.map(item => {
            if (item.id === itemId) {
              return { ...item, ...updates };
            }
            return item;
          })
        };
      }
      return section;
    });

    const updatedSection = newSections.find((section) => section.id === sectionId);
    const updatedItem = updatedSection?.items.find((item) => item.id === itemId);

    let updatedFindings = [...(audit.findings || [])];
    let updatedActions = [...(audit.actions || [])];

    if (updatedSection && updatedItem) {
      const existingFinding = updatedFindings.find((finding) => finding.itemId === itemId);

      if (updatedItem.status === 'negative' && updatedItem.negativeCreatesFinding !== false) {
        const syncedFinding = buildLinkedFinding(updatedItem, sectionId, updatedSection.title, existingFinding);

        if (existingFinding) {
          updatedFindings = updatedFindings.map((finding) => (finding.id === existingFinding.id ? syncedFinding : finding));
        } else {
          updatedFindings.push(syncedFinding);
        }

        const existingAction = updatedActions.find((action) => action.findingId === syncedFinding.id);
        const syncedAction = buildLinkedAction(syncedFinding, existingAction);

        if (existingAction) {
          updatedActions = updatedActions.map((action) => (action.id === existingAction.id ? syncedAction : action));
        } else {
          updatedActions.push(syncedAction);
        }
      } else if (existingFinding) {
        updatedFindings = updatedFindings.filter((finding) => finding.id !== existingFinding.id);
        updatedActions = updatedActions.filter((action) => action.findingId !== existingFinding.id);
      }
    }

    const updatedAudit = { 
      ...audit, 
      sections: newSections, 
      findings: updatedFindings,
      actions: updatedActions,
      updatedAt: new Date().toISOString() 
    };
    setAudit(updatedAudit);
    saveAudit(updatedAudit);
  };

  const queuePendingPhoto = async (
    sourceFile: File,
    sectionId: string,
    itemId: string,
    photoId: string,
    message: string,
    dataUrlOverride?: string,
  ) => {
    if (!audit) return;
    const dataUrl = dataUrlOverride || await fileToDataUrl(sourceFile);
    const entry: PendingPhotoUpload = {
      id: createId('pending-photo'),
      auditId: audit.id,
      sectionId,
      itemId,
      photoId,
      fileName: sourceFile.name || `${itemId}.jpg`,
      fileType: sourceFile.type || 'image/jpeg',
      dataUrl,
      createdAt: new Date().toISOString(),
      lastError: message,
    };
    const nextQueue = addPendingUpload(entry);
    setPendingUploads(nextQueue.filter((p) => p.auditId === audit.id));
    setPersistentPreview(photoId, dataUrl);
    setUploadErrors((prev) => ({ ...prev, [photoId]: message }));
  };

  const clearPendingForPhoto = (photoId: string) => {
    if (!audit) return;
    const nextQueue = removePendingUploadForPhoto(audit.id, photoId);
    setPendingUploads(nextQueue.filter((p) => p.auditId === audit.id));
    clearObjectPreview(photoId);
    setLocalPreviews((prev) => {
      const next = { ...prev };
      delete next[photoId];
      return next;
    });
    setUploadErrors((prev) => {
      const next = { ...prev };
      delete next[photoId];
      return next;
    });
  };

  const syncPendingUploads = async (filterPhotoId?: string) => {
    if (!audit || !isOnline) return;
    const queue = getPendingUploadsForAudit(audit.id).filter((entry) => !filterPhotoId || entry.photoId === filterPhotoId);
    if (queue.length === 0) return;

    setIsSyncingQueue(true);
    try {
      for (const entry of queue) {
        try {
          setUploadingPhotoId(entry.photoId);
          setUploadStage('uploading');
          setUploadProgress(0);
          const file = dataUrlToFile(entry.dataUrl, entry.fileName, entry.fileType);
          const uploaded = await uploadAuditPhotoWithMeta(audit.id, file, (progress) => setUploadProgress(progress));

          // Update the specific photo slot in item.photos[]
          setAudit((prev) => {
            if (!prev) return prev;
            const newSections = prev.sections.map((section) => {
              if (section.id !== entry.sectionId) return section;
              return {
                ...section,
                items: section.items.map((item) => {
                  if (item.id !== entry.itemId) return item;
                  return {
                    ...item,
                    photos: (item.photos || []).map((photo) =>
                      photo.id === entry.photoId
                        ? { ...photo, url: uploaded.downloadURL, path: uploaded.storagePath, pending: false, dataUrl: entry.dataUrl }
                        : photo,
                    ),
                  };
                }),
              };
            });
            const updated = { ...prev, sections: newSections, updatedAt: new Date().toISOString() };
            void saveAudit(updated);
            return updated;
          });

          const nextQueue = removePendingUpload(entry.id);
          setPendingUploads(nextQueue.filter((p) => p.auditId === audit.id));
          clearObjectPreview(entry.photoId);
          setLocalPreviews((prev) => {
            const next = { ...prev };
            delete next[entry.photoId];
            return next;
          });
          setUploadErrors((prev) => {
            const next = { ...prev };
            delete next[entry.photoId];
            return next;
          });
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : 'Photo upload stalled due to poor network. Please check connection and tap Retry.';
          updatePendingUploadError(entry.id, message);
          setUploadErrors((prev) => ({ ...prev, [entry.photoId]: message }));
        }
      }
    } finally {
      setIsSyncingQueue(false);
      setUploadStage('idle');
      setUploadingPhotoId(null);
      setUploadProgress(0);
    }
  };

  const handlePhotoClick = (sectionId: string, itemId: string) => {
    const photoId = createId('photo');
    setCurrentUploadTarget({ sectionId, itemId, photoId });
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUploadTarget || !audit) return;

    const target = currentUploadTarget;
    const { sectionId, itemId, photoId } = target;

    let previewDataUrl = '';

    // 1. Append the new photo slot immediately (pending=true) so the thumbnail appears
    setObjectPreview(photoId, file);
    setAudit((prev) => {
      if (!prev) return prev;
      const newSections = prev.sections.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          items: section.items.map((item) => {
            if (item.id !== itemId) return item;
            const newPhoto: ItemPhoto = { id: photoId, pending: true };
            return { ...item, photos: [...(item.photos || []), newPhoto] };
          }),
        };
      });
      return { ...prev, sections: newSections };
    });

    // 2. Start dataUrl conversion in background (for offline cache)
    try {
      previewDataUrl = await fileToDataUrl(file);
      setPersistentPreview(photoId, previewDataUrl);
      // Update photoDataUrl in the photo slot
      setAudit((prev) => {
        if (!prev) return prev;
        const newSections = prev.sections.map((section) => {
          if (section.id !== sectionId) return section;
          return {
            ...section,
            items: section.items.map((item) => {
              if (item.id !== itemId) return item;
              return {
                ...item,
                photos: (item.photos || []).map((photo) =>
                  photo.id === photoId ? { ...photo, dataUrl: previewDataUrl } : photo,
                ),
              };
            }),
          };
        });
        return { ...prev, sections: newSections };
      });
    } catch {
      // Continue without dataUrl in this slot
    }

    setUploadingPhotoId(photoId);
    setUploadProgress(0);
    setUploadStage('compressing');

    try {
      let uploadCandidate = file;
      try {
        uploadCandidate = await withTimeout(
          compressImageUnderSize(file, 3 * 1024 * 1024),
          'Image compression',
          12000
        );
      } catch (compressionError) {
        console.warn('⚠️ Compression failed, uploading original:', compressionError);
        uploadCandidate = file;
      }

      if (!isOnline) {
        await queuePendingPhoto(
          uploadCandidate, sectionId, itemId, photoId,
          'Photo upload stalled due to poor network. Please check connection and tap Retry.',
          previewDataUrl || undefined,
        );
        // Mark as pending in state
        setAudit((prev) => {
          if (!prev) return prev;
          const newSections = prev.sections.map((section) => {
            if (section.id !== sectionId) return section;
            return {
              ...section,
              items: section.items.map((item) => {
                if (item.id !== itemId) return item;
                return {
                  ...item,
                  photos: (item.photos || []).map((photo) =>
                    photo.id === photoId ? { ...photo, pending: true } : photo,
                  ),
                };
              }),
            };
          });
          const updated = { ...prev, sections: newSections, updatedAt: new Date().toISOString() };
          void saveAudit(updated);
          return updated;
        });
        return;
      }

      setUploadStage('uploading');

      const uploaded = await uploadAuditPhotoWithMeta(
        audit.id,
        uploadCandidate,
        (progress) => setUploadProgress(progress),
        { maxAttempts: 1, stallTimeoutMs: 15000 }
      );

      // Mark photo as uploaded
      setAudit((prev) => {
        if (!prev) return prev;
        const newSections = prev.sections.map((section) => {
          if (section.id !== sectionId) return section;
          return {
            ...section,
            items: section.items.map((item) => {
              if (item.id !== itemId) return item;
              return {
                ...item,
                photos: (item.photos || []).map((photo) =>
                  photo.id === photoId
                    ? { ...photo, url: uploaded.downloadURL, path: uploaded.storagePath, pending: false, dataUrl: previewDataUrl || photo.dataUrl }
                    : photo,
                ),
              };
            }),
          };
        });
        const updated = { ...prev, sections: newSections, updatedAt: new Date().toISOString() };
        void saveAudit(updated);
        return updated;
      });

      clearObjectPreview(photoId);
      setLocalPreviews((prev) => {
        const next = { ...prev };
        delete next[photoId];
        return next;
      });

      console.log('✅ Photo successfully uploaded:', uploaded.downloadURL);
    } catch (error) {
      console.error('❌ Photo upload failed:', error);
      const errorMsg = error instanceof Error
        ? error.message
        : 'Photo upload stalled due to poor network. Please check connection and tap Retry.';
      await queuePendingPhoto(file, sectionId, itemId, photoId, errorMsg, previewDataUrl || undefined);
    } finally {
      setUploadStage('idle');
      setUploadingPhotoId(null);
      setUploadProgress(0);
      setCurrentUploadTarget(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteItemPhoto = (sectionId: string, itemId: string, photoId: string) => {
    clearPendingForPhoto(photoId);
    setAudit((prev) => {
      if (!prev) return prev;
      const newSections = prev.sections.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          items: section.items.map((item) => {
            if (item.id !== itemId) return item;
            return { ...item, photos: (item.photos || []).filter((photo) => photo.id !== photoId) };
          }),
        };
      });
      const updated = { ...prev, sections: newSections, updatedAt: new Date().toISOString() };
      void saveAudit(updated);
      return updated;
    });
  };

  const updateSectionNotes = (sectionId: string, notes: string) => {
    if (!audit) return;
    
    const newSections = audit.sections.map(section => {
      if (section.id === sectionId) {
        return { ...section, notes };
      }
      return section;
    });

    const updatedAudit = { ...audit, sections: newSections, updatedAt: new Date().toISOString() };
    setAudit(updatedAudit);
    saveAudit(updatedAudit);
  };

  const isSectionComplete = (sectionId: string) => {
    const section = audit.sections.find(s => s.id === sectionId);
    return section?.items.every(item => item.status !== 'na') || false;
  };

  const totalItemCount = audit.sections.reduce((acc, s) => acc + s.items.length, 0);
  const answeredItemCount = audit.sections.reduce((acc, s) => acc + s.items.filter(i => i.status !== 'na').length, 0);
  const progress = totalItemCount > 0 ? Math.round((answeredItemCount / totalItemCount) * 100) : 0;

  const responseOptions = (audit.mainResponseOptions && audit.mainResponseOptions.length > 0)
    ? audit.mainResponseOptions
    : (['positive', 'negative', 'na'] as ComplianceStatus[]);

  // Register the current syncPendingUploads into the ref so the top-level effect can call it.
  syncPendingUploadsRef.current = () => { void syncPendingUploads(); };

  return (
    <Layout title="Inspection" showBack>
      <div className="space-y-6">
        {/* Hidden File Input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*"
          onChange={handleFileChange}
        />
        
        {/* Progress Bar */}
        <div className="sticky top-16 z-20 bg-slate-50 pt-2 pb-4 -mx-4 px-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">Audit Progress</span>
            <span className="text-sm font-bold text-slate-900">{progress}%</span>
          </div>
          <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-slate-900"
            />
          </div>
        </div>

        {(!isOnline || pendingUploads.length > 0) && (
          <div className={cn(
            'rounded-xl border p-3 flex flex-col gap-2',
            isOnline ? 'bg-amber-50 border-amber-200' : 'bg-slate-100 border-slate-300'
          )}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <WifiOff className="w-4 h-4" />
                {!isOnline ? 'Offline Mode: photos will sync when connection returns.' : `${pendingUploads.length} photo upload(s) pending sync.`}
              </div>
              <button
                type="button"
                onClick={() => void syncPendingUploads()}
                disabled={!isOnline || isSyncingQueue || pendingUploads.length === 0}
                className="btn btn-secondary gap-1 px-3 py-1 text-xs"
              >
                {isSyncingQueue ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Sync Now
              </button>
            </div>
            {pendingUploads.length > 0 && (
              <p className="text-xs text-slate-600">
                Photos may be pending upload due to network. They will be added to the Word report once synced.
              </p>
            )}
          </div>
        )}

        {/* Sections List */}
        <div className="space-y-4">
          {audit.sections.map((section) => (
            <div key={section.id} className="card">
              <button
                onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    isSectionComplete(section.id) ? "bg-green-500" : "bg-slate-300"
                  )} />
                  <span className="font-semibold">{section.title}</span>
                </div>
                {activeSection === section.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>

              <AnimatePresence>
                {activeSection === section.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t border-slate-100"
                  >
                    <div className="p-5 space-y-8">
                      {[...section.items]
                        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
                        .map((item) => {
                          const subsectionTitle = section.subsections?.find((sub) => sub.id === item.subsectionId)?.title;
                          // Collect all photos: new array + legacy single-photo fallback for backward compat
                          const allPhotos: ItemPhoto[] = item.photos && item.photos.length > 0
                            ? item.photos
                            : (item.photoUrl || item.photoDataUrl)
                              ? [{ id: `legacy-${item.id}`, url: item.photoUrl, dataUrl: item.photoDataUrl, path: item.photoPath }]
                              : [];
                          const hasAttachedPhoto = allPhotos.length > 0;
                          const isUploadingForThisItem = allPhotos.some((p) => p.id === uploadingPhotoId) || uploadingPhotoId?.startsWith('photo-') && currentUploadTarget?.itemId === item.id;
                          return (
                        <div key={item.id} className="space-y-4">
                          {subsectionTitle && (
                            <div className="inline-flex px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wide">
                              {subsectionTitle}
                            </div>
                          )}
                          {(() => {
                            const positiveOptions = item.positiveOptions && item.positiveOptions.length > 0
                              ? item.positiveOptions
                              : getPositiveResponseOptionsForItem(item.id);
                            const negativeOptions = item.negativeOptions && item.negativeOptions.length > 0
                              ? item.negativeOptions
                              : getNegativeResponseOptionsForItem(item.id);

                            return (
                              <>
                          <p className="text-slate-700 font-medium leading-relaxed">{item.question}</p>
                          
                          <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 shrink-0">Response</label>
                              <select 
                                className={cn(
                                  "input py-2 text-sm font-semibold",
                                  item.status === 'positive' && "text-green-600 bg-green-50 border-green-200",
                                  item.status === 'negative' && "text-red-600 bg-red-50 border-red-200",
                                  item.status === 'na' && "text-slate-600 bg-slate-100 border-slate-300"
                                )}
                                value={item.status}
                                onChange={(e) => {
                                  const nextStatus = e.target.value as ComplianceStatus;
                                  if (nextStatus === 'positive') {
                                    updateItem(section.id, item.id, {
                                      status: 'positive',
                                      positiveStatement: item.positiveStatement || positiveOptions[0],
                                      negativeFinding: undefined,
                                      observation: undefined,
                                    });
                                  } else if (nextStatus === 'negative') {
                                    const defaultNegative = item.negativeFinding || negativeOptions[0];
                                    updateItem(section.id, item.id, {
                                      status: 'negative',
                                      positiveStatement: undefined,
                                      negativeFinding: defaultNegative,
                                      observation: item.observation || item.comment || defaultNegative,
                                    });
                                  } else {
                                    updateItem(section.id, item.id, {
                                      status: 'na',
                                      positiveStatement: undefined,
                                      negativeFinding: undefined,
                                      observation: undefined,
                                    });
                                  }
                                }}
                              >
                                {responseOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option === 'na' ? 'Not Applicable' : option.charAt(0).toUpperCase() + option.slice(1)}
                                  </option>
                                ))}
                              </select>
                              {item.status === 'negative' && (
                                <div className="flex items-center gap-1 text-red-600 animate-pulse">
                                  <AlertTriangle className="w-4 h-4" />
                                  <span className="text-[10px] font-bold uppercase">Finding Created</span>
                                </div>
                              )}
                            </div>

                            <div className="min-h-[176px] rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                              {item.status === 'positive' ? (
                                <div className="space-y-2">
                                  <label className="text-xs font-bold uppercase tracking-wider text-green-700">Positive Statement</label>
                                  <select
                                    className="input py-2 text-sm text-green-700 bg-green-50 border-green-200"
                                    value={item.positiveStatement || positiveOptions[0]}
                                    onChange={(e) => updateItem(section.id, item.id, { positiveStatement: e.target.value })}
                                  >
                                    {positiveOptions.map((option) => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                  </select>
                                </div>
                              ) : item.status === 'negative' ? (
                                <div className="space-y-3">
                                  <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-red-700">Negative Finding</label>
                                    <select
                                      className="input py-2 text-sm text-red-700 bg-red-50 border-red-200"
                                      value={item.negativeFinding || negativeOptions[0]}
                                      onChange={(e) => updateItem(section.id, item.id, {
                                        negativeFinding: e.target.value,
                                        observation: item.observation?.trim() ? item.observation : e.target.value,
                                      })}
                                    >
                                      {negativeOptions.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-red-700">Observation</label>
                                    <textarea
                                      className="input min-h-[88px] resize-none text-sm border-red-200 bg-red-50/40"
                                      placeholder="Expand the finding details..."
                                      value={item.observation || ''}
                                      onChange={(e) => updateItem(section.id, item.id, { observation: e.target.value })}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="h-full min-h-[148px] rounded-lg border border-dashed border-slate-200 bg-white/70 flex items-center justify-center px-4 text-center">
                                  <p className="text-xs text-slate-400">Select a response to add finding details or a positive statement.</p>
                                </div>
                              )}
                            </div>

                            <div className="space-y-3">
                              <div className="relative">
                                <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                <textarea
                                  placeholder="Add comments..."
                                  className="input min-h-[88px] resize-none pl-10 py-2 text-sm"
                                  value={item.comment}
                                  required={Boolean(item.notesRequired && item.status !== 'na')}
                                  onChange={(e) => updateItem(section.id, item.id, { comment: e.target.value })}
                                />
                              </div>

                              {/* Multi-photo gallery strip */}
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* Thumbnail strip */}
                                  {allPhotos.map((photo, photoIdx) => {
                                    const src = photo.url || localPreviews[photo.id] || photo.dataUrl || '';
                                    const isUploading = photo.id === uploadingPhotoId;
                                    const isPending = photo.pending && !photo.url;
                                    const hasError = Boolean(uploadErrors[photo.id]);
                                    return (
                                      <div
                                        key={photo.id}
                                        className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 shadow-sm group bg-slate-50 flex items-center justify-center flex-shrink-0"
                                      >
                                        {src ? (
                                          <img
                                            src={src}
                                            alt={`Evidence ${photoIdx + 1}`}
                                            className="w-full h-full object-cover"
                                            referrerPolicy="no-referrer"
                                          />
                                        ) : (
                                          <div className="text-[9px] text-slate-400 text-center px-1">No preview</div>
                                        )}
                                        {isUploading && (
                                          <div className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center gap-0.5">
                                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                                            {uploadStage === 'uploading' && (
                                              <span className="text-[9px] text-white font-bold">{uploadProgress}%</span>
                                            )}
                                          </div>
                                        )}
                                        {isPending && !isUploading && (
                                          <div className="absolute inset-x-0 bottom-0 bg-amber-500/80 text-white text-[8px] font-bold text-center py-0.5">
                                            Pending
                                          </div>
                                        )}
                                        {hasError && !isUploading && (
                                          <div className="absolute inset-x-0 bottom-0 bg-red-500/80 text-white text-[8px] font-bold text-center py-0.5">
                                            Failed
                                          </div>
                                        )}
                                        {/* Hover overlay: expand + delete */}
                                        <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                          {src && (
                                            <button
                                              type="button"
                                              onClick={() => setLightboxState({ itemId: item.id, photos: allPhotos, photoIndex: photoIdx })}
                                              className="bg-white/90 text-slate-800 rounded p-1"
                                              title="View full size"
                                            >
                                              <ZoomIn className="w-3 h-3" />
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => deleteItemPhoto(section.id, item.id, photo.id)}
                                            className="bg-red-500 text-white rounded p-1"
                                            title="Remove photo"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Add photo button */}
                                  {item.photosAllowed !== false && (
                                    <button
                                      type="button"
                                      onClick={() => handlePhotoClick(section.id, item.id)}
                                      disabled={isUploadingForThisItem}
                                      className={cn(
                                        'w-16 h-16 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 flex-shrink-0 transition-colors',
                                        hasAttachedPhoto
                                          ? 'border-green-300 bg-green-50 text-green-600 hover:bg-green-100'
                                          : 'border-slate-300 bg-slate-50 text-slate-400 hover:bg-slate-100'
                                      )}
                                      title={isUploadingForThisItem ? 'Uploading...' : 'Add photo'}
                                    >
                                      {isUploadingForThisItem ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                      ) : (
                                        <>
                                          <ImagePlus className="w-4 h-4" />
                                          <span className="text-[9px] font-semibold leading-none">
                                            {hasAttachedPhoto ? 'Add more' : 'Add photo'}
                                          </span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>

                                {/* Upload progress bar */}
                                {isUploadingForThisItem && uploadStage === 'uploading' && (
                                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-slate-900 transition-all" style={{ width: `${uploadProgress}%` }} />
                                  </div>
                                )}

                                {/* Per-photo error messages */}
                                {allPhotos.some((p) => uploadErrors[p.id]) && (
                                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 flex items-center justify-between gap-2">
                                    <span>Photo upload stalled due to poor network. Please check connection and tap Retry.</span>
                                    <button
                                      type="button"
                                      className="btn btn-secondary px-2 py-1 text-[11px]"
                                      onClick={() => void syncPendingUploads()}
                                      disabled={!isOnline || isSyncingQueue}
                                    >
                                      Retry Upload
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          </>
                            );
                          })()}
                        </div>
                          );
                        })}

                      {/* Section Notes */}
                      <div className="pt-4 border-t border-slate-100">
                        <label className="label">Section Notes</label>
                        <textarea
                          className="input min-h-[80px] resize-none text-sm"
                          placeholder="General notes for this section..."
                          value={section.notes || ''}
                          onChange={(e) => updateSectionNotes(section.id, e.target.value)}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-4 pt-6 pb-12">
          <div className="flex gap-4">
            <button 
              onClick={() => navigate('/')}
              className="btn btn-secondary flex-1 gap-2"
            >
              <Save className="w-5 h-5" />
              Save Draft
            </button>
            <button 
              onClick={() => navigate(`/audit/${audit.id}/findings`)}
              className="btn btn-primary flex-1 gap-2"
            >
              Review Findings ({audit.findings?.length || 0})
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <button 
            onClick={() => navigate(`/audit/${audit.id}/summary`)}
            className="btn btn-secondary w-full gap-2 border-slate-300"
          >
            Go to Summary
          </button>
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxState && (() => {
          const { photos: lbPhotos, photoIndex } = lightboxState;
          const photo = lbPhotos[photoIndex];
          const src = photo?.url || localPreviews[photo?.id] || photo?.dataUrl || '';
          const hasPrev = photoIndex > 0;
          const hasNext = photoIndex < lbPhotos.length - 1;
          return (
            <motion.div
              key="lightbox"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4"
              onClick={() => setLightboxState(null)}
            >
              <div className="relative max-w-3xl w-full flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
                {/* Counter */}
                <div className="text-white text-sm font-semibold">
                  {photoIndex + 1} / {lbPhotos.length}
                </div>

                {/* Image */}
                <div className="w-full flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => hasPrev && setLightboxState((s) => s ? { ...s, photoIndex: s.photoIndex - 1 } : s)}
                    disabled={!hasPrev}
                    className="p-2 rounded-full bg-white/10 text-white disabled:opacity-30 hover:bg-white/20 transition-colors"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>

                  <div className="flex-1 flex items-center justify-center">
                    {src ? (
                      <img
                        src={src}
                        alt={`Evidence ${photoIndex + 1}`}
                        className="max-h-[70vh] max-w-full rounded-xl object-contain shadow-2xl"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="text-slate-400 text-sm">Image not available</div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => hasNext && setLightboxState((s) => s ? { ...s, photoIndex: s.photoIndex + 1 } : s)}
                    disabled={!hasNext}
                    className="p-2 rounded-full bg-white/10 text-white disabled:opacity-30 hover:bg-white/20 transition-colors"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  {src && photo?.url && (
                    <a
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="btn btn-secondary gap-2 text-white border-white/20 bg-white/10 hover:bg-white/20"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setLightboxState(null)}
                    className="btn btn-secondary gap-2 text-white border-white/20 bg-white/10 hover:bg-white/20"
                  >
                    <X className="w-4 h-4" />
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </Layout>
  );
}
