import type { OptimizeResult } from '@tscg/optimizer/optimizer.js';

const TRANSFORM_DESCRIPTIONS: Record<string, string> = {
  SDM: 'Semantic Density Maximization -- strip filler words',
  DRO: 'Delimiter-Role Optimization -- key:value, |, arrows',
  CFL: 'Constraint-First Layout -- output format at position 0',
  CFO: 'Causal-Forward Ordering -- dependencies left to right',
  TAS: 'Tokenizer-Aligned Syntax -- BPE-optimal delimiters',
  'MC-COMPACT': 'Multiple Choice Compactor -- compact MC options',
  'CTX-WRAP': 'Context Wrapper -- <<CTX>> delimiters',
  CCP: 'Causal Closure Principle -- semantic closure block',
  CAS: 'Causal Access Score -- position critical info early',
  'SAD-F': 'Selective Anchor Duplication -- fragility-weighted',
};

interface TransformPipelineProps {
  result: OptimizeResult;
}

export default function TransformPipeline({ result }: TransformPipelineProps) {
  const { pipeline } = result;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Transform Pipeline</span>
        <span className="char-count">
          {pipeline.transforms.filter((t) => t.applied).length} applied /{' '}
          {pipeline.transforms.length} total
        </span>
      </div>
      <div className="card-body" style={{ padding: '8px 8px' }}>
        <div className="pipeline-list">
          {pipeline.transforms.map((t, i) => {
            const tokenStr =
              t.tokensRemoved > 0
                ? `-${t.tokensRemoved}`
                : t.tokensRemoved < 0
                  ? `+${Math.abs(t.tokensRemoved)}`
                  : '\u00B10';

            const tokenClass =
              t.tokensRemoved > 0
                ? 'removed'
                : t.tokensRemoved < 0
                  ? 'added'
                  : 'neutral';

            return (
              <div
                key={t.name + i}
                className={`pipeline-item ${t.applied ? 'applied' : 'skipped'}`}
              >
                <div
                  className={`pipeline-icon ${t.applied ? 'applied' : 'skipped'}`}
                >
                  {t.applied ? '\u2713' : '\u2013'}
                </div>
                <span className="pipeline-name">{t.name}</span>
                <span className={`pipeline-tokens ${tokenClass}`}>
                  {tokenStr} tok
                </span>
                <span className="pipeline-desc" title={t.description}>
                  {t.description || TRANSFORM_DESCRIPTIONS[t.name] || ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
