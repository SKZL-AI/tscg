#!/usr/bin/env python3
"""
Wave 2.5.2: Generate Scenario D Accuracy Heatmaps
Produces two heatmaps: Natural accuracy and TSCG accuracy by model x catalog size,
plus a delta heatmap showing TSCG improvement.
"""

import json
import os
import numpy as np

# Try matplotlib with Agg backend (no display needed)
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

BASE = os.path.join(os.path.dirname(__file__), '..', 'benchmark', 'results', 'small-models')
OUTPUT = os.path.join(os.path.dirname(__file__), '..', 'PLAN 5.1', 'Analysen', 'Wave-2.5.2')
os.makedirs(OUTPUT, exist_ok=True)

CATALOG_SIZES = [3, 5, 10, 15, 20, 30, 50]

# All models with display names and folder prefixes
MODELS = [
    ('Gemma3-12B', 'gemma3-12b'),
    ('Qwen3-14B', 'qwen3-14b'),
    ('Phi4-14B', 'phi4'),
    ('Llama3.1-8B', 'llama3.1'),
    ('Qwen3-8B', 'qwen3'),
    ('Mistral-7B', 'mistral'),
    ('Gemma3-4B', 'gemma3'),
]

def load_accuracy(prefix, size):
    """Load accuracy from report.json aggregates."""
    path = os.path.join(BASE, f'{prefix}_{size}tools', 'report.json')
    if not os.path.exists(path):
        return None, None
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    nat_acc = tscg_acc = None
    for agg in data.get('aggregates', []):
        if agg['condition'] == 'natural':
            nat_acc = agg['accuracy']['mean']
        elif agg['condition'] == 'tscg':
            tscg_acc = agg['accuracy']['mean']
    return nat_acc, tscg_acc


def build_matrices():
    """Build accuracy matrices for all models x catalog sizes."""
    nat_matrix = np.full((len(MODELS), len(CATALOG_SIZES)), np.nan)
    tscg_matrix = np.full((len(MODELS), len(CATALOG_SIZES)), np.nan)

    for i, (name, prefix) in enumerate(MODELS):
        for j, size in enumerate(CATALOG_SIZES):
            nat, tscg = load_accuracy(prefix, size)
            if nat is not None:
                nat_matrix[i, j] = nat
            if tscg is not None:
                tscg_matrix[i, j] = tscg

    return nat_matrix, tscg_matrix


def plot_heatmap(matrix, title, filename, cmap='RdYlGn', vmin=0.0, vmax=1.0, fmt='.0%'):
    """Plot a single heatmap."""
    fig, ax = plt.subplots(figsize=(10, 5))

    model_names = [m[0] for m in MODELS]
    size_labels = [str(s) for s in CATALOG_SIZES]

    # Create masked array for NaN values
    masked = np.ma.masked_invalid(matrix)

    im = ax.imshow(masked, cmap=cmap, vmin=vmin, vmax=vmax, aspect='auto')

    # Axes
    ax.set_xticks(range(len(CATALOG_SIZES)))
    ax.set_xticklabels(size_labels, fontsize=11)
    ax.set_yticks(range(len(MODELS)))
    ax.set_yticklabels(model_names, fontsize=11)
    ax.set_xlabel('Catalog Size (# Tools)', fontsize=12)
    ax.set_title(title, fontsize=14, fontweight='bold')

    # Annotate cells
    for i in range(matrix.shape[0]):
        for j in range(matrix.shape[1]):
            val = matrix[i, j]
            if np.isnan(val):
                ax.text(j, i, 'N/A', ha='center', va='center', fontsize=9, color='gray')
            else:
                color = 'white' if val < 0.4 or val > 0.85 else 'black'
                if fmt == '.0%':
                    text = f'{val:.0%}'
                elif fmt == '+.0%':
                    text = f'{val:+.0%}'
                else:
                    text = f'{val:{fmt}}'
                ax.text(j, i, text, ha='center', va='center', fontsize=10,
                        fontweight='bold', color=color)

    cbar = fig.colorbar(im, ax=ax, shrink=0.8)
    cbar.ax.tick_params(labelsize=10)

    plt.tight_layout()
    out_path = os.path.join(OUTPUT, filename)
    fig.savefig(out_path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f'Saved: {out_path}')
    return out_path


def plot_delta_heatmap(nat_matrix, tscg_matrix):
    """Plot delta heatmap (TSCG - Natural)."""
    delta = tscg_matrix - nat_matrix

    fig, ax = plt.subplots(figsize=(10, 5))
    model_names = [m[0] for m in MODELS]
    size_labels = [str(s) for s in CATALOG_SIZES]

    # Diverging colormap centered at 0
    norm = mcolors.TwoSlopeNorm(vmin=-0.3, vcenter=0, vmax=0.9)
    masked = np.ma.masked_invalid(delta)

    im = ax.imshow(masked, cmap='RdYlGn', norm=norm, aspect='auto')

    ax.set_xticks(range(len(CATALOG_SIZES)))
    ax.set_xticklabels(size_labels, fontsize=11)
    ax.set_yticks(range(len(MODELS)))
    ax.set_yticklabels(model_names, fontsize=11)
    ax.set_xlabel('Catalog Size (# Tools)', fontsize=12)
    ax.set_title('Scenario D: TSCG Accuracy Delta (TSCG - Natural)', fontsize=14, fontweight='bold')

    for i in range(delta.shape[0]):
        for j in range(delta.shape[1]):
            val = delta[i, j]
            if np.isnan(val):
                ax.text(j, i, 'N/A', ha='center', va='center', fontsize=9, color='gray')
            else:
                color = 'white' if abs(val) > 0.6 else 'black'
                ax.text(j, i, f'{val:+.0%}', ha='center', va='center',
                        fontsize=10, fontweight='bold', color=color)

    cbar = fig.colorbar(im, ax=ax, shrink=0.8)
    cbar.ax.tick_params(labelsize=10)

    plt.tight_layout()
    out_path = os.path.join(OUTPUT, 'scenario-d-delta-heatmap.png')
    fig.savefig(out_path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f'Saved: {out_path}')
    return out_path


def plot_threshold_curve(nat_matrix, tscg_matrix):
    """Plot threshold curves showing where TSCG overtakes natural per model."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

    model_names = [m[0] for m in MODELS]
    colors = plt.cm.tab10(np.linspace(0, 1, len(MODELS)))

    # Left: Natural accuracy degradation
    for i, (name, _) in enumerate(MODELS):
        vals = nat_matrix[i, :]
        valid = ~np.isnan(vals)
        if valid.any():
            ax1.plot(np.array(CATALOG_SIZES)[valid], vals[valid], 'o-',
                     label=name, color=colors[i], linewidth=2, markersize=6)

    ax1.axhline(y=0.65, color='red', linestyle='--', alpha=0.5, label='65% threshold')
    ax1.set_xlabel('Catalog Size (# Tools)', fontsize=12)
    ax1.set_ylabel('Natural Accuracy', fontsize=12)
    ax1.set_title('Natural Accuracy vs Catalog Size', fontsize=13, fontweight='bold')
    ax1.legend(fontsize=8, loc='lower left')
    ax1.set_ylim(-0.05, 1.05)
    ax1.grid(True, alpha=0.3)

    # Right: TSCG accuracy
    for i, (name, _) in enumerate(MODELS):
        vals = tscg_matrix[i, :]
        valid = ~np.isnan(vals)
        if valid.any():
            ax2.plot(np.array(CATALOG_SIZES)[valid], vals[valid], 'o-',
                     label=name, color=colors[i], linewidth=2, markersize=6)

    ax2.axhline(y=0.65, color='red', linestyle='--', alpha=0.5, label='65% threshold')
    ax2.set_xlabel('Catalog Size (# Tools)', fontsize=12)
    ax2.set_ylabel('TSCG Accuracy', fontsize=12)
    ax2.set_title('TSCG Accuracy vs Catalog Size', fontsize=13, fontweight='bold')
    ax2.legend(fontsize=8, loc='lower left')
    ax2.set_ylim(-0.05, 1.05)
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    out_path = os.path.join(OUTPUT, 'scenario-d-threshold-curves.png')
    fig.savefig(out_path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f'Saved: {out_path}')
    return out_path


if __name__ == '__main__':
    print('Building accuracy matrices...')
    nat, tscg = build_matrices()

    print(f'\nNatural accuracy matrix shape: {nat.shape}')
    print(f'TSCG accuracy matrix shape: {tscg.shape}')

    # Print summary
    for i, (name, _) in enumerate(MODELS):
        nat_vals = nat[i, ~np.isnan(nat[i, :])]
        tscg_vals = tscg[i, ~np.isnan(tscg[i, :])]
        if len(nat_vals) > 0 and len(tscg_vals) > 0:
            print(f'  {name:15s}: Natural avg={nat_vals.mean():.3f}, TSCG avg={tscg_vals.mean():.3f}, Delta={tscg_vals.mean()-nat_vals.mean():+.3f}')

    print('\nGenerating figures...')
    plot_heatmap(nat, 'Scenario D: Natural Accuracy by Model x Catalog Size',
                 'scenario-d-natural-heatmap.png')
    plot_heatmap(tscg, 'Scenario D: TSCG Accuracy by Model x Catalog Size',
                 'scenario-d-tscg-heatmap.png')
    plot_delta_heatmap(nat, tscg)
    plot_threshold_curve(nat, tscg)

    print('\nAll figures saved to:', OUTPUT)
