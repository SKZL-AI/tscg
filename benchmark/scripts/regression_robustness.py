"""
ANALYSE13 + ANALYSE14 Robustness Checks for TSCG Paper Regression.

Two checks:
  1. R^2 without Phi-4 14B (leverage-point check)
  2. Model-Level R^2 (5 aggregate points instead of 35 individual)

Uses the same data pipeline as regression_loo.py.
"""

import csv
import json
import numpy as np
from scipy import stats

# ===================================================================
# Load data (same as regression_loo.py)
# ===================================================================

# --- Source 1: ablation-no-mt.csv (5 original models) ---
ablation = {}
with open(r'D:\0_TSCG\benchmark\results\small-models\ablation-no-mt.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        model = row['model'].strip()
        cat = int(row['catalog_size'])
        cond = row['condition'].strip()
        acc = float(row['overall_all'])
        key = (model, cat)
        if key not in ablation:
            ablation[key] = {}
        ablation[key][cond] = acc

models_5 = ['Mistral 7B', 'Phi-4', 'Gemma 3 4B', 'Llama 3.1 8B', 'Qwen3 4B']
cat_sizes = [3, 5, 10, 15, 20, 30, 50]

# Build full 5-model dataset
X_all = []
Y_all = []
model_labels = []

for m in models_5:
    for c in cat_sizes:
        key = (m, c)
        if key in ablation:
            d = ablation[key]
            nat = d.get('natural')
            tscg_val = d.get('tscg')
            if nat is not None and tscg_val is not None:
                delta = tscg_val - nat
                X_all.append(nat)
                Y_all.append(delta)
                model_labels.append(m)

X_all = np.array(X_all)
Y_all = np.array(Y_all)
model_labels = np.array(model_labels)

# ===================================================================
# Baseline: Full 5-model regression (for reference)
# ===================================================================
slope_full, intercept_full, r_full, p_full, se_full = stats.linregress(X_all, Y_all)
r2_full = r_full**2

print('=' * 72)
print('BASELINE: FULL 5-MODEL REGRESSION (n=%d)' % len(X_all))
print('=' * 72)
print(f'  slope     = {slope_full:.4f}')
print(f'  intercept = {intercept_full:.4f}')
print(f'  R^2       = {r2_full:.4f}')
print(f'  p-value   = {p_full:.2e}')
print()

# ===================================================================
# CHECK 1: R^2 WITHOUT PHI-4 (leverage-point check)
# ===================================================================
print('=' * 72)
print('CHECK 1: R^2 WITHOUT PHI-4 (LEVERAGE-POINT CHECK)')
print('=' * 72)

mask_no_phi4 = model_labels != 'Phi-4'
X_no_phi4 = X_all[mask_no_phi4]
Y_no_phi4 = Y_all[mask_no_phi4]
labels_no_phi4 = model_labels[mask_no_phi4]

print(f'  Points removed:  {np.sum(~mask_no_phi4)} (Phi-4)')
print(f'  Points remaining: {len(X_no_phi4)} (4 models x 7 sizes)')
print()

# Show Phi-4 data to illustrate the leverage concern
phi4_mask = model_labels == 'Phi-4'
phi4_x = X_all[phi4_mask]
phi4_y = Y_all[phi4_mask]
print('  Phi-4 data points (the concern):')
for i in range(len(phi4_x)):
    print(f'    natural_acc = {phi4_x[i]:.4f}  delta = {phi4_y[i]:+.4f}')
print(f'  Note: {np.sum(phi4_x == 0.0)}/7 Phi-4 points have natural_acc = 0.0')
print(f'        These sit at the extreme left of the X range.')
print()

# Regression without Phi-4
slope_np, intercept_np, r_np, p_np, se_np = stats.linregress(X_no_phi4, Y_no_phi4)
r2_no_phi4 = r_np**2

print(f'  Regression without Phi-4:')
print(f'    slope     = {slope_np:.4f}')
print(f'    intercept = {intercept_np:.4f}')
print(f'    R^2       = {r2_no_phi4:.4f}')
print(f'    R         = {r_np:.4f}')
print(f'    p-value   = {p_np:.2e}')
print(f'    std_err   = {se_np:.4f}')
print()

# Bootstrap CI for R^2 without Phi-4
np.random.seed(42)
boot_r2 = []
for _ in range(10000):
    idx = np.random.choice(len(X_no_phi4), len(X_no_phi4), replace=True)
    try:
        _, _, r_b, _, _ = stats.linregress(X_no_phi4[idx], Y_no_phi4[idx])
        boot_r2.append(r_b**2)
    except:
        pass
ci_lo, ci_hi = np.percentile(boot_r2, [2.5, 97.5])
print(f'    95% Bootstrap CI for R^2 = [{ci_lo:.4f}, {ci_hi:.4f}]')
print()

# Verdict
if r2_no_phi4 >= 0.70:
    verdict1 = 'ROBUST -- R^2 stays above 0.70 even without Phi-4.'
else:
    verdict1 = 'NOT ROBUST -- R^2 drops below 0.70; Phi-4 is a leverage point driving the fit.'

print(f'  >>> VERDICT: {verdict1}')
print(f'  >>> R^2 drop: {r2_full:.4f} -> {r2_no_phi4:.4f} (delta = {r2_no_phi4 - r2_full:+.4f})')
print()

# Also check each model's removal for comparison
print('  --- R^2 when removing each model (for comparison) ---')
for m in models_5:
    mask = model_labels != m
    X_sub = X_all[mask]
    Y_sub = Y_all[mask]
    _, _, r_sub, p_sub, _ = stats.linregress(X_sub, Y_sub)
    r2_sub = r_sub**2
    print(f'    Without {m:15s}: R^2 = {r2_sub:.4f}  (delta = {r2_sub - r2_full:+.4f})')

print()

# ===================================================================
# CHECK 2: MODEL-LEVEL R^2 (5 aggregate points)
# ===================================================================
print('=' * 72)
print('CHECK 2: MODEL-LEVEL R^2 (5 AGGREGATE POINTS)')
print('=' * 72)
print()
print('  Compute MEAN natural accuracy and MEAN delta per model,')
print('  then fit regression on 5 model-level data points.')
print()

model_means_x = []
model_means_y = []
model_names = []

for m in models_5:
    mask = model_labels == m
    mean_x = np.mean(X_all[mask])
    mean_y = np.mean(Y_all[mask])
    model_means_x.append(mean_x)
    model_means_y.append(mean_y)
    model_names.append(m)
    print(f'    {m:15s}  mean_natural = {mean_x:.4f}  mean_delta = {mean_y:+.4f}  (n={np.sum(mask)})')

model_means_x = np.array(model_means_x)
model_means_y = np.array(model_means_y)
print()

# Regression on model-level means
slope_ml, intercept_ml, r_ml, p_ml, se_ml = stats.linregress(model_means_x, model_means_y)
r2_model_level = r_ml**2

print(f'  Model-Level Regression (n=5):')
print(f'    slope     = {slope_ml:.4f}')
print(f'    intercept = {intercept_ml:.4f}')
print(f'    R^2       = {r2_model_level:.4f}')
print(f'    R         = {r_ml:.4f}')
print(f'    p-value   = {p_ml:.4f}')
print(f'    std_err   = {se_ml:.4f}')
print()

# With only 5 points, bootstrap is important
np.random.seed(42)
boot_r2_ml = []
for _ in range(10000):
    idx = np.random.choice(5, 5, replace=True)
    if len(set(idx)) < 3:
        continue  # need at least 3 unique points for meaningful regression
    try:
        _, _, r_b, _, _ = stats.linregress(model_means_x[idx], model_means_y[idx])
        boot_r2_ml.append(r_b**2)
    except:
        pass
ci_ml_lo, ci_ml_hi = np.percentile(boot_r2_ml, [2.5, 97.5])
print(f'    95% Bootstrap CI for R^2 = [{ci_ml_lo:.4f}, {ci_ml_hi:.4f}]')
print()

if r2_model_level >= 0.70:
    verdict2 = 'ROBUST -- Model-level R^2 > 0.70; pattern holds at the model level.'
else:
    verdict2 = 'WEAK -- Model-level R^2 < 0.70; pattern may not generalize across models.'

print(f'  >>> VERDICT: {verdict2}')
print()

# Also: Model-level without Phi-4 (4 points)
mask_4models = np.array([m != 'Phi-4' for m in model_names])
if np.sum(mask_4models) >= 3:
    slope_4, intercept_4, r_4, p_4, se_4 = stats.linregress(
        model_means_x[mask_4models], model_means_y[mask_4models]
    )
    r2_4models = r_4**2
    print(f'  Model-Level without Phi-4 (n=4):')
    print(f'    R^2       = {r2_4models:.4f}')
    print(f'    p-value   = {p_4:.4f}')
    print()

# ===================================================================
# FINAL SUMMARY
# ===================================================================
print()
print('*' * 72)
print('FINAL ROBUSTNESS SUMMARY')
print('*' * 72)
print()
print(f'  Baseline R^2 (5 models, 35 pts):           {r2_full:.4f}')
print(f'  R^2 without Phi-4 (4 models, 28 pts):      {r2_no_phi4:.4f}  [{ci_lo:.4f} - {ci_hi:.4f}]')
print(f'  Model-Level R^2 (5 agg. pts):               {r2_model_level:.4f}  [{ci_ml_lo:.4f} - {ci_ml_hi:.4f}]')
print(f'  Model-Level R^2 without Phi-4 (4 pts):      {r2_4models:.4f}')
print()

if r2_no_phi4 >= 0.70 and r2_model_level >= 0.70:
    conclusion = (
        'CONCLUSION: The R^2 = %.2f is ROBUST.\n'
        '  - Removing Phi-4 (the strongest leverage point) yields R^2 = %.4f (> 0.70).\n'
        '  - Model-level aggregation yields R^2 = %.4f (> 0.70).\n'
        '  - The negative correlation between natural accuracy and TSCG delta\n'
        '    is NOT an artifact of Phi-4 and holds at both the individual and model level.'
    ) % (r2_full, r2_no_phi4, r2_model_level)
elif r2_no_phi4 < 0.70 and r2_model_level >= 0.70:
    conclusion = (
        'CONCLUSION: The R^2 = %.2f is PARTIALLY driven by Phi-4.\n'
        '  - Without Phi-4, R^2 drops to %.4f (below 0.70) -- Phi-4 IS a leverage point.\n'
        '  - However, model-level R^2 = %.4f (> 0.70), so the trend is real at model level.\n'
        '  - Recommend: report both values and note Phi-4 leverage effect.'
    ) % (r2_full, r2_no_phi4, r2_model_level)
elif r2_no_phi4 >= 0.70 and r2_model_level < 0.70:
    conclusion = (
        'CONCLUSION: The R^2 = %.2f is robust to Phi-4 removal (%.4f > 0.70)\n'
        '  but weak at model level (R^2 = %.4f < 0.70).\n'
        '  - The trend may be driven by within-model variation rather than across-model.'
    ) % (r2_full, r2_no_phi4, r2_model_level)
else:
    conclusion = (
        'CONCLUSION: The R^2 = %.2f is FRAGILE.\n'
        '  - Without Phi-4: R^2 = %.4f (< 0.70)\n'
        '  - Model-level: R^2 = %.4f (< 0.70)\n'
        '  - The high R^2 is substantially driven by Phi-4 leverage.'
    ) % (r2_full, r2_no_phi4, r2_model_level)

print(conclusion)
print()
print('DONE.')
