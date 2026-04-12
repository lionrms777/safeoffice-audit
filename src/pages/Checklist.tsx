import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAudits } from '../AuditContext';
import { Audit, ComplianceStatus, Finding, Action, ChecklistItem } from '../types';
import { X, Camera, MessageSquare, ChevronDown, ChevronUp, Save, Loader2, AlertTriangle, ChevronRight, Download, ExternalLink, WifiOff, RefreshCw } from 'lucide-react';
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
  const { getAudit, saveAudit } = useAudits();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<'idle' | 'compressing' | 'uploading'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingPhotoUpload[]>([]);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncPendingUploadsRef = useRef<(() => void) | null>(null);
  const [currentUploadTarget, setCurrentUploadTarget] = useState<{ sectionId: string, itemId: string } | null>(null);

  useEffect(() => {
    if (id) {
      const found = getAudit(id);
      if (found) {
        setAudit(found);
        if (found.sections && found.sections.length > 0) {
          setActiveSection(found.sections[0].id);
        }
      } else {
        navigate('/');
      }
    }
  }, [id, getAudit, navigate]);

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
      previews[entry.itemId] = entry.dataUrl;
    });
    setLocalPreviews(previews);
  }, [audit?.id]);

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
    message: string,
  ) => {
    if (!audit) return;
    const dataUrl = await fileToDataUrl(sourceFile);
    const entry: PendingPhotoUpload = {
      id: createId('pending-photo'),
      auditId: audit.id,
      sectionId,
      itemId,
      fileName: sourceFile.name || `${itemId}.jpg`,
      fileType: sourceFile.type || 'image/jpeg',
      dataUrl,
      createdAt: new Date().toISOString(),
      lastError: message,
    };
    const nextQueue = addPendingUpload(entry);
    setPendingUploads(nextQueue.filter((p) => p.auditId === audit.id));
    setLocalPreviews((prev) => ({ ...prev, [itemId]: dataUrl }));
    setUploadErrors((prev) => ({ ...prev, [itemId]: message }));
  };

  const clearPendingForItem = (itemId: string) => {
    if (!audit) return;
    const nextQueue = removePendingUploadsForItem(audit.id, itemId);
    setPendingUploads(nextQueue.filter((p) => p.auditId === audit.id));
    setLocalPreviews((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setUploadErrors((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const syncPendingUploads = async (itemId?: string) => {
    if (!audit || !isOnline) return;
    const queue = getPendingUploadsForAudit(audit.id).filter((entry) => !itemId || entry.itemId === itemId);
    if (queue.length === 0) return;

    setIsSyncingQueue(true);
    try {
      for (const entry of queue) {
        try {
          setUploadingItem(entry.itemId);
          setUploadStage('uploading');
          setUploadProgress(0);
          const file = dataUrlToFile(entry.dataUrl, entry.fileName, entry.fileType);
          const uploaded = await uploadAuditPhotoWithMeta(audit.id, file, (progress) => setUploadProgress(progress));
          updateItem(entry.sectionId, entry.itemId, {
            photoUrl: uploaded.downloadURL,
            photoPath: uploaded.storagePath,
            photoDataUrl: entry.dataUrl,
          });
          const nextQueue = removePendingUpload(entry.id);
          setPendingUploads(nextQueue.filter((p) => p.auditId === audit.id));
          setLocalPreviews((prev) => {
            const next = { ...prev };
            delete next[entry.itemId];
            return next;
          });
          setUploadErrors((prev) => {
            const next = { ...prev };
            delete next[entry.itemId];
            return next;
          });
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : 'Photo upload stalled due to poor network. Please check connection and tap Retry.';
          updatePendingUploadError(entry.id, message);
          setUploadErrors((prev) => ({ ...prev, [entry.itemId]: message }));
        }
      }
    } finally {
      setIsSyncingQueue(false);
      setUploadStage('idle');
      setUploadingItem(null);
      setUploadProgress(0);
    }
  };

  const handlePhotoClick = (sectionId: string, itemId: string) => {
    setCurrentUploadTarget({ sectionId, itemId });
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUploadTarget || !audit) return;

    const target = currentUploadTarget;
    let previewDataUrl = '';

    // Show thumbnail immediately, even if upload is pending.
    try {
      previewDataUrl = await fileToDataUrl(file);
      setLocalPreviews((prev) => ({ ...prev, [target.itemId]: previewDataUrl }));
      updateItem(target.sectionId, target.itemId, { photoDataUrl: previewDataUrl });
    } catch {
      // Ignore preview conversion failures.
    }

    setUploadingItem(target.itemId);
    setUploadProgress(0);
    setUploadStage('compressing');
    try {
      // Compress for field networks (target <= 3MB).
      let uploadCandidate = file;
      try {
        uploadCandidate = await withTimeout(
          compressImageUnderSize(file, 3 * 1024 * 1024),
          'Image compression',
          12000
        );
      } catch (compressionError) {
        console.warn('⚠️ Compression failed, uploading original image:', compressionError);
        uploadCandidate = file;
      }

      if (!isOnline) {
        await queuePendingPhoto(
          uploadCandidate,
          target.sectionId,
          target.itemId,
          'Photo upload stalled due to poor network. Please check connection and tap Retry.',
        );
        return;
      }

      setUploadStage('uploading');

      const uploaded = await uploadAuditPhotoWithMeta(audit.id, uploadCandidate, (progress) => setUploadProgress(progress));

      updateItem(target.sectionId, target.itemId, {
        photoUrl: uploaded.downloadURL,
        photoPath: uploaded.storagePath,
        photoDataUrl: previewDataUrl || undefined,
      });
      clearPendingForItem(target.itemId);
      console.log('✅ Photo successfully uploaded:', uploaded.downloadURL);
    } catch (error) {
      console.error('❌ Photo upload failed:', error);
      const errorMsg = error instanceof Error
        ? error.message
        : 'Photo upload stalled due to poor network. Please check connection and tap Retry.';
      await queuePendingPhoto(file, target.sectionId, target.itemId, errorMsg);
      alert('Photo upload stalled due to poor network. Please check connection and tap Retry.');
    } finally {
      setUploadStage('idle');
      setUploadingItem(null);
      setUploadProgress(0);
      setCurrentUploadTarget(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

                            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_96px] gap-3 items-start">
                              <div className="space-y-3 min-w-0">
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

                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => handlePhotoClick(section.id, item.id)}
                                    disabled={uploadingItem === item.id || item.photosAllowed === false}
                                    className={cn(
                                      "btn p-2 aspect-square",
                                      item.photoUrl ? "bg-green-50 text-green-600 border-green-200" : "btn-secondary"
                                    )}
                                    title={item.photosAllowed === false ? 'Photo upload disabled for this item' : (uploadingItem === item.id ? (uploadStage === 'compressing' ? 'Compressing image...' : 'Uploading image...') : 'Upload photo')}
                                  >
                                    {uploadingItem === item.id ? (
                                      <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                      <Camera className="w-5 h-5" />
                                    )}
                                  </button>
                                  <span className="text-xs text-slate-500">
                                    {item.photosAllowed === false ? 'Photo disabled for this item' : (item.photoUrl || localPreviews[item.id]) ? 'Photo attached' : 'Add evidence photo'}
                                  </span>
                                </div>

                                <div className="min-h-[44px]">
                                  {uploadingItem === item.id && (
                                    <div className="space-y-1">
                                      <p className="text-xs text-slate-500">
                                        {uploadStage === 'compressing' ? 'Preparing photo...' : `Uploading photo... ${uploadProgress}%`}
                                      </p>
                                      {uploadStage === 'uploading' && (
                                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                          <div className="h-full bg-slate-900" style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {uploadErrors[item.id] && (
                                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 flex items-center justify-between gap-2">
                                      <span>Photo upload stalled due to poor network. Please check connection and tap Retry.</span>
                                      <button
                                        type="button"
                                        className="btn btn-secondary px-2 py-1 text-[11px]"
                                        onClick={() => void syncPendingUploads(item.id)}
                                        disabled={!isOnline || isSyncingQueue}
                                      >
                                        Retry Upload
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="w-24 h-24 rounded-xl overflow-hidden border border-slate-200 shadow-sm group bg-slate-50 flex items-center justify-center relative">
                                {(item.photoUrl || localPreviews[item.id]) ? (
                                  <>
                                    <img 
                                      src={item.photoUrl || localPreviews[item.id]} 
                                      alt="Evidence" 
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                    {item.photoUrl && (
                                      <div className="absolute bottom-1 left-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                          onClick={() => {
                                            if (!item.photoUrl) return;
                                            window.open(item.photoUrl, '_blank', 'noopener,noreferrer');
                                          }}
                                          className="flex-1 bg-white/90 text-slate-700 p-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1"
                                          title="View photo"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                          View
                                        </button>
                                        <a
                                          href={item.photoUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          download
                                          className="flex-1 bg-white/90 text-slate-700 p-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1"
                                          title="Download photo"
                                        >
                                          <Download className="w-3 h-3" />
                                          Save
                                        </a>
                                      </div>
                                    )}
                                    {localPreviews[item.id] && !item.photoUrl && (
                                      <div className="absolute inset-x-0 bottom-0 bg-slate-900/70 text-white text-[10px] font-bold text-center py-0.5">
                                        Pending Sync
                                      </div>
                                    )}
                                    <button 
                                      onClick={() => {
                                        updateItem(section.id, item.id, { photoUrl: '', photoPath: '', photoDataUrl: '' });
                                        clearPendingForItem(item.id);
                                      }}
                                      className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </>
                                ) : (
                                  <div className="text-[11px] font-medium text-slate-400 text-center px-2">No photo</div>
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
    </Layout>
  );
}
