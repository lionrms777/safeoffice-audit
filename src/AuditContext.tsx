import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import localforage from 'localforage';
import { Audit, AuditStats } from './types';
import { saveAuditToFirebase, getUserAuditsFromFirebase, deleteAuditFromFirebase } from './lib/firebaseDb';
import { useAuth } from './contexts/AuthContext';
import { deletePhotosSafely, getAllAuditAttachmentUrls, getChecklistPhotoUrls } from './lib/firebaseStorage';

interface AuditContextType {
  audits: Audit[];
  stats: AuditStats;
  loading: boolean;
  saveAudit: (audit: Audit) => Promise<void>;
  deleteAudit: (id: string) => Promise<void>;
  resetDraftAudit: (id: string) => Promise<boolean>;
  getAudit: (id: string) => Audit | undefined;
}

const AuditContext = createContext<AuditContextType | undefined>(undefined);

export function AuditProvider({ children }: { children: ReactNode }) {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const cacheKey = user ? `audits:${user.uid}` : 'audits:guest';

  useEffect(() => {
    const loadAudits = async () => {
      setLoading(true);
      try {
        // 1. Try to load from Firebase if user is logged in
        if (user) {
          console.log('🔄 Fetching audits from Firebase for:', user.email);
          const firebaseAudits = await getUserAuditsFromFirebase(user.uid);
          setAudits(firebaseAudits);
          // Sync to local storage
          await localforage.setItem(cacheKey, firebaseAudits);
        } else {
          // 2. Fallback to local storage
          const savedAudits = await localforage.getItem<Audit[]>(cacheKey);
          if (savedAudits) {
            setAudits(savedAudits);
          } else {
            setAudits([]);
          }
        }
      } catch (error) {
        console.error('❌ Error loading audits:', error);
        // Fallback to local storage on error
        const savedAudits = await localforage.getItem<Audit[]>(cacheKey);
        if (savedAudits) {
          setAudits(savedAudits);
        } else {
          setAudits([]);
        }
      } finally {
        setLoading(false);
      }
    };
    loadAudits();
  }, [user, cacheKey]);

  const saveAudit = useCallback(async (audit: Audit) => {
    let nextAudits: Audit[] = [];

    setAudits((prevAudits) => {
      const index = prevAudits.findIndex((a) => a.id === audit.id);
      if (index >= 0) {
        nextAudits = prevAudits.map((existing, i) => (i === index ? audit : existing));
      } else {
        nextAudits = [...prevAudits, audit];
      }
      return nextAudits;
    });

    // Save to local storage first for offline support
    await localforage.setItem(cacheKey, nextAudits);

    // Save to Firebase if logged in
    if (user) {
      try {
        await saveAuditToFirebase(audit);
      } catch (error) {
        console.error('⚠️ Failed to sync with Firebase, saved locally:', error);
      }
    }
  }, [cacheKey, user]);

  const deleteAudit = useCallback(async (id: string) => {
    const auditToDelete = audits.find((a) => a.id === id);
    let nextAudits: Audit[] = [];

    setAudits((prevAudits) => {
      nextAudits = prevAudits.filter((a) => a.id !== id);
      return nextAudits;
    });

    await localforage.setItem(cacheKey, nextAudits);

    if (auditToDelete) {
      // Best-effort attachment cleanup to avoid storage orphan files.
      await deletePhotosSafely(getAllAuditAttachmentUrls(auditToDelete));
    }

    if (user) {
      try {
        await deleteAuditFromFirebase(id);
      } catch (error) {
        console.error('⚠️ Failed to delete from Firebase:', error);
      }
    }
  }, [audits, cacheKey, user]);

  const resetDraftAudit = useCallback(async (id: string) => {
    const audit = audits.find((a) => a.id === id);
    if (!audit || audit.status !== 'draft') return false;

    const oldChecklistPhotos = getChecklistPhotoUrls(audit);

    const resetSections = audit.sections.map((section) => ({
      ...section,
      notes: '',
      items: section.items.map((item) => ({
        ...item,
        status: 'na' as const,
        comment: '',
        positiveStatement: undefined,
        negativeFinding: undefined,
        observation: undefined,
        photoUrl: undefined,
        photoPath: undefined,
      })),
    }));

    const resetAudit: Audit = {
      ...audit,
      sections: resetSections,
      findings: [],
      actions: [],
      updatedAt: new Date().toISOString(),
    };

    await saveAudit(resetAudit);

    // Best-effort checklist photo cleanup when draft reset is confirmed.
    await deletePhotosSafely(oldChecklistPhotos);
    return true;
  }, [audits, saveAudit]);

  const getAudit = useCallback((id: string) => audits.find((a) => a.id === id), [audits]);

  const stats: AuditStats = useMemo(() => ({
    completed: audits.filter((a) => a.status === 'completed').length,
    drafts: audits.filter((a) => a.status === 'draft').length,
    totalNonCompliant: audits.reduce((acc, audit) => {
      return acc + audit.sections.reduce((sAcc, section) => {
        return sAcc + section.items.filter(i => i.status === 'negative').length;
      }, 0);
    }, 0),
    totalFindings: audits.reduce((acc, audit) => acc + (audit.findings?.length || 0), 0),
    highRiskActions: audits.reduce((acc, audit) => {
      return acc + (audit.actions || []).filter(
        a => a.priority === 'High' || a.priority === 'Urgent' || a.priority === 'Critical'
      ).length;
    }, 0),
  }), [audits]);

  const value = useMemo(
    () => ({ audits, stats, loading, saveAudit, deleteAudit, resetDraftAudit, getAudit }),
    [audits, stats, loading, saveAudit, deleteAudit, resetDraftAudit, getAudit]
  );

  return (
    <AuditContext.Provider value={value}>
      {children}
    </AuditContext.Provider>
  );
}

export function useAudits() {
  const context = useContext(AuditContext);
  if (!context) {
    throw new Error('useAudits must be used within an AuditProvider');
  }
  return context;
}

