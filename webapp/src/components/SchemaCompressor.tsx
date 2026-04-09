import { useState, useCallback, useMemo } from 'react';
import {
  compress,
  estimateTokens,
} from '@tscg/core';
import type {
  AnyToolDefinition,
  CompressedResult,
  ModelTarget,
  CompilerOptions,
} from '@tscg/core';

// ============================================================
// Example tool schema for quick start
// ============================================================

const EXAMPLE_SCHEMA: AnyToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Use this tool to get the current weather conditions for a specified location. This tool is useful when you need to find weather data.',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA',
          },
          unit: {
            type: 'string',
            description: 'The temperature unit to use',
            enum: ['celsius', 'fahrenheit'],
          },
        },
        required: ['location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for current information. Use this tool when you need to find recent events, news, product information, or any current data that may have changed since your training cutoff.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to execute',
          },
          num_results: {
            type: 'number',
            description: 'The maximum number of results to return',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'This tool allows you to send an email message to a specified recipient with a subject and body.',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'The email address of the recipient',
          },
          subject: {
            type: 'string',
            description: 'The subject line of the email',
          },
          body: {
            type: 'string',
            description: 'The body content of the email message',
          },
          priority: {
            type: 'string',
            description: 'The priority level of the email',
            enum: ['low', 'normal', 'high'],
          },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
];

// ============================================================
// Model options
// ============================================================

interface ModelOption {
  label: string;
  value: ModelTarget;
}

const MODEL_OPTIONS: ModelOption[] = [
  { label: 'Claude (Anthropic)', value: 'claude-sonnet' },
  { label: 'GPT-4 (OpenAI)', value: 'gpt-4' },
  { label: 'GPT-5 (OpenAI)', value: 'gpt-5' },
  { label: 'Llama 3.1 (Meta)', value: 'llama-3.1' },
  { label: 'Llama 3.2 (Meta)', value: 'llama-3.2' },
  { label: 'Mistral 7B', value: 'mistral-7b' },
  { label: 'Mistral Large', value: 'mistral-large' },
  { label: 'Gemma 3 (Google)', value: 'gemma-3' },
  { label: 'Phi-4 (Microsoft)', value: 'phi-4' },
  { label: 'Qwen 3 (Alibaba)', value: 'qwen-3' },
  { label: 'DeepSeek V3', value: 'deepseek-v3' },
];

type ProfileOption = 'conservative' | 'balanced' | 'aggressive';

const PROFILE_OPTIONS: { label: string; value: ProfileOption; description: string }[] = [
  { label: 'Conservative', value: 'conservative', description: 'Safe compression, preserves all descriptions' },
  { label: 'Balanced', value: 'balanced', description: 'Best trade-off of savings vs. clarity (default)' },
  { label: 'Aggressive', value: 'aggressive', description: 'Maximum compression, all transforms enabled' },
];

// ============================================================
// Component
// ============================================================

export default function SchemaCompressor() {
  const [schemaInput, setSchemaInput] = useState('');
  const [model, setModel] = useState<ModelTarget>('claude-sonnet');
  const [profile, setProfile] = useState<ProfileOption>('balanced');
  const [result, setResult] = useState<CompressedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const parseSchema = useCallback((input: string): AnyToolDefinition[] | null => {
    if (!input.trim()) return null;
    try {
      const parsed = JSON.parse(input);

      // Handle: array of tools
      if (Array.isArray(parsed)) return parsed;

      // Handle: single tool
      if (parsed.type === 'function' && parsed.function) return [parsed];

      // Handle: Anthropic format
      if (parsed.name && parsed.input_schema) return [parsed];

      // Handle: { tools: [...] } wrapper
      if (parsed.tools && Array.isArray(parsed.tools)) return parsed.tools;

      return [parsed];
    } catch {
      return null;
    }
  }, []);

  const handleCompress = useCallback(() => {
    setError(null);
    setResult(null);

    const tools = parseSchema(schemaInput);
    if (!tools) {
      setError('Invalid JSON. Paste a tool schema in OpenAI or Anthropic format.');
      return;
    }

    try {
      const options: CompilerOptions = {
        model,
        profile,
      };
      const compressed = compress(tools, options);
      setResult(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compression failed');
    }
  }, [schemaInput, model, profile, parseSchema]);

  const handleLoadExample = useCallback(() => {
    const json = JSON.stringify(EXAMPLE_SCHEMA, null, 2);
    setSchemaInput(json);
    setError(null);
    setResult(null);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.compressed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = result.compressed;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result]);

  // Token counts for the input
  const inputTokens = useMemo(() => {
    if (!schemaInput.trim()) return 0;
    return estimateTokens(schemaInput, model);
  }, [schemaInput, model]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Controls Row */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {/* Model Selector */}
        <div className="card" style={{ flex: '1 1 200px' }}>
          <div style={{ padding: '12px 16px' }}>
            <div style={{
              marginBottom: '8px', fontSize: '13px', fontWeight: 600,
              color: 'var(--text-secondary)', textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
            }}>
              Target Model
            </div>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ModelTarget)}
              style={{
                width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)', borderRadius: '6px',
                color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer',
              }}
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Profile Selector */}
        <div className="card" style={{ flex: '1 1 280px' }}>
          <div style={{ padding: '12px 16px' }}>
            <div style={{
              marginBottom: '8px', fontSize: '13px', fontWeight: 600,
              color: 'var(--text-secondary)', textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
            }}>
              Compression Profile
            </div>
            <div className="profile-group">
              {PROFILE_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  className={`profile-btn ${p.value === profile ? 'active' : ''}`}
                  onClick={() => setProfile(p.value)}
                >
                  {p.label}
                  <span className="profile-tooltip">{p.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-Side: Input vs Output */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Left: Input */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Original Schema (JSON)</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="char-count">
                {inputTokens > 0 ? `~${inputTokens} tokens` : ''}
              </span>
              <button className="btn btn-sm btn-secondary" onClick={handleLoadExample}>
                Load Example
              </button>
            </div>
          </div>
          <div className="card-body">
            <textarea
              className="prompt-textarea"
              value={schemaInput}
              onChange={(e) => {
                setSchemaInput(e.target.value);
                setError(null);
                setResult(null);
              }}
              placeholder={`Paste a tool schema in OpenAI or Anthropic format...\n\nSupported formats:\n- OpenAI: [{ "type": "function", "function": { ... } }]\n- Anthropic: [{ "name": "...", "input_schema": { ... } }]\n- Single tool or array of tools\n\nClick "Load Example" to try with sample tools.`}
              spellCheck={false}
              style={{ minHeight: '320px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
            />
          </div>
        </div>

        {/* Right: Output */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Compressed Output</span>
            {result && (
              <button
                className={`btn btn-sm ${copied ? 'copy-feedback btn-success' : 'btn-secondary'}`}
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>
          <div className="card-body">
            {error && (
              <div style={{
                padding: '12px', background: 'rgba(248, 81, 73, 0.1)',
                border: '1px solid var(--error)', borderRadius: '6px',
                color: 'var(--error)', fontSize: '13px', marginBottom: '12px',
              }}>
                {error}
              </div>
            )}
            <div
              className={`output-block ${!result ? 'empty' : ''}`}
              style={{ minHeight: '320px', fontSize: '12px' }}
            >
              {result
                ? result.compressed
                : 'Compressed schema will appear here after compression.'}
            </div>
          </div>
        </div>
      </div>

      {/* Compress Button */}
      <button
        className="btn btn-primary"
        onClick={handleCompress}
        disabled={!schemaInput.trim()}
        style={{
          width: '100%', height: '44px', fontSize: '15px', fontWeight: 600,
          background: schemaInput.trim()
            ? 'linear-gradient(135deg, #2563eb, #7c3aed)'
            : 'var(--bg-tertiary)',
          border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer',
        }}
      >
        Compress Tool Schema
      </button>

      {/* Token Counter / Metrics */}
      {result && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Compression Metrics</span>
            <div className="badge-row">
              {result.appliedPrinciples.map((p) => (
                <span key={p} className="badge badge-blue">{p}</span>
              ))}
            </div>
          </div>
          <div className="card-body">
            <div className="metrics-grid">
              {/* Original Tokens */}
              <div className="metric-card">
                <div className="metric-label">Original Tokens</div>
                <div className="metric-value accent">
                  {result.metrics.tokens.original.toLocaleString()}
                </div>
                <div className="metric-sub">
                  {result.metrics.characters.original.toLocaleString()} chars
                </div>
              </div>

              {/* Compressed Tokens */}
              <div className="metric-card">
                <div className="metric-label">Compressed Tokens</div>
                <div className="metric-value success">
                  {result.metrics.tokens.compressed.toLocaleString()}
                </div>
                <div className="metric-sub">
                  {result.metrics.characters.compressed.toLocaleString()} chars
                </div>
              </div>

              {/* Savings */}
              <div className="metric-card">
                <div className="metric-label">Token Savings</div>
                <div className="metric-value success">
                  {result.metrics.tokens.savingsPercent.toFixed(1)}%
                </div>
                <div className="metric-sub">
                  {result.metrics.tokens.savings.toLocaleString()} tokens saved
                </div>
              </div>
            </div>

            {/* Compression Bar */}
            <div className="compression-bar-container" style={{ marginTop: '16px' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', marginBottom: '6px',
              }}>
                <span className="char-count" style={{ fontWeight: 600 }}>
                  Compression Ratio
                </span>
                <span className="char-count" style={{
                  fontWeight: 600,
                  color: result.metrics.tokens.savingsPercent > 30
                    ? 'var(--success)'
                    : result.metrics.tokens.savingsPercent > 10
                      ? 'var(--warning)'
                      : 'var(--error)',
                }}>
                  {(100 - result.metrics.tokens.savingsPercent).toFixed(1)}% of original
                </span>
              </div>
              <div className="compression-bar-track">
                <div
                  className={`compression-bar-fill ${
                    result.metrics.tokens.savingsPercent > 30 ? 'good'
                      : result.metrics.tokens.savingsPercent > 10 ? 'neutral'
                        : 'bad'
                  }`}
                  style={{ width: `${100 - result.metrics.tokens.savingsPercent}%` }}
                />
              </div>
            </div>

            {/* Per-Tool Breakdown */}
            {result.metrics.perTool.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
                  textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                  marginBottom: '8px',
                }}>
                  Per-Tool Breakdown
                </div>
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Tool</th>
                      <th>Original</th>
                      <th>Compressed</th>
                      <th>Savings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.metrics.perTool.map((t) => (
                      <tr key={t.name}>
                        <td>
                          <span className="profile-name">{t.name}</span>
                        </td>
                        <td>{t.originalTokens} tok</td>
                        <td>{t.compressedTokens} tok</td>
                        <td style={{
                          color: t.savingsPercent > 30
                            ? 'var(--success)'
                            : 'var(--warning)',
                          fontWeight: 600,
                        }}>
                          {t.savingsPercent.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Compression Time */}
            <div style={{
              marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)',
              textAlign: 'right',
            }}>
              Compressed in {result.metrics.compressionTimeMs.toFixed(1)}ms
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
