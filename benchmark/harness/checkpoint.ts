/**
 * TAB Checkpoint Manager
 *
 * Provides checkpoint/resume functionality for long benchmark runs.
 * Saves completed TaskResult entries to a JSON file on disk.
 * On restart, previously completed tasks are skipped to avoid redundant API calls.
 *
 * Checkpoint file format: JSON array of TaskResult objects.
 * Saves are atomic (write to temp file, then rename) to prevent corruption.
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { TaskResult } from './types.js';

export class CheckpointManager {
  private readonly filepath: string;
  private results: TaskResult[] = [];
  private completedKeys: Set<string> = new Set();
  private dirty = false;
  private saveCounter = 0;

  /** How many results between auto-saves */
  private readonly autoSaveInterval: number;

  constructor(filepath: string, autoSaveInterval = 10) {
    this.filepath = filepath;
    this.autoSaveInterval = autoSaveInterval;

    // Ensure directory exists
    const dir = dirname(filepath);
    mkdirSync(dir, { recursive: true });

    // Load existing checkpoint if present
    if (existsSync(filepath)) {
      this.loadFromDisk();
    }
  }

  /**
   * Generate a unique key for a task execution.
   * Format: taskId::model::condition::run
   */
  private static makeKey(
    taskId: string,
    model: string,
    condition: string,
    run: number,
  ): string {
    return `${taskId}::${model}::${condition}::${run}`;
  }

  /**
   * Check if a specific task execution has already been completed.
   */
  isCompleted(taskId: string, model: string, condition: string, run: number): boolean {
    return this.completedKeys.has(
      CheckpointManager.makeKey(taskId, model, condition, run),
    );
  }

  /**
   * Record a completed task result.
   * Triggers auto-save every `autoSaveInterval` results.
   */
  save(result: TaskResult): void {
    const key = CheckpointManager.makeKey(
      result.task_id,
      result.model,
      result.condition,
      result.run,
    );

    // Avoid duplicates
    if (this.completedKeys.has(key)) {
      // Update existing result
      const idx = this.results.findIndex(
        r =>
          r.task_id === result.task_id &&
          r.model === result.model &&
          r.condition === result.condition &&
          r.run === result.run,
      );
      if (idx >= 0) {
        this.results[idx] = result;
      }
    } else {
      this.results.push(result);
      this.completedKeys.add(key);
    }

    this.dirty = true;
    this.saveCounter++;

    // Auto-save every N results
    if (this.saveCounter % this.autoSaveInterval === 0) {
      this.flush();
    }
  }

  /**
   * Load all previously saved results.
   */
  load(): TaskResult[] {
    return [...this.results];
  }

  /**
   * Get the number of completed results.
   */
  get completedCount(): number {
    return this.results.length;
  }

  /**
   * Force write to disk if there are unsaved results.
   * Uses atomic write (temp file + rename) to prevent corruption.
   */
  flush(): void {
    if (!this.dirty) return;

    const tempPath = this.filepath + '.tmp';
    try {
      writeFileSync(tempPath, JSON.stringify(this.results, null, 2), 'utf-8');
      renameSync(tempPath, this.filepath);
      this.dirty = false;
    } catch (err) {
      // If rename fails (Windows file locking), try direct write
      try {
        writeFileSync(this.filepath, JSON.stringify(this.results, null, 2), 'utf-8');
        this.dirty = false;
      } catch (innerErr) {
        console.error(
          `[CheckpointManager] Failed to save checkpoint: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`,
        );
      }
    }
  }

  /**
   * Load checkpoint data from disk.
   */
  private loadFromDisk(): void {
    try {
      const raw = readFileSync(this.filepath, 'utf-8');
      const data = JSON.parse(raw) as TaskResult[];

      if (!Array.isArray(data)) {
        console.warn('[CheckpointManager] Invalid checkpoint format, starting fresh');
        return;
      }

      this.results = data;
      for (const result of data) {
        const key = CheckpointManager.makeKey(
          result.task_id,
          result.model,
          result.condition,
          result.run,
        );
        this.completedKeys.add(key);
      }

      console.log(
        `[CheckpointManager] Loaded ${data.length} completed results from checkpoint`,
      );
    } catch (err) {
      console.warn(
        `[CheckpointManager] Could not load checkpoint: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
