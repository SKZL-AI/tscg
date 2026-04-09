# TAB v1.0 — Analysis Plan

Single Source of Truth for how benchmark results are interpreted and reported.
Created as part of FIX-01 (Luecken-Analyse Plan 5.1).

## Primary Endpoint

- **ARR (Accuracy Retention Rate)** per (scenario, model) pair
- Definition: ARR = accuracy_tscg / accuracy_natural x 100
- Target: ARR >= 99% for frontier models, ARR >= 95% for small models

## Accuracy Definition per Scenario

- Scenario A/B/E/BFCL: Binary — correct tool selected AND required parameters present
- Scenario C: Binary — correct tool selected (parameter check relaxed for scaling)
- Scenario D: Binary — correct tool selected AND required parameters present
- GSM8K: Binary — final numerical answer matches ground truth (exact match after normalization)

## Aggregation Rules

- Per-scenario: mean accuracy across all tasks within a run
- Across runs (where runs > 1): mean +/- std across runs
- Cross-scenario: NOT aggregated (each scenario reported independently)

## Treatment of Invalid Outputs

- API timeout (>60s): counted as incorrect
- Malformed JSON response: counted as incorrect
- Provider error (5xx): excluded from analysis, documented in RUN_METADATA.json
- Rate limit retry success: counted normally
- Rate limit final failure: counted as incorrect

## Statistical Tests

- Primary: McNemar's test (paired binary outcomes, natural vs tscg)
- Secondary: Paired t-test on accuracy scores across tasks
- Uncertainty: Bootstrap 95% CI (B=1000, seed=42)
- Effect size: Cohen's d (with Hedges' g correction for small samples)
- Multiple comparisons: Holm-Bonferroni correction across all scenario x model tests
- Report: both corrected and uncorrected p-values

## Token Savings Calculation

- Baseline: JSON.stringify(tools) token count (estimated via estimateTokens())
- Compressed: TSCG output token count (same estimation method)
- Savings = (baseline - compressed) / baseline x 100
- Report 95% CI via bootstrap

## Seeds

- Task generation: seed from experiment-plan.json (primary: 42)
- Bootstrap resampling: seed 42
- Validation seeds: 123, 7 (Wave 4 multi-seed check)
