import type { OptimizeResult, OptimizationProfile } from '@tscg/optimizer/optimizer.js';

interface ProfileComparisonProps {
  results: OptimizeResult[];
  activeProfile: OptimizationProfile;
}

export default function ProfileComparison({
  results,
  activeProfile,
}: ProfileComparisonProps) {
  if (results.length === 0) return null;

  // Find the profile with best (lowest) compression ratio
  let bestIdx = 0;
  let bestRatio = Infinity;
  for (let i = 0; i < results.length; i++) {
    if (results[i].metrics.compressionRatio < bestRatio) {
      bestRatio = results[i].metrics.compressionRatio;
      bestIdx = i;
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Profile Comparison</span>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Profile</th>
              <th>Tokens</th>
              <th>Ratio</th>
              <th>Transforms</th>
              <th>Saved</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const m = r.metrics;
              const isActive = r.profile === activeProfile;
              const isBest = i === bestIdx;

              return (
                <tr
                  key={r.profile}
                  className={isBest ? 'highlight' : ''}
                  style={
                    isActive
                      ? { background: 'var(--accent-dim)' }
                      : undefined
                  }
                >
                  <td>
                    <span className="profile-name">{r.profile}</span>
                    {isActive && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          color: 'var(--accent)',
                        }}
                      >
                        (active)
                      </span>
                    )}
                    {isBest && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          color: 'var(--success)',
                        }}
                      >
                        (best)
                      </span>
                    )}
                  </td>
                  <td>
                    {m.originalTokensEst} &rarr; {m.optimizedTokensEst}
                  </td>
                  <td
                    style={{
                      color:
                        m.compressionRatio <= 0.85
                          ? 'var(--success)'
                          : m.compressionRatio <= 1.0
                            ? 'var(--warning)'
                            : 'var(--error)',
                    }}
                  >
                    {(m.compressionRatio * 100).toFixed(1)}%
                  </td>
                  <td>
                    {m.transformsApplied} / {m.transformsApplied + m.transformsSkipped}
                  </td>
                  <td
                    style={{
                      color:
                        m.tokensSaved > 0
                          ? 'var(--success)'
                          : 'var(--warning)',
                      fontWeight: 600,
                    }}
                  >
                    {m.tokensSaved > 0
                      ? `-${m.tokensSaved}`
                      : m.tokensRemoved < 0
                        ? `+${Math.abs(m.tokensRemoved)}`
                        : '0'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
