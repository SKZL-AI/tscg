import { useState, useCallback, useRef } from 'react';
import {
  optimizePrompt,
} from '@tscg/optimizer/optimizer.js';
import type {
  OptimizeResult,
  OptimizationProfile,
} from '@tscg/optimizer/optimizer.js';
import { toJSON, toMarkdown } from '@tscg/optimizer/report.js';
import PromptInput from './components/PromptInput';
import ProfileSelector from './components/ProfileSelector';
import OptimizedOutput from './components/OptimizedOutput';
import MetricsDashboard from './components/MetricsDashboard';
import TransformPipeline from './components/TransformPipeline';
import ProfileComparison from './components/ProfileComparison';
import ExportPanel from './components/ExportPanel';
import SchemaCompressor from './components/SchemaCompressor';

type AppTab = 'prompt' | 'schema';

const PROFILES: OptimizationProfile[] = [
  'minimal',
  'balanced',
  'max_compress',
  'max_accuracy',
  'full',
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('schema');
  const [prompt, setPrompt] = useState('');
  const [profile, setProfile] = useState<OptimizationProfile>('balanced');
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [comparisonResults, setComparisonResults] = useState<OptimizeResult[]>([]);
  const [provider, setProvider] = useState<string>('anthropic');
  const optimizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runOptimize = useCallback(
    (text: string, prof: OptimizationProfile, prov: string = 'anthropic') => {
      if (!text.trim()) {
        setResult(null);
        setComparisonResults([]);
        return;
      }
      try {
        const providerMap: Record<string, { provider: string; model: string }> = {
          anthropic: { provider: 'anthropic', model: 'claude-sonnet-4' },
          openai_gpt5: { provider: 'openai', model: 'gpt-5.2' },
          openai_gpt4o: { provider: 'openai', model: 'gpt-4o' },
          gemini: { provider: 'gemini', model: 'gemini-2.5-flash' },
        };
        const pm = providerMap[prov] || { provider: 'anthropic', model: 'claude-sonnet-4' };
        const res = optimizePrompt(text, { profile: prof, provider: pm.provider as any, model: pm.model } as any);
        setResult(res);

        // Run all profiles for comparison
        const allResults = PROFILES.map((p) =>
          optimizePrompt(text, { profile: p, provider: pm.provider as any, model: pm.model } as any)
        );
        setComparisonResults(allResults);
      } catch (err) {
        console.error('Optimization error:', err);
      }
    },
    []
  );

  const handlePromptChange = useCallback(
    (text: string) => {
      setPrompt(text);
      if (optimizeTimeoutRef.current) {
        clearTimeout(optimizeTimeoutRef.current);
      }
      optimizeTimeoutRef.current = setTimeout(() => {
        runOptimize(text, profile, provider);
      }, 150);
    },
    [profile, provider, runOptimize]
  );

  const handleProfileChange = useCallback(
    (newProfile: OptimizationProfile) => {
      setProfile(newProfile);
      if (prompt.trim()) {
        runOptimize(prompt, newProfile, provider);
      }
    },
    [prompt, provider, runOptimize]
  );

  const handleProviderChange = useCallback(
    (newProvider: string) => {
      setProvider(newProvider);
      if (prompt.trim()) {
        runOptimize(prompt, profile, newProvider);
      }
    },
    [prompt, profile, runOptimize]
  );

  const handleExportJSON = useCallback(() => {
    if (!result) return;
    const json = JSON.stringify(toJSON(result), null, 2);
    downloadFile(json, 'tscg-optimized.json', 'application/json');
  }, [result]);

  const handleExportMarkdown = useCallback(() => {
    if (!result) return;
    const md = toMarkdown(result);
    downloadFile(md, 'tscg-optimized.md', 'text/markdown');
  }, [result]);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-logo">&#9889;</span>
          <div>
            <div className="app-title">TSCG Optimizer</div>
            <div className="app-subtitle">
              Token-Context Semantic Grammar
            </div>
          </div>
        </div>
        <div className="app-header-right">
          {/* Tab Navigation */}
          <div className="app-tab-group">
            <button
              className={`app-tab-btn ${activeTab === 'schema' ? 'active' : ''}`}
              onClick={() => setActiveTab('schema')}
            >
              Tool Schema
            </button>
            <button
              className={`app-tab-btn ${activeTab === 'prompt' ? 'active' : ''}`}
              onClick={() => setActiveTab('prompt')}
            >
              Prompt
            </button>
          </div>
          <span className="app-version">v5.0.0</span>
        </div>
      </header>

      {/* Tab Content */}
      {activeTab === 'schema' ? (
        <main className="app-main" style={{ gridTemplateColumns: '1fr', overflow: 'auto' }}>
          <div className="panel" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <SchemaCompressor />
          </div>
        </main>
      ) : (
        <main className="app-main">
          {/* Left Panel: Input + Controls */}
          <div className="panel panel-left">
            <ProfileSelector
              profile={profile}
              onChange={handleProfileChange}
            />

            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: '12px 16px 0 16px' }}>
                Target Model
              </div>
              <div style={{ padding: '0 16px 12px 16px' }}>
                <select
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#21262d',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#e6edf3',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  <option value="anthropic">Claude (Anthropic)</option>
                  <option value="openai_gpt5">GPT-5.x (OpenAI)</option>
                  <option value="openai_gpt4o">GPT-4o (OpenAI)</option>
                  <option value="gemini">Gemini (Google)</option>
                </select>
                <div style={{ fontSize: '12px', color: '#6e7681', marginTop: '6px' }}>
                  CFL annotations auto-disabled for incompatible models
                </div>
              </div>
            </div>

            <PromptInput
              value={prompt}
              onChange={handlePromptChange}
            />
          </div>

          {/* Right Panel: Output + Metrics */}
          <div className="panel panel-right">
            {result ? (
              <>
                <OptimizedOutput result={result} />
                <MetricsDashboard result={result} />
                <TransformPipeline result={result} />
                <ProfileComparison
                  results={comparisonResults}
                  activeProfile={profile}
                />
                <ExportPanel
                  result={result}
                  onExportJSON={handleExportJSON}
                  onExportMarkdown={handleExportMarkdown}
                />
              </>
            ) : (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-state-icon">&#128196;</div>
                  <div className="empty-state-title">
                    Enter a prompt to optimize
                  </div>
                  <div className="empty-state-text">
                    Type or paste a natural language prompt on the left
                    panel, or try one of the example prompts. The optimizer
                    will transform it using TSCG principles in real-time.
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {/* Footer */}
      <footer className="app-footer">
        <span className="footer-text">
          TSCG &mdash; Token-Context Semantic Grammar &mdash; Local,
          deterministic prompt optimization
        </span>
        <span className="footer-text">
          No API calls &middot; All transforms run in your browser
        </span>
      </footer>
    </div>
  );
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
