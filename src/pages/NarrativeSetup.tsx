import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAudits } from '../AuditContext';
import { Audit } from '../types';
import { DEFAULT_NARRATIVE } from '../constants';
import { BookOpen, Target, FlaskConical, Scale, AlertCircle, MessageSquare, ChevronRight, ChevronLeft, Save } from 'lucide-react';
import { cn } from '../lib/utils';

type TabKey = 'introduction' | 'scope' | 'methodology' | 'legislation' | 'disclaimer' | 'conclusion';

interface Tab {
  key: TabKey;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  placeholder: string;
  hint: string;
}

const TABS: Tab[] = [
  {
    key: 'introduction',
    label: 'Introduction',
    shortLabel: 'Intro',
    icon: <BookOpen className="w-4 h-4" />,
    placeholder: DEFAULT_NARRATIVE.introduction,
    hint: 'Describe the purpose and context of this audit.',
  },
  {
    key: 'scope',
    label: 'Scope',
    shortLabel: 'Scope',
    icon: <Target className="w-4 h-4" />,
    placeholder: DEFAULT_NARRATIVE.scope,
    hint: 'Define what areas and topics this audit covers.',
  },
  {
    key: 'methodology',
    label: 'Methodology',
    shortLabel: 'Method',
    icon: <FlaskConical className="w-4 h-4" />,
    placeholder: DEFAULT_NARRATIVE.methodology,
    hint: 'Explain how the audit was conducted.',
  },
  {
    key: 'legislation',
    label: 'Applicable UK Legislation',
    shortLabel: 'Legislation',
    icon: <Scale className="w-4 h-4" />,
    placeholder: DEFAULT_NARRATIVE.legislation,
    hint: 'List the relevant UK legislation considered for this assessment.',
  },
  {
    key: 'disclaimer',
    label: 'Disclaimer',
    shortLabel: 'Disclaimer',
    icon: <AlertCircle className="w-4 h-4" />,
    placeholder: DEFAULT_NARRATIVE.disclaimer,
    hint: 'State limitations of the inspection and liability disclaimer.',
  },
  {
    key: 'conclusion',
    label: 'Conclusion',
    shortLabel: 'Conclusion',
    icon: <MessageSquare className="w-4 h-4" />,
    placeholder: DEFAULT_NARRATIVE.conclusion,
    hint: 'Provide an overall summary and closing statement.',
  },
];

export default function NarrativeSetup() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getAudit, saveAudit } = useAudits();

  const [audit, setAudit] = useState<Audit | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('introduction');
  const [fields, setFields] = useState<Record<TabKey, string>>({
    introduction: '',
    scope: '',
    methodology: '',
    legislation: '',
    disclaimer: '',
    conclusion: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      const found = getAudit(id);
      if (found) {
        setAudit(found);
        setFields({
          introduction: found.introduction ?? DEFAULT_NARRATIVE.introduction,
          scope: found.scope ?? DEFAULT_NARRATIVE.scope,
          methodology: found.methodology ?? DEFAULT_NARRATIVE.methodology,
          legislation: found.legislation ?? DEFAULT_NARRATIVE.legislation,
          disclaimer: found.disclaimer ?? DEFAULT_NARRATIVE.disclaimer,
          conclusion: found.conclusion ?? DEFAULT_NARRATIVE.conclusion,
        });
      } else {
        navigate('/');
      }
    }
  }, [id, getAudit, navigate]);

  if (!audit) return null;

  const currentTabIndex = TABS.findIndex(t => t.key === activeTab);
  const isFirst = currentTabIndex === 0;
  const isLast = currentTabIndex === TABS.length - 1;
  const currentTab = TABS[currentTabIndex];

  const handleSaveAndProceed = async () => {
    setSaving(true);
    const updated: Audit = {
      ...audit,
      ...fields,
      updatedAt: new Date().toISOString(),
    };
    await saveAudit(updated);
    setSaving(false);
    navigate(`/audit/${audit.id}/checklist`);
  };

  const handleSaveAndClose = async () => {
    setSaving(true);
    const updated: Audit = {
      ...audit,
      ...fields,
      updatedAt: new Date().toISOString(),
    };
    await saveAudit(updated);
    setSaving(false);
    navigate(`/audit/${audit.id}`);
  };

  const goNext = () => {
    if (!isLast) {
      setActiveTab(TABS[currentTabIndex + 1].key);
    }
  };

  const goPrev = () => {
    if (!isFirst) {
      setActiveTab(TABS[currentTabIndex - 1].key);
    }
  };

  return (
    <Layout title="Report Narrative" showBack>
      <div className="space-y-6">
        {/* Header */}
        <div className="card p-5">
          <h2 className="text-lg font-bold text-slate-900">{audit.clientName} — {audit.siteName}</h2>
          <p className="text-sm text-slate-500 mt-1">
            Complete the report narrative sections below. Default text is provided — edit as required.
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
          {TABS.map((tab, i) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0',
                activeTab === tab.key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : i < currentTabIndex
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'
              )}
            >
              {tab.icon}
              {tab.shortLabel}
            </button>
          ))}
        </div>

        {/* Active tab content */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
              {currentTab.icon}
            </div>
            <div>
              <h3 className="font-bold text-slate-900">{currentTab.label}</h3>
              <p className="text-xs text-slate-500">{currentTab.hint}</p>
            </div>
          </div>

          <textarea
            className="input min-h-[220px] text-sm leading-relaxed"
            value={fields[activeTab]}
            onChange={(e) => setFields(prev => ({ ...prev, [activeTab]: e.target.value }))}
            placeholder={currentTab.placeholder}
          />

          <button
            type="button"
            onClick={() => setFields(prev => ({ ...prev, [activeTab]: currentTab.placeholder }))}
            className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
          >
            Reset to default text
          </button>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={isFirst}
            className={cn('btn btn-secondary flex items-center gap-2', isFirst && 'opacity-40 cursor-not-allowed')}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <div className="flex items-center gap-2">
            {!isLast ? (
              <button type="button" onClick={goNext} className="btn btn-secondary flex items-center gap-2">
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSaveAndClose}
                  disabled={saving}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save &amp; Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndProceed}
                  disabled={saving}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {saving ? 'Saving…' : 'Save & Start Checklist'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Skip option on first tab */}
        {isFirst && (
          <div className="text-center">
            <button
              type="button"
              onClick={handleSaveAndProceed}
              className="text-sm text-slate-400 hover:text-slate-600 underline underline-offset-2"
            >
              Skip narrative and go straight to checklist
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
