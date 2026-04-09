"""
Wave 2.5.3: LLMLingua-2 Compression with PROPER Token Counting.

Fixes the Plan 5.0 word-count bug (words * 1.3) by using tiktoken BPE tokenizer.
Compresses 30 tool test prompts in 2 conditions:
  - LLMLingua-only: compress natural prompt (50% target)
  - TSCG+LLMLingua: compress TSCG prompt (50% target)

Output: data/llmlingua-v2/llmlingua-results-v2.json
"""

import json
import time
import os
import sys
import datetime

# Tiktoken for proper BPE token counting
try:
    import tiktoken
except ImportError:
    print("ERROR: tiktoken not installed. Run: pip install tiktoken")
    sys.exit(1)

try:
    from llmlingua import PromptCompressor
except ImportError:
    print("ERROR: llmlingua not installed. Run: pip install llmlingua")
    sys.exit(1)

import torch

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, '..', 'data')
INPUT_FILE = os.path.join(DATA_DIR, 'llmlingua-input.json')
OUTPUT_DIR = os.path.join(DATA_DIR, 'llmlingua-v2')
OUTPUT_FILE = os.path.join(OUTPUT_DIR, 'llmlingua-results-v2.json')
METADATA_FILE = os.path.join(OUTPUT_DIR, 'RUN_METADATA.json')

TARGET_RATIO = 0.5  # Keep 50% of tokens

# Use cl100k_base (Claude/GPT-4 tokenizer) for accurate BPE counting
ENCODER = tiktoken.get_encoding("cl100k_base")


def count_tokens_bpe(text: str) -> int:
    """Accurate BPE token count using tiktoken cl100k_base."""
    return len(ENCODER.encode(text))


def count_tokens_word_estimate(text: str) -> int:
    """Old word-count estimate for comparison (the buggy method)."""
    words = text.split()
    return max(1, round(len(words) * 1.3))


def main():
    start_time = datetime.datetime.utcnow()

    # Check GPU
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        print(f"CUDA available: {gpu_name}")
        device = "cuda"
    else:
        print("WARNING: CUDA not available, using CPU (will be slower)")
        device = "cpu"
        gpu_name = "CPU"

    # Load input
    print(f"Loading {INPUT_FILE}...")
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        tests = json.load(f)
    print(f"Loaded {len(tests)} test cases")

    # Initialize LLMLingua-2
    print("Initializing LLMLingua-2 (microsoft/llmlingua-2-xlm-roberta-large)...")
    compressor = PromptCompressor(
        model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
        device_map=device,
        use_llmlingua2=True,
    )
    print("LLMLingua-2 initialized successfully")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    results = []
    errors = []

    for i, test in enumerate(tests):
        test_id = test['id']
        category = test['category']
        name = test['name']
        natural_prompt = test['natural_prompt']
        tscg_prompt = test['tscg_prompt']
        expected = test['expected_answer']

        print(f"\n[{i+1}/{len(tests)}] {test_id}: {name} ({category})")

        # Measure tokens with BOTH methods for comparison
        natural_tokens_bpe = count_tokens_bpe(natural_prompt)
        natural_tokens_word = count_tokens_word_estimate(natural_prompt)
        tscg_tokens_bpe = count_tokens_bpe(tscg_prompt)
        tscg_tokens_word = count_tokens_word_estimate(tscg_prompt)

        print(f"  Natural: {natural_tokens_bpe} BPE (was {natural_tokens_word} word-est, delta {natural_tokens_bpe - natural_tokens_word:+d})")
        print(f"  TSCG:    {tscg_tokens_bpe} BPE (was {tscg_tokens_word} word-est, delta {tscg_tokens_bpe - tscg_tokens_word:+d})")

        # --- Condition C: LLMLingua-only (compress natural prompt) ---
        # Use BPE count for target calculation
        target_tokens_natural = max(10, int(natural_tokens_bpe * TARGET_RATIO))

        t0 = time.time()
        try:
            result_natural = compressor.compress_prompt(
                natural_prompt,
                target_token=target_tokens_natural,
                force_tokens=['\n', '?', '.', '!', ',', ':'],
            )
            natural_compressed = result_natural.get('compressed_prompt', natural_prompt)
            natural_compressed_bpe = count_tokens_bpe(natural_compressed)
            natural_compressed_word = count_tokens_word_estimate(natural_compressed)
            natural_time_ms = round((time.time() - t0) * 1000)
            natural_savings_bpe = 1.0 - (natural_compressed_bpe / natural_tokens_bpe) if natural_tokens_bpe > 0 else 0
            print(f"  LLMLingua-only: {natural_tokens_bpe} -> {natural_compressed_bpe} BPE tokens ({natural_savings_bpe*100:.1f}% savings, {natural_time_ms}ms)")
        except Exception as e:
            print(f"  LLMLingua-only FAILED: {e}")
            errors.append({"test_id": test_id, "condition": "llmlingua_only", "error": str(e)})
            natural_compressed = natural_prompt
            natural_compressed_bpe = natural_tokens_bpe
            natural_compressed_word = natural_tokens_word
            natural_time_ms = 0
            natural_savings_bpe = 0

        # --- Condition D: TSCG+LLMLingua (compress TSCG prompt) ---
        target_tokens_tscg = max(5, int(tscg_tokens_bpe * TARGET_RATIO))

        t0 = time.time()
        try:
            result_tscg = compressor.compress_prompt(
                tscg_prompt,
                target_token=target_tokens_tscg,
                force_tokens=['\n', '?', '.', '!', ',', ':', '[', ']'],
            )
            tscg_compressed = result_tscg.get('compressed_prompt', tscg_prompt)
            tscg_compressed_bpe = count_tokens_bpe(tscg_compressed)
            tscg_compressed_word = count_tokens_word_estimate(tscg_compressed)
            tscg_time_ms = round((time.time() - t0) * 1000)
            # Compound savings: relative to original natural prompt
            compound_savings_bpe = 1.0 - (tscg_compressed_bpe / natural_tokens_bpe) if natural_tokens_bpe > 0 else 0
            tscg_only_savings_bpe = 1.0 - (tscg_tokens_bpe / natural_tokens_bpe) if natural_tokens_bpe > 0 else 0
            print(f"  TSCG+LLMLingua: {tscg_tokens_bpe} -> {tscg_compressed_bpe} BPE tokens (compound: {compound_savings_bpe*100:.1f}% savings, {tscg_time_ms}ms)")
        except Exception as e:
            print(f"  TSCG+LLMLingua FAILED: {e}")
            errors.append({"test_id": test_id, "condition": "tscg_llmlingua", "error": str(e)})
            tscg_compressed = tscg_prompt
            tscg_compressed_bpe = tscg_tokens_bpe
            tscg_compressed_word = tscg_tokens_word
            tscg_time_ms = 0
            compound_savings_bpe = 0
            tscg_only_savings_bpe = 0

        results.append({
            'id': test_id,
            'category': category,
            'name': name,
            'expected_answer': expected,
            # Original prompts
            'natural_prompt': natural_prompt,
            'tscg_prompt': tscg_prompt,
            # BPE token counts (CORRECT)
            'natural_tokens_bpe': natural_tokens_bpe,
            'tscg_tokens_bpe': tscg_tokens_bpe,
            # Old word estimates (for comparison/audit)
            'natural_tokens_word_est': natural_tokens_word,
            'tscg_tokens_word_est': tscg_tokens_word,
            # Condition C: LLMLingua-only
            'llmlingua_only_compressed': natural_compressed,
            'llmlingua_only_tokens_bpe': natural_compressed_bpe,
            'llmlingua_only_tokens_word_est': natural_compressed_word,
            'llmlingua_only_savings_bpe': round(natural_savings_bpe, 4),
            'llmlingua_only_time_ms': natural_time_ms,
            # Condition D: TSCG+LLMLingua
            'tscg_llmlingua_compressed': tscg_compressed,
            'tscg_llmlingua_tokens_bpe': tscg_compressed_bpe,
            'tscg_llmlingua_tokens_word_est': tscg_compressed_word,
            'tscg_only_savings_bpe': round(tscg_only_savings_bpe, 4),
            'compound_savings_bpe': round(compound_savings_bpe, 4),
            'tscg_llmlingua_time_ms': tscg_time_ms,
        })

    # Save results
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n{'='*60}")
    print(f"Results saved to {OUTPUT_FILE}")

    # Save metadata
    end_time = datetime.datetime.utcnow()
    metadata = {
        "wave": "2.5.3",
        "description": "LLMLingua-2 Head-to-Head with proper BPE token counting (tiktoken cl100k_base)",
        "startedAt": start_time.isoformat() + "Z",
        "completedAt": end_time.isoformat() + "Z",
        "durationSeconds": round((end_time - start_time).total_seconds(), 1),
        "tokenizer": "tiktoken cl100k_base",
        "llmlingua_model": "microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
        "target_ratio": TARGET_RATIO,
        "device": device,
        "gpu": gpu_name,
        "n_tests": len(tests),
        "n_errors": len(errors),
        "errors": errors,
        "fixes_applied": [
            "Replaced words*1.3 heuristic with tiktoken BPE (cl100k_base)",
            "Both old (word-est) and new (BPE) counts stored for audit",
            "Target token counts now based on BPE counts",
        ],
    }
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved to {METADATA_FILE}")

    # Summary with comparison
    avg_natural_bpe = sum(r['natural_tokens_bpe'] for r in results) / len(results)
    avg_tscg_bpe = sum(r['tscg_tokens_bpe'] for r in results) / len(results)
    avg_llm_only_bpe = sum(r['llmlingua_only_tokens_bpe'] for r in results) / len(results)
    avg_compound_bpe = sum(r['tscg_llmlingua_tokens_bpe'] for r in results) / len(results)

    avg_natural_word = sum(r['natural_tokens_word_est'] for r in results) / len(results)
    avg_tscg_word = sum(r['tscg_tokens_word_est'] for r in results) / len(results)

    print(f"\n{'='*60}")
    print(f"Summary (30 tests) — BPE token counts")
    print(f"{'='*60}")
    print(f"  Natural (baseline):   {avg_natural_bpe:.0f} BPE (was {avg_natural_word:.0f} word-est)")
    print(f"  TSCG-only:            {avg_tscg_bpe:.0f} BPE ({(1-avg_tscg_bpe/avg_natural_bpe)*100:.1f}% savings)")
    print(f"                        (was {avg_tscg_word:.0f} word-est = {(1-avg_tscg_word/avg_natural_word)*100:.1f}% inflated savings)")
    print(f"  LLMLingua-only:       {avg_llm_only_bpe:.0f} BPE ({(1-avg_llm_only_bpe/avg_natural_bpe)*100:.1f}% savings)")
    print(f"  TSCG+LLMLingua:       {avg_compound_bpe:.0f} BPE ({(1-avg_compound_bpe/avg_natural_bpe)*100:.1f}% compound savings)")
    print(f"\nDuration: {(end_time - start_time).total_seconds():.1f}s")


if __name__ == '__main__':
    main()
