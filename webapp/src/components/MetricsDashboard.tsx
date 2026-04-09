import type { OptimizeResult } from '@tscg/optimizer/optimizer.js';

interface MetricsDashboardProps {
  result: OptimizeResult;
}

export default function MetricsDashboard({ result }: MetricsDashboardProps) {
  const { metrics } = result;
  const ratio = metrics.compressionRatio;
  const ratioPercent = (ratio * 100).toFixed(1);
  const savingsPercent = ((1 - ratio) * 100).toFixed(1);
  const barWidth = Math.min(Math.max(ratio * 100, 5), 100);

  const barClass =
    ratio <= 0.85
      ? 'good'
      : ratio <= 1.0
        ? 'neutral'
        : 'bad';

  const tokenSavedClass =
    metrics.tokensSaved > 0 ? 'success' : 'warning';

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Metrics</span>
        <div className="badge-row">
          <span className="badge badge-blue">{metrics.promptType}</span>
          <span className="badge badge-purple">{metrics.outputFormat}</span>
        </div>
      </div>
      <div className="card-body">
        <div className="metrics-grid">
          {/* Token Count */}
          <div className="metric-card">
            <div className="metric-label">Tokens</div>
            <div className="metric-value accent">
              {metrics.originalTokensEst}{' '}
              <span className="metric-arrow">&rarr;</span>{' '}
              {metrics.optimizedTokensEst}
            </div>
            <div className="metric-sub">estimated (chars/4)</div>
          </div>

          {/* Tokens Saved */}
          <div className="metric-card">
            <div className="metric-label">Tokens Saved</div>
            <div className={`metric-value ${tokenSavedClass}`}>
              {metrics.tokensSaved > 0
                ? `${metrics.tokensSaved}`
                : metrics.tokensRemoved < 0
                  ? `+${Math.abs(metrics.tokensRemoved)}`
                  : '0'}
            </div>
            <div className="metric-sub">
              {metrics.tokensSaved > 0
                ? `${savingsPercent}% reduction`
                : 'accuracy overhead'}
            </div>
          </div>

          {/* Transforms */}
          <div className="metric-card">
            <div className="metric-label">Transforms</div>
            <div className="metric-value accent">
              {metrics.transformsApplied}
              <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                {' '}
                / {metrics.transformsApplied + metrics.transformsSkipped}
              </span>
            </div>
            <div className="metric-sub">
              {metrics.transformsApplied} applied, {metrics.transformsSkipped}{' '}
              skipped
            </div>
          </div>
        </div>

        {/* Compression Bar */}
        <div
          className="compression-bar-container"
          style={{ marginTop: '16px' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <span
              className="char-count"
              style={{ fontWeight: 600 }}
            >
              Compression Ratio
            </span>
            <span
              className="char-count"
              style={{
                fontWeight: 600,
                color:
                  ratio <= 0.85
                    ? 'var(--success)'
                    : ratio <= 1.0
                      ? 'var(--warning)'
                      : 'var(--error)',
              }}
            >
              {ratioPercent}%
            </span>
          </div>
          <div className="compression-bar-track">
            <div
              className={`compression-bar-fill ${barClass}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
