"""
Accuracy Evaluation Script for TSCG + LLMLingua Complementary Testing.

Sends 4 conditions x 30 tests = 120 prompts to Claude Sonnet 4.
Compares responses against expected answers.

Input: data/llmlingua-results.json (from llmlingua_compress.py)
Output: data/accuracy-results.json
"""

import json
import time
import os
import sys
import re

try:
    import anthropic
except ImportError:
    print("ERROR: anthropic not installed. Run: pip install anthropic")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, '..', 'data')
INPUT_FILE = os.path.join(DATA_DIR, 'llmlingua-results.json')
OUTPUT_FILE = os.path.join(DATA_DIR, 'accuracy-results.json')

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 150

# Rate limiting
DELAY_BETWEEN_CALLS = 0.5  # seconds


def check_answer(response_text: str, expected: str) -> bool:
    """Check if the response contains the expected tool name(s)."""
    response_lower = response_text.lower().strip()
    expected_lower = expected.lower().strip()

    # Handle multi-tool expected answers (comma-separated)
    expected_tools = [t.strip() for t in expected_lower.split(',')]

    if expected_lower == 'none':
        return 'none' in response_lower

    # All expected tools must appear in the response
    return all(tool in response_lower for tool in expected_tools)


def call_claude(client: anthropic.Anthropic, prompt: str) -> tuple:
    """Call Claude API, return (response_text, latency_ms)."""
    t0 = time.time()
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text if response.content else ""
        latency = round((time.time() - t0) * 1000)
        return text, latency
    except Exception as e:
        latency = round((time.time() - t0) * 1000)
        return f"ERROR: {e}", latency


def main():
    # Load compression results
    print(f"Loading {INPUT_FILE}...")
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        tests = json.load(f)
    print(f"Loaded {len(tests)} test cases")

    client = anthropic.Anthropic(api_key=API_KEY)
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

            print(f"  [{call_count}/{total_calls}] {test_id} ({condition_name})...", end=" ", flush=True)

            response_text, latency = call_claude(client, prompt)
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
            })

            time.sleep(DELAY_BETWEEN_CALLS)

        accuracy = correct / len(tests) * 100
        print(f"\n  {condition_name}: {correct}/{len(tests)} = {accuracy:.1f}%")

    # Save results
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n{'='*60}")
    print(f"Results saved to {OUTPUT_FILE}")

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for condition_key, _, condition_name in conditions:
        cond_results = [r for r in results if r['condition'] == condition_key]
        correct = sum(1 for r in cond_results if r['correct'])
        total = len(cond_results)
        accuracy = correct / total * 100 if total > 0 else 0
        avg_latency = sum(r['latency_ms'] for r in cond_results) / total if total > 0 else 0
        print(f"  {condition_name:20s}: {correct}/{total} = {accuracy:.1f}% (avg latency: {avg_latency:.0f}ms)")


if __name__ == '__main__':
    main()
