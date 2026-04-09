"""
Task 6.3 + 6.4: Correlation Regression and LOO Cross-Validation for TSCG Paper.

Computes:
  - Linear regression: delta = slope * natural_acc + intercept
  - Bootstrap CI for R^2
  - Leave-One-Out CV by model family
  - Both 5-model (original) and 7-model (expanded) datasets
"""

import csv
import json
import numpy as np
from scipy import stats

# ===================================================================
# PART 1: Load all data sources
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

# --- Source 2: scaling-curve.csv (Qwen3 14B with conservative) ---
scaling = {}
with open(r'D:\0_TSCG\benchmark\results\small-models\scaling-curve.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        model = row['model'].strip()
        cat = int(row['catalog_size'])
        cond = row['condition'].strip()
        acc = float(row['accuracy'])
        key = (model, cat)
        if key not in scaling:
            scaling[key] = {}
        scaling[key][cond] = acc

# --- Source 3: statistics-v2.json (Gemma 3 12B) ---
with open(r'D:\0_TSCG\benchmark\results\analysis\statistics-v2.json', 'r') as f:
    stats_json = json.load(f)

# The data is nested under 'comparisons' key
stats_data = stats_json.get('comparisons', stats_json if isinstance(stats_json, list) else [])

gemma12 = {}
for entry in stats_data:
    if isinstance(entry, dict) and entry.get('model') == 'Gemma 3 12B':
        cat = int(entry['catalog_size'])
        nat = float(entry['accuracy_a'])
        tscg = float(entry['accuracy_b'])
        delta = float(entry['delta_pp']) / 100.0  # convert pp to fraction
        gemma12[cat] = {'natural': nat, 'tscg': tscg, 'delta': delta}

print('=' * 80)
print('DATA INVENTORY')
print('=' * 80)

# Print ablation data
print()
print('--- ablation-no-mt.csv (5 original models) ---')
models_5 = ['Mistral 7B', 'Phi-4', 'Gemma 3 4B', 'Llama 3.1 8B', 'Qwen3 4B']
cat_sizes = [3, 5, 10, 15, 20, 30, 50]
for m in models_5:
    for c in cat_sizes:
        key = (m, c)
        if key in ablation:
            d = ablation[key]
            nat = d.get('natural', None)
            tscg_val = d.get('tscg', None)
            if nat is not None and tscg_val is not None:
                delta = tscg_val - nat
                print(f'  {m:15s} cat={c:2d}  natural={nat:.4f}  tscg={tscg_val:.4f}  delta={delta:+.4f}')

print()
print('--- scaling-curve.csv (Qwen3 14B) ---')
for c in cat_sizes:
    key = ('Qwen3 14B', c)
    if key in scaling:
        d = scaling[key]
        nat = d.get('natural', None)
        tscg_val = d.get('tscg', None)
        tscg_c = d.get('tscg_conservative', None)
        delta_b = (tscg_val - nat) if nat is not None and tscg_val is not None else None
        delta_c = (tscg_c - nat) if nat is not None and tscg_c is not None else None
        cons_str = f'conservative={tscg_c:.4f}(d={delta_c:+.4f})' if tscg_c is not None else 'conservative=N/A'
        bal_str = f'tscg={tscg_val:.4f}(d={delta_b:+.4f})' if tscg_val is not None else 'tscg=N/A'
        print(f'  Qwen3 14B cat={c:2d}  natural={nat:.4f}  {bal_str}  {cons_str}')

print()
print('--- statistics-v2.json (Gemma 3 12B) ---')
for c in sorted(gemma12.keys()):
    d = gemma12[c]
    print(f'  Gemma 3 12B cat={c:2d}  natural={d["natural"]:.4f}  tscg={d["tscg"]:.4f}  delta={d["delta"]:+.4f}')


# ===================================================================
# PART 2: Build data arrays
# ===================================================================

# --- 5-model dataset (original, matches fig8) ---
X_5 = []
Y_5 = []
labels_5 = []
model_assign_5 = []
for m in models_5:
    for c in cat_sizes:
        key = (m, c)
        if key in ablation:
            d = ablation[key]
            nat = d.get('natural')
            tscg_val = d.get('tscg')
            if nat is not None and tscg_val is not None:
                delta = tscg_val - nat
                X_5.append(nat)
                Y_5.append(delta)
                labels_5.append(f'{m}|{c}')
                model_assign_5.append(m)

X_5 = np.array(X_5)
Y_5 = np.array(Y_5)
model_assign_5 = np.array(model_assign_5)

# --- 7-model dataset (expanded: + Qwen3 14B conservative + Gemma 3 12B) ---
X_7 = list(X_5)
Y_7 = list(Y_5)
labels_7 = list(labels_5)
model_assign_7 = list(model_assign_5)

# Add Qwen3 14B (use conservative delta where available, else balanced)
for c in cat_sizes:
    key = ('Qwen3 14B', c)
    if key in scaling:
        d = scaling[key]
        nat = d.get('natural')
        tscg_c = d.get('tscg_conservative')
        tscg_b = d.get('tscg')
        if nat is not None:
            if tscg_c is not None:
                delta = tscg_c - nat
            elif tscg_b is not None:
                delta = tscg_b - nat
            else:
                continue
            X_7.append(nat)
            Y_7.append(delta)
            labels_7.append(f'Qwen3 14B|{c}')
            model_assign_7.append('Qwen3 14B')

# Add Gemma 3 12B
for c in cat_sizes:
    if c in gemma12:
        d = gemma12[c]
        X_7.append(d['natural'])
        Y_7.append(d['delta'])
        labels_7.append(f'Gemma 3 12B|{c}')
        model_assign_7.append('Gemma 3 12B')

X_7 = np.array(X_7)
Y_7 = np.array(Y_7)
model_assign_7 = np.array(model_assign_7)

print()
print(f'5-model dataset: n={len(X_5)} points')
print(f'7-model dataset: n={len(X_7)} points')


# ===================================================================
# PART 3: Regression (5-model)
# ===================================================================
print()
print('=' * 80)
print(f'REGRESSION: 5-MODEL (ORIGINAL, n={len(X_5)})')
print('=' * 80)

slope5, intercept5, r5, p5, se5 = stats.linregress(X_5, Y_5)
r2_5 = r5**2
print(f'  slope (beta)  = {slope5:.4f}')
print(f'  intercept     = {intercept5:.4f}')
print(f'  R^2           = {r2_5:.4f}')
print(f'  R             = {r5:.4f}')
print(f'  p-value       = {p5:.2e}')
print(f'  std_err       = {se5:.4f}')

# Bootstrap CI for R^2
np.random.seed(42)
boot_r2_5 = []
for _ in range(10000):
    idx = np.random.choice(len(X_5), len(X_5), replace=True)
    try:
        _, _, r, _, _ = stats.linregress(X_5[idx], Y_5[idx])
        boot_r2_5.append(r**2)
    except:
        pass
ci5_lo, ci5_hi = np.percentile(boot_r2_5, [2.5, 97.5])
print(f'  95% Bootstrap CI for R^2 = [{ci5_lo:.4f}, {ci5_hi:.4f}]')


# ===================================================================
# PART 4: Regression (7-model)
# ===================================================================
print()
print('=' * 80)
print(f'REGRESSION: 7-MODEL (EXPANDED, n={len(X_7)})')
print('=' * 80)

slope7, intercept7, r7, p7, se7 = stats.linregress(X_7, Y_7)
r2_7 = r7**2
print(f'  slope (beta)  = {slope7:.4f}')
print(f'  intercept     = {intercept7:.4f}')
print(f'  R^2           = {r2_7:.4f}')
print(f'  R             = {r7:.4f}')
print(f'  p-value       = {p7:.2e}')
print(f'  std_err       = {se7:.4f}')

np.random.seed(42)
boot_r2_7 = []
for _ in range(10000):
    idx = np.random.choice(len(X_7), len(X_7), replace=True)
    try:
        _, _, r, _, _ = stats.linregress(X_7[idx], Y_7[idx])
        boot_r2_7.append(r**2)
    except:
        pass
ci7_lo, ci7_hi = np.percentile(boot_r2_7, [2.5, 97.5])
print(f'  95% Bootstrap CI for R^2 = [{ci7_lo:.4f}, {ci7_hi:.4f}]')


# ===================================================================
# PART 5: Leave-One-Out Cross-Validation (by model)
# ===================================================================

def run_loo(X, Y, model_labels, unique_models, title):
    print()
    print('=' * 80)
    print(f'LOO CROSS-VALIDATION: {title}')
    print('=' * 80)

    header = f'  {"Model":20s} {"Act.Mean-d":>10s} {"Pred.Mean-d":>12s} {"MeanErr":>10s} {"RMSE":>10s} {"MAE":>10s} {"N":>5s}'
    print(header)
    print('  ' + '-' * 75)

    loo_rmses = []
    loo_maes = []
    all_residuals = []
    for held_out in unique_models:
        train_mask = model_labels != held_out
        test_mask = model_labels == held_out

        X_train = X[train_mask]
        Y_train = Y[train_mask]
        X_test = X[test_mask]
        Y_test = Y[test_mask]

        sl, ic, _, _, _ = stats.linregress(X_train, Y_train)
        Y_pred = sl * X_test + ic

        residuals = Y_test - Y_pred
        all_residuals.extend(residuals.tolist())
        rmse = np.sqrt(np.mean(residuals**2))
        mae = np.mean(np.abs(residuals))
        mean_err = np.mean(residuals)
        act_mean = np.mean(Y_test)
        pred_mean = np.mean(Y_pred)

        loo_rmses.append(rmse)
        loo_maes.append(mae)
        print(f'  {held_out:20s} {act_mean:+10.4f} {pred_mean:+12.4f} {mean_err:+10.4f} {rmse:10.4f} {mae:10.4f} {len(X_test):5d}')

    print('  ' + '-' * 75)
    overall_rmse = np.sqrt(np.mean(np.array(all_residuals)**2))
    print(f'  {"MEAN (per-model)":20s} {"":10s} {"":12s} {"":10s} {np.mean(loo_rmses):10.4f} {np.mean(loo_maes):10.4f}')
    print(f'  {"OVERALL (pooled)":20s} {"":10s} {"":12s} {"":10s} {overall_rmse:10.4f}')
    return loo_rmses, all_residuals

unique_models_5 = ['Mistral 7B', 'Phi-4', 'Gemma 3 4B', 'Llama 3.1 8B', 'Qwen3 4B']
loo5_rmses, loo5_res = run_loo(X_5, Y_5, model_assign_5, unique_models_5, f'5-MODEL (n={len(X_5)})')

unique_models_7 = ['Mistral 7B', 'Phi-4', 'Gemma 3 4B', 'Llama 3.1 8B', 'Qwen3 4B', 'Qwen3 14B', 'Gemma 3 12B']
loo7_rmses, loo7_res = run_loo(X_7, Y_7, model_assign_7, unique_models_7, f'7-MODEL (n={len(X_7)})')


# ===================================================================
# PART 6: Additional diagnostics
# ===================================================================
print()
print('=' * 80)
print('ADDITIONAL DIAGNOSTICS')
print('=' * 80)

# Pearson
r_pearson5, p_pearson5 = stats.pearsonr(X_5, Y_5)
r_pearson7, p_pearson7 = stats.pearsonr(X_7, Y_7)
print(f'  Pearson r (5-model)     = {r_pearson5:.4f}  (p = {p_pearson5:.2e})')
print(f'  Pearson r (7-model)     = {r_pearson7:.4f}  (p = {p_pearson7:.2e})')

# Spearman
r_spearman5, p_spearman5 = stats.spearmanr(X_5, Y_5)
r_spearman7, p_spearman7 = stats.spearmanr(X_7, Y_7)
print(f'  Spearman rho (5-model)  = {r_spearman5:.4f}  (p = {p_spearman5:.2e})')
print(f'  Spearman rho (7-model)  = {r_spearman7:.4f}  (p = {p_spearman7:.2e})')

# Residual std
Y_pred_5 = slope5 * X_5 + intercept5
Y_pred_7 = slope7 * X_7 + intercept7
print(f'  Residual std (5-model)  = {np.std(Y_5 - Y_pred_5):.4f}')
print(f'  Residual std (7-model)  = {np.std(Y_7 - Y_pred_7):.4f}')

# Per-model summary (7-model)
print()
print('  Per-model actual vs predicted mean delta (7-model regression):')
for m in unique_models_7:
    mask = model_assign_7 == m
    act = np.mean(Y_7[mask])
    pred = np.mean(slope7 * X_7[mask] + intercept7)
    n = np.sum(mask)
    print(f'    {m:20s}  actual={act:+.4f}  predicted={pred:+.4f}  err={act-pred:+.4f}  (n={n})')


# ===================================================================
# PART 7: All 7-model data points (sorted)
# ===================================================================
print()
print('=' * 80)
print('ALL 7-MODEL DATA POINTS (sorted by natural accuracy)')
print('=' * 80)
order = np.argsort(X_7)
print(f'  {"Label":30s} {"X(natural)":>10s} {"Y(delta)":>10s} {"Y_pred":>10s} {"residual":>10s}')
print('  ' + '-' * 75)
for i in order:
    y_p = slope7 * X_7[i] + intercept7
    res = Y_7[i] - y_p
    print(f'  {labels_7[i]:30s} {X_7[i]:10.4f} {Y_7[i]:+10.4f} {y_p:+10.4f} {res:+10.4f}')


# ===================================================================
# PART 8: Compact summary for the paper
# ===================================================================
print()
print()
print('*' * 80)
print('COMPACT SUMMARY FOR PAPER')
print('*' * 80)
print()
print('5-MODEL (original fig8):')
print(f'  n = {len(X_5)}')
print(f'  delta = {slope5:.4f} * natural_acc + {intercept5:.4f}')
print(f'  R^2 = {r2_5:.4f}  [95% CI: {ci5_lo:.4f} - {ci5_hi:.4f}]')
print(f'  slope = {slope5:.4f}, intercept = {intercept5:.4f}')
print(f'  p = {p5:.2e}, SE = {se5:.4f}')
print(f'  LOO-CV mean RMSE = {np.mean(loo5_rmses):.4f}')
print(f'  LOO-CV pooled RMSE = {np.sqrt(np.mean(np.array(loo5_res)**2)):.4f}')
print()
print('7-MODEL (expanded):')
print(f'  n = {len(X_7)}')
print(f'  delta = {slope7:.4f} * natural_acc + {intercept7:.4f}')
print(f'  R^2 = {r2_7:.4f}  [95% CI: {ci7_lo:.4f} - {ci7_hi:.4f}]')
print(f'  slope = {slope7:.4f}, intercept = {intercept7:.4f}')
print(f'  p = {p7:.2e}, SE = {se7:.4f}')
print(f'  LOO-CV mean RMSE = {np.mean(loo7_rmses):.4f}')
print(f'  LOO-CV pooled RMSE = {np.sqrt(np.mean(np.array(loo7_res)**2)):.4f}')

print()
print('DONE.')
