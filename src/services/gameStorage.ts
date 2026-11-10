import { canonicalPuzzle, publicPuzzle, keysAre, verifyDefinition } from '../core/definition.ts'
export { canonicalPuzzle } from '../core/definition.ts'
import { validElapsed, validProgress, type GameProgress } from '../core/progress.ts'
import { type PuzzleDefinition } from '../core/types.ts'
export const SESSION_KEY = 'calcudoku.session.v1'
export const BEST_KEY = 'calcudoku.bests.v1'
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface SavedSession { version: 1; puzzle: PuzzleDefinition; progress: GameProgress }
type SessionRead = { status: 'restored' | 'pending'; session: SavedSession } | { status: 'empty' | 'invalid' | 'unavailable' }
interface BestEntry { problemId: string; elapsedMs: number }
interface BestData { version: 1; records: BestEntry[] }
export interface BestRead { status: 'ok' | 'invalid' | 'unavailable'; value: number | null }
export interface BestWrite { status: 'updated' | 'unchanged' | 'excluded' | 'unavailable'; value: number | null }
function readBestData(text: string | null): BestData | null {
  if (text === null) return { version: 1, records: [] }
  if (text.length > 10_000_000) return null
  const raw: unknown = JSON.parse(text)
  if (!raw || typeof raw !== 'object' || !keysAre(raw, ['version', 'records'])) return null
  const data = raw as Record<string, unknown>
  if (data.version !== 1 || !Array.isArray(data.records)) return null
  const seen = new Set<string>()
  for (const item of data.records) {
    if (!item || typeof item !== 'object' || !keysAre(item, ['problemId', 'elapsedMs'])) return null
    const record = item as Record<string, unknown>
    if (typeof record.problemId !== 'string' || !record.problemId || record.problemId.length > 16000 || !validElapsed(record.elapsedMs) || seen.has(record.problemId)) return null
    seen.add(record.problemId)
  }
  return data as unknown as BestData
}
export function createGameStorage(provider: () => StoragePort = () => globalThis.localStorage, verify = verifyDefinition) {
  function loadSession(deferLarge = false): SessionRead {
    let text: string | null
    try { text = provider().getItem(SESSION_KEY) } catch { return { status: 'unavailable' } }
    if (text === null) return { status: 'empty' }
    try {
      if (text.length > 64_000) return { status: 'invalid' }
      const raw: unknown = JSON.parse(text)
      if (!raw || typeof raw !== 'object' || !keysAre(raw, ['version', 'puzzle', 'progress'])) return { status: 'invalid' }
      const data = raw as Record<string, unknown>
      if (data.version !== 1 || !canonicalPuzzle(data.puzzle) || !validProgress(data.puzzle, data.progress)) return { status: 'invalid' }
      if (deferLarge && data.puzzle.size > 5) return { status: 'pending', session: { version: 1, puzzle: publicPuzzle(data.puzzle), progress: data.progress } }
      if (!verify(data.puzzle)) return { status: 'invalid' }
      return { status: 'restored', session: { version: 1, puzzle: publicPuzzle(data.puzzle), progress: data.progress } }
    } catch { return { status: 'invalid' } }
  }
  function saveSession(puzzle: PuzzleDefinition, progress: GameProgress): boolean {
    try {
      // Whitelist fields even if typed arguments contain hidden runtime properties.
      const clean = publicPuzzle(puzzle)
      const safe: GameProgress = { values: [...progress.values], elapsedMs: progress.elapsedMs, status: progress.status, answerUsed: progress.answerUsed }
      if (!canonicalPuzzle(clean) || !validProgress(clean, safe)) return false
      provider().setItem(SESSION_KEY, JSON.stringify({ version: 1, puzzle: clean, progress: safe } satisfies SavedSession))
      return true
    } catch { return false }
  }
  function loadBest(problemId: string): BestRead {
    let text: string | null
    try { text = provider().getItem(BEST_KEY) } catch { return { status: 'unavailable', value: null } }
    try {
      const data = readBestData(text)
      if (!data) return { status: 'invalid', value: null }
      return { status: 'ok', value: data.records.find(r => r.problemId === problemId)?.elapsedMs ?? null }
    } catch { return { status: 'invalid', value: null } }
  }
  function recordBest(problemId: string, elapsedMs: number, answerUsed: boolean): BestWrite {
    if (answerUsed || !validElapsed(elapsedMs) || !problemId || problemId.length > 16000) return { status: 'excluded', value: null }
    try {
      const storage = provider(), text = storage.getItem(BEST_KEY)
      let data: BestData
      try { data = readBestData(text) ?? { version: 1, records: [] } } catch { data = { version: 1, records: [] } }
      const record = data.records.find(r => r.problemId === problemId)
      if (record && record.elapsedMs <= elapsedMs) return { status: 'unchanged', value: record.elapsedMs }
      const old = record?.elapsedMs ?? null
      if (record) record.elapsedMs = elapsedMs
      else data.records.push({ problemId, elapsedMs })
      const serialized = JSON.stringify(data)
      if (serialized.length > 10_000_000) return { status: 'unavailable', value: old }
      try { storage.setItem(BEST_KEY, serialized) } catch { return { status: 'unavailable', value: old } }
      return { status: 'updated', value: elapsedMs }
    } catch { return { status: 'unavailable', value: null } }
  }
  return { loadSession, saveSession, loadBest, recordBest }
}
export type GameStorage = ReturnType<typeof createGameStorage>
