export interface PromptProgress {
  total: number;
  processed: number;
  cache?: number;
  time_ms?: number;
}

export interface PromptProgressView {
  uncachedTotal: number;
  uncachedProcessed: number;
  fraction: number;
  percent: number;
  etaMs?: number;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parsePromptProgress(value: unknown): PromptProgress | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (!finiteNonNegative(record.total) || !finiteNonNegative(record.processed)) return undefined;
  if (record.cache !== undefined && !finiteNonNegative(record.cache)) return undefined;
  if (record.time_ms !== undefined && !finiteNonNegative(record.time_ms)) return undefined;
  return {
    total: record.total,
    processed: record.processed,
    ...(record.cache !== undefined ? { cache: record.cache as number } : {}),
    ...(record.time_ms !== undefined ? { time_ms: record.time_ms as number } : {}),
  };
}

export function calculatePromptProgress(progress: PromptProgress): PromptProgressView {
  const cache = Math.max(0, progress.cache ?? 0);
  const uncachedTotal = Math.max(0, progress.total - cache);
  const uncachedProcessed = Math.min(uncachedTotal, Math.max(0, progress.processed - cache));
  const fraction = uncachedTotal === 0 ? 1 : uncachedProcessed / uncachedTotal;
  let etaMs: number | undefined;
  if (progress.time_ms !== undefined && progress.time_ms > 0 && uncachedProcessed > 0 && uncachedProcessed < uncachedTotal) {
    etaMs = (uncachedTotal - uncachedProcessed) / (uncachedProcessed / progress.time_ms);
  }
  return { uncachedTotal, uncachedProcessed, fraction, percent: fraction * 100, ...(etaMs !== undefined ? { etaMs } : {}) };
}

export function formatPromptProgress(progress: PromptProgress): string {
  const view = calculatePromptProgress(progress);
  const eta = view.etaMs === undefined ? "" : ` · ETA ${Math.max(1, Math.ceil(view.etaMs / 1000))}s`;
  return `Prompt ${Math.round(view.percent)}% · ${view.uncachedProcessed}/${view.uncachedTotal} uncached tokens${eta}`;
}
