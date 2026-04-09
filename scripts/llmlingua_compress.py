"""
LLMLingua-2 Compression Script for TSCG Complementary Testing.

Compresses 30 tool test prompts in 2 conditions:
  - LLMLingua-only: compress natural prompt (50% target)
  - TSCG+LLMLingua: compress TSCG prompt (50% target)

Output: data/llmlingua-results.json
"""

import json
import time
import os
import sys

# Try to import llmlingua
try:
    from llmlingua import PromptCompressor
except ImportError:
    print("ERROR: llmlingua not installed. Run: pip install llmlingua")
    sys.exit(1)

import torch

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, '..', 'data')
INPUT_FILE = os.path.join(DATA_DIR, 'llmlingua-input.json')
OUTPUT_FILE = os.path.join(DATA_DIR, 'llmlingua-results.json')

TARGET_RATIO = 0.5  # Keep 50% of tokens

def count_tokens_approx(text: str) -> int:
    """Approximate token count (whitespace split * 1.3 for BPE overhead)."""
    words = text.split()
    return max(1, round(len(words) * 1.3))


def main():
    # Check GPU
    if torch.cuda.is_available():
        print(f"CUDA available: {torch.cuda.get_device_name(0)}")
        device = "cuda"
    else:
        print("WARNING: CUDA not available, using CPU (will be slower)")
        device = "cpu"

    # Load input
    print(f"Loading {INPUT_FILE}...")
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        tests = json.load(f)
    print(f"Loaded {len(tests)} test cases")

    # Initialize LLMLingua-2
    print("Initializing LLMLingua-2 (microsoft/llmlingua-2-xlm-roberta-large)...")
    print("This may take a moment on first run (downloading model)...")

    compressor = PromptCompressor(
        model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
        device_map=device,
        use_llmlingua2=True,
    )
    print("LLMLingua-2 initialized successfully")

    results = []

    for i, test in enumerate(tests):
        test_id = test['id']
        category = test['category']
        name = test['name']
        natural_prompt = test['natural_prompt']
        tscg_prompt = test['tscg_prompt']
        expected = test['expected_answer']

        print(f"\n[{i+1}/{len(tests)}] {test_id}: {name} ({category})")

        # --- Condition C: LLMLingua-only (compress natural prompt) ---
        natural_tokens_orig = count_tokens_approx(natural_prompt)
        target_tokens_natural = max(10, int(natural_tokens_orig * TARGET_RATIO))

        t0 = time.time()
        try:
            result_natural = compressor.compress_prompt(
                natural_prompt,
                target_token=target_tokens_natural,
                force_tokens=['\n', '?', '.', '!', ',', ':'],
            )
            natural_compressed = result_natural.get('compressed_prompt', natural_prompt)
            natural_compressed_tokens = count_tokens_approx(natural_compressed)
            natural_time_ms = round((time.time() - t0) * 1000)
            natural_ratio = 1.0 - (natural_compressed_tokens / natural_tokens_orig) if natural_tokens_orig > 0 else 0
            print(f"  LLMLingua-only: {natural_tokens_orig} -> {natural_compressed_tokens} tokens ({natural_ratio*100:.1f}% savings, {natural_time_ms}ms)")
        except Exception as e:
            print(f"  LLMLingua-only FAILED: {e}")
            natural_compressed = natural_prompt
            natural_compressed_tokens = natural_tokens_orig
            natural_time_ms = 0
            natural_ratio = 0

        # --- Condition D: TSCG+LLMLingua (compress TSCG prompt) ---
        tscg_tokens_orig = count_tokens_approx(tscg_prompt)
        target_tokens_tscg = max(5, int(tscg_tokens_orig * TARGET_RATIO))

        t0 = time.time()
        try:
            result_tscg = compressor.compress_prompt(
                tscg_prompt,
                target_token=target_tokens_tscg,
                force_tokens=['\n', '?', '.', '!', ',', ':', '[', ']'],
            )
            tscg_compressed = result_tscg.get('compressed_prompt', tscg_prompt)
            tscg_compressed_tokens = count_tokens_approx(tscg_compressed)
            tscg_time_ms = round((time.time() - t0) * 1000)
            # Compound savings: relative to original natural prompt
            compound_ratio = 1.0 - (tscg_compressed_tokens / natural_tokens_orig) if natural_tokens_orig > 0 else 0
            tscg_only_ratio = 1.0 - (tscg_tokens_orig / natural_tokens_orig) if natural_tokens_orig > 0 else 0
            print(f"  TSCG+LLMLingua: {tscg_tokens_orig} -> {tscg_compressed_tokens} tokens (compound: {compound_ratio*100:.1f}% savings, {tscg_time_ms}ms)")
        except Exception as e:
            print(f"  TSCG+LLMLingua FAILED: {e}")
            tscg_compressed = tscg_prompt
            tscg_compressed_tokens = tscg_tokens_orig
            tscg_time_ms = 0
            compound_ratio = 0
            tscg_only_ratio = 0

        results.append({
            'id': test_id,
            'category': category,
            'name': name,
            'expected_answer': expected,
            # Original prompts
            'natural_prompt': natural_prompt,
            'tscg_prompt': tscg_prompt,
            'natural_tokens_orig': natural_tokens_orig,
            'tscg_tokens_orig': tscg_tokens_orig,
            # Condition C: LLMLingua-only
            'llmlingua_only_compressed': natural_compressed,
            'llmlingua_only_tokens': natural_compressed_tokens,
            'llmlingua_only_savings': round(natural_ratio, 4),
            'llmlingua_only_time_ms': natural_time_ms,
            # Condition D: TSCG+LLMLingua
            'tscg_llmlingua_compressed': tscg_compressed,
            'tscg_llmlingua_tokens': tscg_compressed_tokens,
            'tscg_only_savings': round(tscg_only_ratio, 4),
            'compound_savings': round(compound_ratio, 4),
            'tscg_llmlingua_time_ms': tscg_time_ms,
        })

    # Save results
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n{'='*60}")
    print(f"Results saved to {OUTPUT_FILE}")

    # Summary
    avg_natural = sum(r['natural_tokens_orig'] for r in results) / len(results)
    avg_tscg = sum(r['tscg_tokens_orig'] for r in results) / len(results)
    avg_llm_only = sum(r['llmlingua_only_tokens'] for r in results) / len(results)
    avg_compound = sum(r['tscg_llmlingua_tokens'] for r in results) / len(results)
    avg_llm_savings = sum(r['llmlingua_only_savings'] for r in results) / len(results)
    avg_compound_savings = sum(r['compound_savings'] for r in results) / len(results)

    print(f"\nSummary (30 tests):")
    print(f"  Natural (baseline):   {avg_natural:.0f} avg tokens")
    print(f"  TSCG-only:            {avg_tscg:.0f} avg tokens ({(1-avg_tscg/avg_natural)*100:.1f}% savings)")
    print(f"  LLMLingua-only:       {avg_llm_only:.0f} avg tokens ({avg_llm_savings*100:.1f}% savings)")
    print(f"  TSCG+LLMLingua:       {avg_compound:.0f} avg tokens ({avg_compound_savings*100:.1f}% compound savings)")


if __name__ == '__main__':
    main()
