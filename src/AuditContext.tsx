import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import localforage from 'localforage';
import { Audit, AuditStats } from './types';
import { saveAuditToFirebase, deleteAuditFromFirebase, subscribeToUserAudits } from './lib/firebaseDb';
import { useAuth } from './contexts/AuthContext';
import { deletePhotosSafely, getAllAuditAttachmentUrls, getChecklistPhotoUrls, resolvePhotoDownloadUrl } from './lib/firebaseStorage';

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

  const hydrateMissingPhotoUrls = useCallback(async (sourceAudits: Audit[]) => {
    const resolvedUrlCache = new Map<string, string>();
    let changedAny = false;

    const resolvePath = async (path?: string): Promise<string | undefined> => {
      const key = (path || '').trim();
      if (!key) return undefined;
      const cached = resolvedUrlCache.get(key);
      if (cached) return cached;
      const resolved = await resolvePhotoDownloadUrl(key);
      if (resolved) resolvedUrlCache.set(key, resolved);
      return resolved || undefined;
    };

    const hydratedAudits = await Promise.all(sourceAudits.map(async (audit) => {
      let changed = false;
      let nextAudit: Audit = audit;

      if (!audit.siteLogoUrl && audit.siteLogoPath) {
        const url = await resolvePath(audit.siteLogoPath);
        if (url) {
          nextAudit = { ...nextAudit, siteLogoUrl: url };
          changed = true;
        }
      }

      if (!nextAudit.siteBuildingPhotoUrl && nextAudit.siteBuildingPhotoPath) {
        const url = await resolvePath(nextAudit.siteBuildingPhotoPath);
        if (url) {
          nextAudit = { ...nextAudit, siteBuildingPhotoUrl: url };
          changed = true;
        }
      }

      const nextSections = await Promise.all(nextAudit.sections.map(async (section) => {
        let sectionChanged = false;

        const nextItems = await Promise.all(section.items.map(async (item) => {
          let itemChanged = false;
          let nextItem = item;

          if (!nextItem.photoUrl && nextItem.photoPath) {
            const url = await resolvePath(nextItem.photoPath);
            if (url) {
              nextItem = { ...nextItem, photoUrl: url };
              itemChanged = true;
            }
          }

          if (nextItem.photos && nextItem.photos.length > 0) {
            const nextPhotos = await Promise.all(nextItem.photos.map(async (photo) => {
              if (photo.url || !photo.path) return photo;
              const url = await resolvePath(photo.path);
              if (!url) return photo;
              itemChanged = true;
              return { ...photo, url };
            }));

            if (itemChanged) {
              nextItem = { ...nextItem, photos: nextPhotos };
            }
          }

          if (itemChanged) {
            sectionChanged = true;
            return nextItem;
          }

          return item;
        }));

        if (!sectionChanged) return section;
        changed = true;
        return { ...section, items: nextItems };
      }));

      if (!changed) return audit;
      changedAny = true;
      return { ...nextAudit, sections: nextSections, updatedAt: nextAudit.updatedAt || new Date().toISOString() };
    }));

    if (!changedAny) return;

    setAudits(hydratedAudits);
    await localforage.setItem(cacheKey, hydratedAudits);

    if (user) {
      await Promise.all(
        hydratedAudits.map(async (audit) => {
          try {
            await saveAuditToFirebase({ ...audit, userId: audit.userId || user.uid });
          } catch (error) {
            console.warn('⚠️ Failed to backfill resolved photo URLs to Firebase:', audit.id, error);
          }
        })
      );
    }
  }, [cacheKey, user]);

  useEffect(() => {
    let mounted = true;
    let unsub: (() => void) | null = null;

    const loadAndSubscribe = async () => {
      setLoading(true);
      try {
        const cachedAudits = (await localforage.getItem<Audit[]>(cacheKey)) || [];
        if (mounted && cachedAudits.length > 0) {
          setAudits(cachedAudits);
          void hydrateMissingPhotoUrls(cachedAudits);
        }

        if (!user) {
          if (mounted && cachedAudits.length === 0) {
            setAudits([]);
          }
          if (mounted) setLoading(false);
          return;
        }

        // Real-time cross-device sync source of truth.
        unsub = subscribeToUserAudits(
          user.uid,
          async (liveAudits, meta) => {
            const normalizedLiveAudits = liveAudits.map((audit) => ({ ...audit, userId: audit.userId || user.uid }));

            const shouldKeepCachedWhileResolving =
              meta.fromCache &&
              normalizedLiveAudits.length === 0 &&
              cachedAudits.length > 0;

            if (shouldKeepCachedWhileResolving) {
              // Avoid a false empty-state flash on refresh while Firestore resolves from server.
              if (mounted) setLoading(false);
              return;
            }

            if (mounted) {
              setAudits(normalizedLiveAudits);
            }

            await localforage.setItem(cacheKey, normalizedLiveAudits);
            void hydrateMissingPhotoUrls(normalizedLiveAudits);

            // One-time safety migration: if cloud is empty but local cache has audits, backfill userId-tagged docs.
            if (normalizedLiveAudits.length === 0 && cachedAudits.length > 0) {
              await Promise.all(
                cachedAudits.map(async (audit) => {
                  try {
                    await saveAuditToFirebase({ ...audit, userId: audit.userId || user.uid });
                  } catch (error) {
                    console.warn('⚠️ Failed to backfill cached audit to Firebase:', audit.id, error);
                  }
                })
              );
            }

            if (mounted && !meta.fromCache) {
              setLoading(false);
            }
            if (mounted && meta.fromCache) {
              // Cached snapshot still means data is ready to render while network catches up.
              setLoading(false);
            }
          },
          async (error) => {
            console.error('❌ Falling back to cached audits after subscription error:', error);
            const fallback = (await localforage.getItem<Audit[]>(cacheKey)) || [];
            if (mounted) {
              setAudits(fallback);
              setLoading(false);
            }
          },
        );
      } catch (error) {
        console.error('❌ Error loading audits:', error);
        const fallback = (await localforage.getItem<Audit[]>(cacheKey)) || [];
        if (mounted) {
          setAudits(fallback);
          setLoading(false);
        }
      }
    };

    void loadAndSubscribe();

    return () => {
      mounted = false;
      if (unsub) unsub();
    };
  }, [user, cacheKey, hydrateMissingPhotoUrls]);

  const saveAudit = useCallback(async (audit: Audit) => {
    const normalizedAudit = user ? { ...audit, userId: audit.userId || user.uid } : audit;
    let nextAudits: Audit[] = [];

    setAudits((prevAudits) => {
      const index = prevAudits.findIndex((a) => a.id === normalizedAudit.id);
      if (index >= 0) {
        nextAudits = prevAudits.map((existing, i) => (i === index ? normalizedAudit : existing));
      } else {
        nextAudits = [...prevAudits, normalizedAudit];
      }
      return nextAudits;
    });

    // Save to local storage first for offline support
    await localforage.setItem(cacheKey, nextAudits);

    // Save to Firebase if logged in
    if (user) {
      try {
        await saveAuditToFirebase(normalizedAudit);
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
        photoDataUrl: undefined,
        photos: [],
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

