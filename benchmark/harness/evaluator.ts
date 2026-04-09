/**
 * TAB Evaluator -- Scoring Engine
 *
 * Implements the TAB scoring rules for evaluating LLM tool-calling accuracy.
 *
 * Scoring rules:
 * - tool_selection: 1.0 if name matches, 0.0 otherwise
 * - parameter_f1: key F1 x value accuracy (case-insensitive strings, +/-5% numbers, exact enums)
 * - overall (single_tool): tool_selection * 0.6 + parameter_f1 * 0.4
 * - overall (multi_tool): sequence_lcs * mean(param_f1s)
 * - overall (no_tool): 1.0 if no tool called, 0.0 otherwise
 * - overall (GSM8K): 1.0 if number matches
 */

import type { ParsedResponse, Scores, GroundTruth } from './types.js';

export class TABEvaluator {
  /**
   * Score a parsed response against ground truth.
   * Dispatches to the appropriate scoring method based on ground truth type.
   */
  score(parsed: ParsedResponse, groundTruth: GroundTruth): Scores {
    switch (groundTruth.type) {
      case 'single_tool':
        return this.scoreSingleTool(parsed, groundTruth);
      case 'multi_tool':
        return this.scoreMultiTool(parsed, groundTruth);
      case 'no_tool':
        return this.scoreNoTool(parsed);
      case 'gsm8k':
        return this.scoreGSM8K(parsed, groundTruth);
      default: {
        const _exhaustive: never = groundTruth.type;
        throw new Error(`Unknown ground truth type: ${_exhaustive}`);
      }
    }
  }

  /**
   * Score a single-tool response.
   *
   * overall = tool_selection * 0.6 + parameter_f1 * 0.4
   */
  private scoreSingleTool(parsed: ParsedResponse, gt: GroundTruth): Scores {
    const toolCall = parsed.parsed_tool_call;

    // Tool selection: exact name match
    const toolSelectionAccuracy =
      toolCall && gt.tool_name
        ? toolCall.name.toLowerCase() === gt.tool_name.toLowerCase()
          ? 1.0
          : 0.0
        : 0.0;

    // Parameter F1: only computed if tool was correct
    let parameterF1 = 0.0;
    if (toolSelectionAccuracy === 1.0 && toolCall && gt.parameters) {
      parameterF1 = this.computeParameterF1(
        toolCall.arguments,
        gt.parameters,
      );
    }

    const overall = toolSelectionAccuracy * 0.6 + parameterF1 * 0.4;

    return {
      tool_selection_accuracy: toolSelectionAccuracy,
      parameter_f1: parameterF1,
      overall,
    };
  }

  /**
   * Score a multi-tool (sequence) response.
   *
   * overall = sequence_lcs * mean(param_f1s)
   *
   * sequence_lcs measures how well the predicted tool order matches expected.
   * param_f1s is the mean parameter F1 across matched tools.
   */
  private scoreMultiTool(parsed: ParsedResponse, gt: GroundTruth): Scores {
    const predictedSeq = parsed.parsed_sequence ?? [];
    const expectedSeq = gt.sequence ?? [];

    if (expectedSeq.length === 0) {
      // Edge case: empty expected sequence
      return {
        tool_selection_accuracy: predictedSeq.length === 0 ? 1.0 : 0.0,
        parameter_f1: 0.0,
        overall: predictedSeq.length === 0 ? 1.0 : 0.0,
      };
    }

    // Extract tool name sequences
    const predictedNames = predictedSeq.map(t => t.name.toLowerCase());
    const expectedNames = expectedSeq.map(t => t.name.toLowerCase());

    // Compute LCS-based sequence accuracy
    const sequenceLCS = this.computeSequenceLCS(predictedNames, expectedNames);

    // Tool selection accuracy: fraction of expected tools that appear in predicted
    const matchedTools = expectedNames.filter(n => predictedNames.includes(n));
    const toolSelectionAccuracy = matchedTools.length / expectedNames.length;

    // Compute parameter F1 for each matched tool pair
    const paramF1s: number[] = [];
    for (const expected of expectedSeq) {
      const predicted = predictedSeq.find(
        p => p.name.toLowerCase() === expected.name.toLowerCase()
      );
      if (predicted && expected.parameters) {
        paramF1s.push(
          this.computeParameterF1(predicted.arguments, expected.parameters)
        );
      } else if (predicted && !expected.parameters) {
        // No parameters expected, just tool match
        paramF1s.push(1.0);
      }
      // If tool not found in predicted, it doesn't contribute to param_f1 mean
    }

    const meanParamF1 =
      paramF1s.length > 0
        ? paramF1s.reduce((a, b) => a + b, 0) / paramF1s.length
        : 0.0;

    const overall = sequenceLCS * meanParamF1;

    return {
      tool_selection_accuracy: toolSelectionAccuracy,
      parameter_f1: meanParamF1,
      overall,
    };
  }

  /**
   * Score a no-tool response.
   *
   * overall = 1.0 if model correctly refrained from calling any tool.
   */
  private scoreNoTool(parsed: ParsedResponse): Scores {
    const noToolCalled =
      !parsed.parsed_tool_call && (!parsed.parsed_sequence || parsed.parsed_sequence.length === 0);

    return {
      tool_selection_accuracy: noToolCalled ? 1.0 : 0.0,
      parameter_f1: noToolCalled ? 1.0 : 0.0,
      overall: noToolCalled ? 1.0 : 0.0,
      no_tool_correct: noToolCalled,
    };
  }

  /**
   * Score a GSM8K math reasoning response.
   *
   * overall = 1.0 if the extracted number matches the expected answer.
   */
  private scoreGSM8K(parsed: ParsedResponse, gt: GroundTruth): Scores {
    const extractedNumber = this.extractNumber(parsed.raw_output);
    const expectedAnswer = gt.answer;

    const correct =
      extractedNumber !== null &&
      expectedAnswer !== undefined &&
      Math.abs(extractedNumber - expectedAnswer) < 0.01;

    return {
      tool_selection_accuracy: 0.0, // Not applicable for GSM8K
      parameter_f1: 0.0, // Not applicable for GSM8K
      overall: correct ? 1.0 : 0.0,
      gsm8k_correct: correct,
    };
  }

  /**
   * Compute Parameter F1 score.
   *
   * For each expected parameter key:
   * - Check if key exists in predicted (contributes to precision/recall)
   * - If key exists, check value match:
   *   - Strings: case-insensitive comparison
   *   - Numbers: +/- 5% tolerance
   *   - Enums: exact match (case-insensitive)
   *   - Arrays/objects: deep equality
   *
   * F1 = 2 * (precision * recall) / (precision + recall)
   * where precision = correct_keys / predicted_keys
   *       recall = correct_keys / expected_keys
   * Weighted by value accuracy.
   */
  computeParameterF1(
    predicted: Record<string, unknown>,
    expected: Record<string, unknown>,
  ): number {
    const predictedKeys = new Set(Object.keys(predicted));
    const expectedKeys = new Set(Object.keys(expected));

    if (expectedKeys.size === 0 && predictedKeys.size === 0) {
      return 1.0; // Both empty = perfect match
    }
    if (expectedKeys.size === 0) {
      return 0.0; // Predicted extra keys with nothing expected
    }

    // Count true positives (key present AND value matches)
    let truePositives = 0;
    for (const key of expectedKeys) {
      if (predictedKeys.has(key)) {
        const valueMatch = this.valuesMatch(predicted[key], expected[key]);
        if (valueMatch) {
          truePositives++;
        }
      }
    }

    // Precision: correct out of predicted
    const precision = predictedKeys.size > 0 ? truePositives / predictedKeys.size : 0;

    // Recall: correct out of expected
    const recall = expectedKeys.size > 0 ? truePositives / expectedKeys.size : 0;

    // F1
    if (precision + recall === 0) return 0.0;
    return (2 * precision * recall) / (precision + recall);
  }

  /**
   * Compute Longest Common Subsequence ratio for tool sequences.
   *
   * Returns LCS length / max(predicted.length, expected.length).
   * This measures how well the tool calling order is preserved.
   */
  computeSequenceLCS(predicted: string[], expected: string[]): number {
    const m = predicted.length;
    const n = expected.length;

    if (m === 0 && n === 0) return 1.0;
    if (m === 0 || n === 0) return 0.0;

    // Standard LCS DP
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array.from({ length: n + 1 }, () => 0)
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (predicted[i - 1] === expected[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const lcsLength = dp[m][n];
    // Normalize by the longer sequence
    return lcsLength / Math.max(m, n);
  }

  /**
   * Compare two values according to TAB scoring rules:
   * - Strings: case-insensitive
   * - Numbers: +/- 5% tolerance
   * - Booleans: exact match
   * - Arrays: element-wise deep equality
   * - Objects: recursive key/value match
   * - null/undefined: match if both are null/undefined
   */
  private valuesMatch(predicted: unknown, expected: unknown): boolean {
    // Handle null/undefined
    if (predicted == null && expected == null) return true;
    if (predicted == null || expected == null) return false;

    // String comparison: case-insensitive
    if (typeof expected === 'string' && typeof predicted === 'string') {
      return predicted.toLowerCase().trim() === expected.toLowerCase().trim();
    }

    // Number comparison: +/- 5% tolerance
    if (typeof expected === 'number' && typeof predicted === 'number') {
      if (expected === 0) return Math.abs(predicted) < 0.01;
      return Math.abs(predicted - expected) / Math.abs(expected) <= 0.05;
    }

    // If predicted is a string that looks like a number and expected is number
    if (typeof expected === 'number' && typeof predicted === 'string') {
      const parsed = parseFloat(predicted);
      if (!isNaN(parsed)) {
        if (expected === 0) return Math.abs(parsed) < 0.01;
        return Math.abs(parsed - expected) / Math.abs(expected) <= 0.05;
      }
      return false;
    }

    // Boolean comparison: exact
    if (typeof expected === 'boolean' && typeof predicted === 'boolean') {
      return predicted === expected;
    }

    // Array comparison: element-wise
    if (Array.isArray(expected) && Array.isArray(predicted)) {
      if (predicted.length !== expected.length) return false;
      return expected.every((val, idx) => this.valuesMatch(predicted[idx], val));
    }

    // Object comparison: recursive
    if (
      typeof expected === 'object' &&
      typeof predicted === 'object' &&
      !Array.isArray(expected) &&
      !Array.isArray(predicted)
    ) {
      const expObj = expected as Record<string, unknown>;
      const predObj = predicted as Record<string, unknown>;
      const expKeys = Object.keys(expObj);
      const predKeys = Object.keys(predObj);
      if (expKeys.length !== predKeys.length) return false;
      return expKeys.every(key => this.valuesMatch(predObj[key], expObj[key]));
    }

    // Fallback: strict equality
    return predicted === expected;
  }

  /**
   * Extract the last number from a text response.
   * Used for GSM8K scoring where the answer is typically the last number.
   * Handles comma-separated numbers (e.g., "1,234") and negative numbers.
   */
  private extractNumber(text: string): number | null {
    // Remove commas from numbers (e.g., "1,234" -> "1234")
    const cleaned = text.replace(/(\d),(\d)/g, '$1$2');

    // Find all numbers (including negative and decimal)
    const matches = cleaned.match(/-?\d+\.?\d*/g);
    if (!matches || matches.length === 0) return null;

    // Return the last number found (GSM8K convention)
    const lastMatch = matches[matches.length - 1];
    const parsed = parseFloat(lastMatch);
    return isNaN(parsed) ? null : parsed;
  }
}
