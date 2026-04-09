"""
Wave 2.5.3: Accuracy Evaluation with Plan 5.1 Standards.

Sends 4 conditions x 30 tests = 120 prompts to Claude Sonnet 4.
Uses tiktoken for token counting. Proper retry logic and metadata.

Input: data/llmlingua-v2/llmlingua-results-v2.json
Output: data/llmlingua-v2/accuracy-results-v2.json
"""

import json
import time
import os
import sys
import re
import datetime

try:
    import anthropic
except ImportError:
    print("ERROR: anthropic not installed. Run: pip install anthropic")
    sys.exit(1)

try:
    import tiktoken
except ImportError:
    print("ERROR: tiktoken not installed. Run: pip install tiktoken")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'llmlingua-v2')
INPUT_FILE = os.path.join(DATA_DIR, 'llmlingua-results-v2.json')
OUTPUT_FILE = os.path.join(DATA_DIR, 'accuracy-results-v2.json')
ANALYSIS_FILE = os.path.join(DATA_DIR, 'llmlingua-analysis-v2.json')

# Read API key from environment or file
API_KEY_FILE = os.path.join(SCRIPT_DIR, '..', 'PLAN 5.1', 'API Keys', 'TSCG API KEY.txt')

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 150
DELAY_BETWEEN_CALLS = 0.5  # seconds
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds

ENCODER = tiktoken.get_encoding("cl100k_base")


def get_api_key():
    """Get API key from environment or file."""
    key = os.environ.get('ANTHROPIC_API_KEY')
    if key:
        return key
    if os.path.exists(API_KEY_FILE):
        with open(API_KEY_FILE, 'r') as f:
            content = f.read()
        # Extract Anthropic key (starts with sk-ant-)
        for line in content.split('\n'):
            line = line.strip()
            if line.startswith('sk-ant-'):
                return line
    print("ERROR: No API key found. Set ANTHROPIC_API_KEY or check API key file.")
    sys.exit(1)


def count_tokens_bpe(text: str) -> int:
    return len(ENCODER.encode(text))


def check_answer(response_text: str, expected: str) -> bool:
    """Check if the response contains the expected tool name(s)."""
    response_lower = response_text.lower().strip()
    expected_lower = expected.lower().strip()

    expected_tools = [t.strip() for t in expected_lower.split(',')]

    if expected_lower == 'none':
        return 'none' in response_lower

    return all(tool in response_lower for tool in expected_tools)


def call_claude(client, prompt: str) -> tuple:
    """Call Claude API with retry logic. Returns (response_text, latency_ms, input_tokens)."""
    for attempt in range(MAX_RETRIES):
        t0 = time.time()
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text if response.content else ""
            latency = round((time.time() - t0) * 1000)
            input_tokens = response.usage.input_tokens if hasattr(response, 'usage') else 0
            return text, latency, input_tokens
        except Exception as e:
            latency = round((time.time() - t0) * 1000)
            error_str = str(e)
            if 'rate_limit' in error_str.lower() or '429' in error_str:
                wait = RETRY_DELAY * (attempt + 1)
                print(f"\n    Rate limited, waiting {wait}s (attempt {attempt+1}/{MAX_RETRIES})...")
                time.sleep(wait)
                continue
            if attempt < MAX_RETRIES - 1:
                print(f"\n    Error: {error_str[:100]}, retrying...")
                time.sleep(RETRY_DELAY)
                continue
            return f"ERROR: {e}", latency, 0


def main():
    start_time = datetime.datetime.utcnow()

    if not os.path.exists(INPUT_FILE):
        print(f"ERROR: {INPUT_FILE} not found. Run llmlingua_compress_v2.py first.")
        sys.exit(1)

    print(f"Loading {INPUT_FILE}...")
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        tests = json.load(f)
    print(f"Loaded {len(tests)} test cases")

    api_key = get_api_key()
    client = anthropic.Anthropic(api_key=api_key)
    print(f"Using model: {MODEL}")

    conditions = [
        ('natural', lambda t: t['natural_prompt'], 'Natural (baseline)'),
        ('tscg_only', lambda t: t['tscg_prompt'], 'TSCG-only'),
        ('llmlingua_only', lambda t: t['llmlingua_only_compressed'], 'LLMLingua-only'),
        ('tscg_llmlingua', lambda t: t['tscg_llmlingua_compressed'], 'TSCG+LLMLingua'),
    ]

    results = []
    total_calls = len(tests) * len(conditions)
    call_count = 0
    api_errors = []

    for condition_key, get_prompt, condition_name in conditions:
        print(f"\n{'='*60}")
        print(f"Condition: {condition_name}")
        print(f"{'='*60}")

        correct = 0
        for i, test in enumerate(tests):
            call_count += 1
            test_id = test['id']
            expected = test['expected_answer']
            prompt = get_prompt(test)
            prompt_tokens_bpe = count_tokens_bpe(prompt)

            print(f"  [{call_count}/{total_calls}] {test_id} ({condition_name}, {prompt_tokens_bpe} tok)...", end=" ", flush=True)

            response_text, latency, api_input_tokens = call_claude(client, prompt)
            is_correct = check_answer(response_text, expected)
            correct += is_correct

            status = "OK" if is_correct else "FAIL"
            print(f"{status} ({latency}ms) -> {response_text[:80]}")

            results.append({
                'test_id': test_id,
                'category': test['category'],
                'name': test['name'],
                'condition': condition_key,
                'condition_name': condition_name,
                'expected': expected,
                'response': response_text,
                'correct': is_correct,
                'latency_ms': latency,
                'prompt_tokens_bpe': prompt_tokens_bpe,
                'api_input_tokens': api_input_tokens,
            })

            if response_text.startswith("ERROR:"):
                api_errors.append({"test_id": test_id, "condition": condition_key, "error": response_text})

            time.sleep(DELAY_BETWEEN_CALLS)

        accuracy = correct / len(tests) * 100
        print(f"\n  {condition_name}: {correct}/{len(tests)} = {accuracy:.1f}%")

    # Save raw results
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nResults saved to {OUTPUT_FILE}")

    # Generate analysis
    end_time = datetime.datetime.utcnow()
    analysis = generate_analysis(tests, results, start_time, end_time, api_errors)
    with open(ANALYSIS_FILE, 'w', encoding='utf-8') as f:
        json.dump(analysis, f, indent=2, ensure_ascii=False)
    print(f"Analysis saved to {ANALYSIS_FILE}")

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY (Wave 2.5.3 — BPE-corrected)")
    print(f"{'='*60}")
    for condition_key, _, condition_name in conditions:
        cond_results = [r for r in results if r['condition'] == condition_key]
        correct = sum(1 for r in cond_results if r['correct'])
        total = len(cond_results)
        accuracy = correct / total * 100 if total > 0 else 0
        avg_latency = sum(r['latency_ms'] for r in cond_results) / total if total > 0 else 0
        avg_tokens = sum(r['prompt_tokens_bpe'] for r in cond_results) / total if total > 0 else 0
        print(f"  {condition_name:20s}: {correct}/{total} = {accuracy:.1f}% (avg {avg_tokens:.0f} BPE tok, {avg_latency:.0f}ms)")


def generate_analysis(tests, results, start_time, end_time, errors):
    """Generate structured analysis matching Plan 5.0 format but with BPE counts."""
    conditions_map = {}
    categories_map = {}

    for r in results:
        cond = r['condition']
        cat = r['category']

        if cond not in conditions_map:
            conditions_map[cond] = {'correct': 0, 'total': 0, 'tokens': [], 'latencies': []}
        conditions_map[cond]['total'] += 1
        if r['correct']:
            conditions_map[cond]['correct'] += 1
        conditions_map[cond]['tokens'].append(r['prompt_tokens_bpe'])
        conditions_map[cond]['latencies'].append(r['latency_ms'])

        cat_key = f"{cat}_{cond}"
        if cat_key not in categories_map:
            categories_map[cat_key] = {'category': cat, 'condition': cond, 'correct': 0, 'total': 0, 'tokens': []}
        categories_map[cat_key]['total'] += 1
        if r['correct']:
            categories_map[cat_key]['correct'] += 1
        categories_map[cat_key]['tokens'].append(r['prompt_tokens_bpe'])

    condition_stats = {}
    for cond, data in conditions_map.items():
        avg_tokens = sum(data['tokens']) / len(data['tokens']) if data['tokens'] else 0
        avg_latency = sum(data['latencies']) / len(data['latencies']) if data['latencies'] else 0
        nat_avg = sum(conditions_map.get('natural', {}).get('tokens', [0])) / max(1, len(conditions_map.get('natural', {}).get('tokens', [1])))
        savings = 1.0 - (avg_tokens / nat_avg) if nat_avg > 0 else 0
        condition_stats[cond] = {
            'correct': data['correct'],
            'total': data['total'],
            'accuracy': round(data['correct'] / data['total'], 4) if data['total'] > 0 else 0,
            'avg_tokens_bpe': round(avg_tokens, 1),
            'avg_savings_bpe': round(savings, 4),
            'avg_latency_ms': round(avg_latency, 1),
        }

    # Category breakdown
    category_stats = {}
    for cat_key, data in categories_map.items():
        cat = data['category']
        cond = data['condition']
        if cat not in category_stats:
            category_stats[cat] = {}
        avg_tok = sum(data['tokens']) / len(data['tokens']) if data['tokens'] else 0
        category_stats[cat][cond] = {
            'correct': data['correct'],
            'total': data['total'],
            'accuracy': round(data['correct'] / data['total'], 4) if data['total'] > 0 else 0,
            'avg_tokens_bpe': round(avg_tok, 1),
        }

    # Comparison with v1 (Plan 5.0)
    v1_comparison = {
        "note": "Comparing BPE-measured (v2) vs word-estimated (v1) token counts",
        "v1_tscg_savings_word_est": 0.9058,
        "v1_llmlingua_savings_word_est": 0.6062,
        "v2_tscg_savings_bpe": condition_stats.get('tscg_only', {}).get('avg_savings_bpe', 0),
        "v2_llmlingua_savings_bpe": condition_stats.get('llmlingua_only', {}).get('avg_savings_bpe', 0),
    }

    return {
        "wave": "2.5.3",
        "description": "LLMLingua-2 Head-to-Head with BPE-corrected token counting",
        "tokenizer": "tiktoken cl100k_base",
        "model": MODEL,
        "startedAt": start_time.isoformat() + "Z",
        "completedAt": end_time.isoformat() + "Z",
        "n_tests": len(tests),
        "n_conditions": 4,
        "total_api_calls": len(results),
        "n_errors": len(errors),
        "condition_stats": condition_stats,
        "category_stats": category_stats,
        "v1_comparison": v1_comparison,
        "errors": errors,
    }


if __name__ == '__main__':
    main()
