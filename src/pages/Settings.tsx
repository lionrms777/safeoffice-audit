import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  AuditTemplate,
  ChecklistItem,
  ComplianceStatus,
  TemplateSection,
  TemplateSubsection,
} from '../types';
import {
  createDefaultTemplate,
  getActiveTemplateFromFirebase,
  saveActiveTemplateToFirebase,
} from '../lib/templateManager';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { Plus, Save, ArrowUp, ArrowDown, Trash2, GripVertical } from 'lucide-react';

type SettingsTab =
  | 'template'
  | 'sections'
  | 'subsections'
  | 'items'
  | 'response-options'
  | 'positive-options'
  | 'negative-options'
  | 'risk-matrix'
  | 'report-defaults';

const TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: 'template', label: 'Audit Template Settings' },
  { key: 'sections', label: 'Sections' },
  { key: 'subsections', label: 'Subsections' },
  { key: 'items', label: 'Checklist Items' },
  { key: 'response-options', label: 'Response Options' },
  { key: 'positive-options', label: 'Positive Answer Options' },
  { key: 'negative-options', label: 'Negative Answer Options' },
  { key: 'risk-matrix', label: 'Risk Matrix Settings' },
  { key: 'report-defaults', label: 'Report Text Defaults' },
];

const RESPONSE_VALUES: ComplianceStatus[] = ['positive', 'negative', 'na'];

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const moveInArray = <T,>(arr: T[], from: number, to: number): T[] => {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

const normalizeOrder = <T extends { displayOrder?: number }>(arr: T[]): T[] =>
  arr.map((item, i) => ({ ...item, displayOrder: i + 1 }));

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('template');
  const [template, setTemplate] = useState<AuditTemplate | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteIntent, setDeleteIntent] = useState<{ type: 'section' | 'subsection' | 'item'; id: string; sectionId?: string } | null>(null);
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const current = await getActiveTemplateFromFirebase();
        setTemplate(current);
        if (current.sections[0]) setSelectedSectionId(current.sections[0].id);
        const firstItem = current.sections[0]?.items[0];
        if (firstItem) setSelectedItemId(firstItem.id);
      } catch (error) {
        console.warn('⚠️ Failed to load template, using defaults:', error);
        const fallback = createDefaultTemplate();
        setTemplate(fallback);
        if (fallback.sections[0]) setSelectedSectionId(fallback.sections[0].id);
        const firstItem = fallback.sections[0]?.items[0];
        if (firstItem) setSelectedItemId(firstItem.id);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const selectedSection = useMemo(() => {
    if (!template) return undefined;
    return template.sections.find((s) => s.id === selectedSectionId) || template.sections[0];
  }, [template, selectedSectionId]);

  const selectedItem = useMemo(() => {
    if (!selectedSection) return undefined;
    return selectedSection.items.find((item) => item.id === selectedItemId) || selectedSection.items[0];
  }, [selectedSection, selectedItemId]);

  const updateTemplate = (updater: (prev: AuditTemplate) => AuditTemplate) => {
    setTemplate((prev) => (prev ? updater(prev) : prev));
  };

  const updateSection = (sectionId: string, updater: (section: TemplateSection) => TemplateSection) => {
    updateTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((section) => (section.id === sectionId ? updater(section) : section)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const saveTemplate = async () => {
    if (!template) return;
    setSaving(true);
    try {
      const saved = await saveActiveTemplateToFirebase(template, user?.uid);
      setTemplate(saved);
      alert('Template settings saved successfully.');
    } catch (error) {
      console.error('❌ Failed to save template settings:', error);
      alert('Failed to save template settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const addSection = () => {
    updateTemplate((prev) => {
      const sectionId = createId('section');
      const nextSection: TemplateSection = {
        id: sectionId,
        title: 'New Section',
        active: true,
        displayOrder: prev.sections.length + 1,
        notes: '',
        subsections: [],
        items: [],
      };
      const sections = [...prev.sections, nextSection];
      setSelectedSectionId(sectionId);
      return { ...prev, sections, updatedAt: new Date().toISOString() };
    });
  };

  const addSubsection = () => {
    if (!selectedSection) return;
    updateSection(selectedSection.id, (section) => {
      const next: TemplateSubsection = {
        id: createId('sub'),
        title: 'New Subsection',
        active: true,
        displayOrder: section.subsections.length + 1,
      };
      return { ...section, subsections: [...section.subsections, next] };
    });
  };

  const addChecklistItem = () => {
    if (!selectedSection) return;

    updateSection(selectedSection.id, (section) => {
      const itemId = createId('item');
      const item: ChecklistItem = {
        id: itemId,
        question: 'New checklist question',
        status: 'na',
        comment: '',
        answerType: 'default',
        active: true,
        displayOrder: section.items.length + 1,
        notesRequired: false,
        photosAllowed: true,
        negativeCreatesFinding: true,
        positiveOptions: ['Satisfactory condition'],
        negativeOptions: ['Unsafe condition identified'],
        defaultLikelihood: 3,
        defaultSeverity: 3,
      };
      setSelectedItemId(itemId);
      return { ...section, items: [...section.items, item] };
    });
  };

  const updateSelectedItem = (updater: (item: ChecklistItem) => ChecklistItem) => {
    if (!selectedSection || !selectedItem) return;

    updateSection(selectedSection.id, (section) => ({
      ...section,
      items: section.items.map((item) => (item.id === selectedItem.id ? updater(item) : item)),
    }));
  };

  const moveSection = (from: number, to: number) => {
    if (!template || to < 0 || to >= template.sections.length) return;
    updateTemplate((prev) => ({
      ...prev,
      sections: normalizeOrder(moveInArray(prev.sections, from, to)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const moveSubsection = (from: number, to: number) => {
    if (!selectedSection || to < 0 || to >= selectedSection.subsections.length) return;
    updateSection(selectedSection.id, (section) => ({
      ...section,
      subsections: normalizeOrder(moveInArray(section.subsections, from, to)),
    }));
  };

  const moveItem = (from: number, to: number) => {
    if (!selectedSection || to < 0 || to >= selectedSection.items.length) return;
    updateSection(selectedSection.id, (section) => ({
      ...section,
      items: normalizeOrder(moveInArray(section.items, from, to)),
    }));
  };

  const addOptionValue = (kind: 'positive' | 'negative') => {
    updateSelectedItem((item) => {
      const key = kind === 'positive' ? 'positiveOptions' : 'negativeOptions';
      const nextOptions = [...(item[key] || []), kind === 'positive' ? 'New positive option' : 'New negative option'];
      return { ...item, [key]: nextOptions };
    });
  };

  const updateOptionValue = (kind: 'positive' | 'negative', index: number, value: string) => {
    updateSelectedItem((item) => {
      const key = kind === 'positive' ? 'positiveOptions' : 'negativeOptions';
      const nextOptions = [...(item[key] || [])];
      nextOptions[index] = value;
      return { ...item, [key]: nextOptions };
    });
  };

  const removeOptionValue = (kind: 'positive' | 'negative', index: number) => {
    updateSelectedItem((item) => {
      const key = kind === 'positive' ? 'positiveOptions' : 'negativeOptions';
      const nextOptions = [...(item[key] || [])];
      nextOptions.splice(index, 1);
      return { ...item, [key]: nextOptions };
    });
  };

  if (loading || !template) {
    return (
      <Layout title="Settings" showBack>
        <div className="card p-6 text-sm text-slate-600">Loading template settings...</div>
      </Layout>
    );
  }

  return (
    <Layout title="Settings" showBack>
      <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-5">
        <aside className="card p-3 h-fit">
          <div className="space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  activeTab === tab.key
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </aside>

        <section className="card p-5 space-y-4">
          {activeTab === 'template' && (
            <>
              <h2 className="text-lg font-bold">Audit Template Settings</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Template Name</label>
                  <input className="input" value={template.name} onChange={(e) => updateTemplate((prev) => ({ ...prev, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Version</label>
                  <input className="input bg-slate-100" value={template.version} readOnly />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input min-h-[110px]" value={template.description || ''} onChange={(e) => updateTemplate((prev) => ({ ...prev, description: e.target.value }))} />
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={template.active} onChange={(e) => updateTemplate((prev) => ({ ...prev, active: e.target.checked }))} />
                Template active
              </label>
            </>
          )}

          {activeTab === 'sections' && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Sections</h2>
                <button className="btn btn-secondary gap-2" onClick={addSection}><Plus className="w-4 h-4" /> Add Section</button>
              </div>
              <div className="space-y-2">
                {template.sections.map((section, idx) => (
                  <div
                    key={section.id}
                    draggable
                    onDragStart={() => setDragFromIdx(idx)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                    onDrop={() => {
                      if (dragFromIdx !== null && dragFromIdx !== idx) moveSection(dragFromIdx, idx);
                      setDragFromIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => { setDragFromIdx(null); setDragOverIdx(null); }}
                    className={cn(
                      'border rounded-xl p-3 space-y-2 transition-all',
                      dragFromIdx === idx ? 'opacity-40 border-slate-400' : 'border-slate-200',
                      dragOverIdx === idx && dragFromIdx !== idx ? 'border-blue-400 bg-blue-50' : 'bg-white',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="cursor-grab active:cursor-grabbing text-slate-400 shrink-0" title="Drag to reorder">
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <input className="input" value={section.title} onChange={(e) => updateSection(section.id, (prev) => ({ ...prev, title: e.target.value }))} />
                      <button className="btn btn-secondary p-2" onClick={() => moveSection(idx, idx - 1)} disabled={idx === 0}><ArrowUp className="w-4 h-4" /></button>
                      <button className="btn btn-secondary p-2" onClick={() => moveSection(idx, idx + 1)} disabled={idx === template.sections.length - 1}><ArrowDown className="w-4 h-4" /></button>
                      <button className="btn btn-secondary p-2 text-red-600" onClick={() => setDeleteIntent({ type: 'section', id: section.id })}><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={section.active} onChange={(e) => updateSection(section.id, (prev) => ({ ...prev, active: e.target.checked }))} />
                      Active
                    </label>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'subsections' && selectedSection && (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Subsections</h2>
                <button className="btn btn-secondary gap-2" onClick={addSubsection}><Plus className="w-4 h-4" /> Add Subsection</button>
              </div>
              <select className="input" value={selectedSection.id} onChange={(e) => setSelectedSectionId(e.target.value)}>
                {template.sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
              </select>
              <div className="space-y-3">
                {selectedSection.subsections.map((sub, idx) => (
                  <div key={sub.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input className="input" value={sub.title} onChange={(e) => updateSection(selectedSection.id, (section) => ({ ...section, subsections: section.subsections.map((s) => s.id === sub.id ? { ...s, title: e.target.value } : s) }))} />
                      <button className="btn btn-secondary p-2" onClick={() => moveSubsection(idx, idx - 1)} disabled={idx === 0}><ArrowUp className="w-4 h-4" /></button>
                      <button className="btn btn-secondary p-2" onClick={() => moveSubsection(idx, idx + 1)} disabled={idx === selectedSection.subsections.length - 1}><ArrowDown className="w-4 h-4" /></button>
                      <button className="btn btn-secondary p-2 text-red-600" onClick={() => setDeleteIntent({ type: 'subsection', id: sub.id, sectionId: selectedSection.id })}><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={sub.active} onChange={(e) => updateSection(selectedSection.id, (section) => ({ ...section, subsections: section.subsections.map((s) => s.id === sub.id ? { ...s, active: e.target.checked } : s) }))} />
                      Active
                    </label>
                  </div>
                ))}
                {selectedSection.subsections.length === 0 && <p className="text-sm text-slate-500">No subsections configured.</p>}
              </div>
            </>
          )}

          {(activeTab === 'items' || activeTab === 'positive-options' || activeTab === 'negative-options') && selectedSection && (
            <>
              <h2 className="text-lg font-bold">
                {activeTab === 'items' ? 'Checklist Items' : activeTab === 'positive-options' ? 'Positive Answer Options' : 'Negative Answer Options'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select className="input" value={selectedSection.id} onChange={(e) => setSelectedSectionId(e.target.value)}>
                  {template.sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
                </select>
                <select className="input" value={selectedItem?.id || ''} onChange={(e) => setSelectedItemId(e.target.value)}>
                  {selectedSection.items.map((item) => <option key={item.id} value={item.id}>{item.question.slice(0, 80)}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-secondary gap-2" onClick={addChecklistItem}><Plus className="w-4 h-4" /> Add Item</button>
              </div>

              {selectedItem ? (
                <div className="space-y-3 border border-slate-200 rounded-xl p-4">
                  {activeTab === 'items' && (
                    <>
                      <label className="label">Question</label>
                      <textarea className="input min-h-[90px]" value={selectedItem.question} onChange={(e) => updateSelectedItem((item) => ({ ...item, question: e.target.value }))} />

                      <label className="label">Finding Title (when marked negative)</label>
                      <input className="input" placeholder="e.g. Fire exit obstruction identified" value={selectedItem.negativeFinding || ''} onChange={(e) => updateSelectedItem((item) => ({ ...item, negativeFinding: e.target.value || undefined }))} />

                      <label className="label">Guidance / Help Text</label>
                      <textarea className="input min-h-[70px]" value={selectedItem.helpText || ''} onChange={(e) => updateSelectedItem((item) => ({ ...item, helpText: e.target.value }))} />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="label">Subsection (Optional)</label>
                          <select className="input" value={selectedItem.subsectionId || ''} onChange={(e) => updateSelectedItem((item) => ({ ...item, subsectionId: e.target.value || undefined }))}>
                            <option value="">No subsection</option>
                            {selectedSection.subsections.map((sub) => (
                              <option key={sub.id} value={sub.id}>{sub.title}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label">Display Order</label>
                          <div className="flex gap-2">
                            <input className="input" type="number" min={1} value={selectedItem.displayOrder || 1} onChange={(e) => updateSelectedItem((item) => ({ ...item, displayOrder: Number(e.target.value) || 1 }))} />
                            <button className="btn btn-secondary p-2" onClick={() => {
                              const idx = selectedSection.items.findIndex((i) => i.id === selectedItem.id);
                              moveItem(idx, idx - 1);
                            }}><ArrowUp className="w-4 h-4" /></button>
                            <button className="btn btn-secondary p-2" onClick={() => {
                              const idx = selectedSection.items.findIndex((i) => i.id === selectedItem.id);
                              moveItem(idx, idx + 1);
                            }}><ArrowDown className="w-4 h-4" /></button>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={selectedItem.active !== false} onChange={(e) => updateSelectedItem((item) => ({ ...item, active: e.target.checked }))} /> Active</label>
                        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={selectedItem.notesRequired || false} onChange={(e) => updateSelectedItem((item) => ({ ...item, notesRequired: e.target.checked }))} /> Notes Required</label>
                        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={selectedItem.photosAllowed !== false} onChange={(e) => updateSelectedItem((item) => ({ ...item, photosAllowed: e.target.checked }))} /> Photos Allowed</label>
                        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={selectedItem.negativeCreatesFinding !== false} onChange={(e) => updateSelectedItem((item) => ({ ...item, negativeCreatesFinding: e.target.checked }))} /> Negative Creates Finding</label>
                      </div>

                      <div>
                        <label className="label">Default Recommended Action (Optional)</label>
                        <textarea className="input min-h-[70px]" value={selectedItem.defaultRecommendedAction || ''} onChange={(e) => updateSelectedItem((item) => ({ ...item, defaultRecommendedAction: e.target.value }))} />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">Default Likelihood</label>
                          <input className="input" type="number" min={1} max={5} value={selectedItem.defaultLikelihood || 3} onChange={(e) => updateSelectedItem((item) => ({ ...item, defaultLikelihood: Number(e.target.value) || 3 }))} />
                        </div>
                        <div>
                          <label className="label">Default Severity</label>
                          <input className="input" type="number" min={1} max={5} value={selectedItem.defaultSeverity || 3} onChange={(e) => updateSelectedItem((item) => ({ ...item, defaultSeverity: Number(e.target.value) || 3 }))} />
                        </div>
                      </div>

                      <button className="btn btn-secondary text-red-600" onClick={() => setDeleteIntent({ type: 'item', id: selectedItem.id, sectionId: selectedSection.id })}>
                        Delete Item
                      </button>
                    </>
                  )}

                  {activeTab === 'positive-options' && (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">Positive dropdown options</h3>
                        <button className="btn btn-secondary gap-2" onClick={() => addOptionValue('positive')}><Plus className="w-4 h-4" /> Add Option</button>
                      </div>
                      <div className="space-y-2">
                        {(selectedItem.positiveOptions || []).map((value, idx) => (
                          <div key={`${selectedItem.id}-pos-${idx}`} className="flex gap-2">
                            <input className="input" value={value} onChange={(e) => updateOptionValue('positive', idx, e.target.value)} />
                            <button className="btn btn-secondary p-2 text-red-600" onClick={() => removeOptionValue('positive', idx)}><Trash2 className="w-4 h-4" /></button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {activeTab === 'negative-options' && (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">Negative dropdown options</h3>
                        <button className="btn btn-secondary gap-2" onClick={() => addOptionValue('negative')}><Plus className="w-4 h-4" /> Add Option</button>
                      </div>
                      <div className="space-y-2">
                        {(selectedItem.negativeOptions || []).map((value, idx) => (
                          <div key={`${selectedItem.id}-neg-${idx}`} className="flex gap-2">
                            <input className="input" value={value} onChange={(e) => updateOptionValue('negative', idx, e.target.value)} />
                            <button className="btn btn-secondary p-2 text-red-600" onClick={() => removeOptionValue('negative', idx)}><Trash2 className="w-4 h-4" /></button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No checklist item selected.</p>
              )}
            </>
          )}

          {activeTab === 'response-options' && (
            <>
              <h2 className="text-lg font-bold">Response Options</h2>
              <p className="text-sm text-slate-500">Configure the primary response dropdown values used across the checklist.</p>
              <div className="space-y-2">
                {RESPONSE_VALUES.map((value) => (
                  <label key={value} className="inline-flex items-center gap-2 text-sm mr-6">
                    <input
                      type="checkbox"
                      checked={template.mainResponseOptions.includes(value)}
                      onChange={(e) => updateTemplate((prev) => ({
                        ...prev,
                        mainResponseOptions: e.target.checked
                          ? [...new Set([...prev.mainResponseOptions, value])]
                          : prev.mainResponseOptions.filter((v) => v !== value),
                      }))}
                    />
                    {value === 'na' ? 'Not Applicable' : value.charAt(0).toUpperCase() + value.slice(1)}
                  </label>
                ))}
              </div>
            </>
          )}

          {activeTab === 'risk-matrix' && (
            <>
              <h2 className="text-lg font-bold">Risk Matrix Settings</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Likelihood Labels</h3>
                  <div className="space-y-2">
                    {template.riskSettings.likelihood.map((row, idx) => (
                      <input
                        key={`likelihood-${row.value}`}
                        className="input"
                        value={row.label}
                        onChange={(e) => updateTemplate((prev) => {
                          const next = [...prev.riskSettings.likelihood];
                          next[idx] = { ...next[idx], label: e.target.value };
                          return { ...prev, riskSettings: { ...prev.riskSettings, likelihood: next } };
                        })}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Severity Labels</h3>
                  <div className="space-y-2">
                    {template.riskSettings.severity.map((row, idx) => (
                      <input
                        key={`severity-${row.value}`}
                        className="input"
                        value={row.label}
                        onChange={(e) => updateTemplate((prev) => {
                          const next = [...prev.riskSettings.severity];
                          next[idx] = { ...next[idx], label: e.target.value };
                          return { ...prev, riskSettings: { ...prev.riskSettings, severity: next } };
                        })}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Risk Bands and Priority Mapping</h3>
                  <div className="space-y-2">
                    {template.riskSettings.bands.map((band, idx) => (
                      <div key={band.band} className="grid grid-cols-1 md:grid-cols-[140px,1fr,1fr,160px] gap-2">
                        <input className="input bg-slate-100" readOnly value={band.band} />
                        <input
                          className="input"
                          type="number"
                          value={band.min}
                          onChange={(e) => updateTemplate((prev) => {
                            const nextBands = [...prev.riskSettings.bands];
                            nextBands[idx] = { ...nextBands[idx], min: Number(e.target.value) || 1 };
                            return { ...prev, riskSettings: { ...prev.riskSettings, bands: nextBands } };
                          })}
                        />
                        <input
                          className="input"
                          type="number"
                          value={band.max}
                          onChange={(e) => updateTemplate((prev) => {
                            const nextBands = [...prev.riskSettings.bands];
                            nextBands[idx] = { ...nextBands[idx], max: Number(e.target.value) || 1 };
                            return { ...prev, riskSettings: { ...prev.riskSettings, bands: nextBands } };
                          })}
                        />
                        <select
                          className="input"
                          value={template.riskSettings.priorityMapping.find((p) => p.band === band.band)?.priority || 'Low'}
                          onChange={(e) => updateTemplate((prev) => ({
                            ...prev,
                            riskSettings: {
                              ...prev.riskSettings,
                              priorityMapping: prev.riskSettings.priorityMapping.map((p) =>
                                p.band === band.band ? { ...p, priority: e.target.value as 'Low' | 'Medium' | 'High' | 'Urgent' } : p,
                              ),
                            },
                          }))}
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Urgent">Urgent</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'report-defaults' && (
            <>
              <h2 className="text-lg font-bold">Report Text Defaults</h2>
              <div className="space-y-3">
                {Object.entries(template.reportDefaults).map(([key, value]) => (
                  <div key={key}>
                    <label className="label capitalize">{key}</label>
                    <textarea
                      className="input min-h-[100px]"
                      value={value}
                      onChange={(e) => updateTemplate((prev) => ({
                        ...prev,
                        reportDefaults: { ...prev.reportDefaults, [key]: e.target.value },
                      }))}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button className="btn btn-primary gap-2" onClick={saveTemplate} disabled={saving}>
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Template Settings'}
            </button>
          </div>
        </section>
      </div>

      <ConfirmDialog
        isOpen={Boolean(deleteIntent)}
        title="Confirm Deletion"
        message="This change will remove the selected template entity. Continue?"
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setDeleteIntent(null)}
        onConfirm={() => {
          if (!deleteIntent || !template) return;

          if (deleteIntent.type === 'section') {
            updateTemplate((prev) => ({
              ...prev,
              sections: normalizeOrder(prev.sections.filter((s) => s.id !== deleteIntent.id)),
            }));
          }

          if (deleteIntent.type === 'subsection' && deleteIntent.sectionId) {
            updateSection(deleteIntent.sectionId, (section) => ({
              ...section,
              subsections: normalizeOrder(section.subsections.filter((sub) => sub.id !== deleteIntent.id)),
              items: section.items.map((item) => item.subsectionId === deleteIntent.id ? { ...item, subsectionId: undefined } : item),
            }));
          }

          if (deleteIntent.type === 'item' && deleteIntent.sectionId) {
            updateSection(deleteIntent.sectionId, (section) => ({
              ...section,
              items: normalizeOrder(section.items.filter((item) => item.id !== deleteIntent.id)),
            }));
          }

          setDeleteIntent(null);
        }}
      />
    </Layout>
  );
}
