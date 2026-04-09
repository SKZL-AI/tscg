import type { OptimizationProfile } from '@tscg/optimizer/optimizer.js';

const PROFILE_INFO: Record<
  OptimizationProfile,
  { label: string; description: string }
> = {
  minimal: {
    label: 'Minimal',
    description: 'SDM + CFL only, lightest touch',
  },
  balanced: {
    label: 'Balanced',
    description: 'Best balance of compression + accuracy (default)',
  },
  max_compress: {
    label: 'Max Compress',
    description: 'Maximum token reduction',
  },
  max_accuracy: {
    label: 'Max Accuracy',
    description: 'Maximum accuracy with SAD-F + CCP',
  },
  full: {
    label: 'Full',
    description: 'All 10 transforms including CAS',
  },
};

const PROFILE_ORDER: OptimizationProfile[] = [
  'minimal',
  'balanced',
  'max_compress',
  'max_accuracy',
  'full',
];

interface ProfileSelectorProps {
  profile: OptimizationProfile;
  onChange: (profile: OptimizationProfile) => void;
}

export default function ProfileSelector({
  profile,
  onChange,
}: ProfileSelectorProps) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Optimization Profile</span>
      </div>
      <div className="card-body">
        <div className="profile-group">
          {PROFILE_ORDER.map((p) => {
            const info = PROFILE_INFO[p];
            return (
              <button
                key={p}
                className={`profile-btn ${p === profile ? 'active' : ''}`}
                onClick={() => onChange(p)}
              >
                {info.label}
                <span className="profile-tooltip">{info.description}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
