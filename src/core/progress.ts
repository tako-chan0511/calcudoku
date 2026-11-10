import { isComplete } from './constraints.ts'
import type { CellValue, PuzzleDefinition } from './types.ts'
export type GameStatus = 'ready' | 'playing' | 'cleared'
export interface GameProgress { values: readonly CellValue[]; elapsedMs: number; status: GameStatus; answerUsed: boolean }
export const MAX_ELAPSED_MS = 365 * 24 * 60 * 60 * 1000
export const validElapsed = (raw: unknown): raw is number => typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= MAX_ELAPSED_MS
export function validProgress(puzzle: PuzzleDefinition, raw: unknown): raw is GameProgress {
  if (!raw || typeof raw !== 'object') return false
  const p = raw as Record<string, unknown>
  if (Object.keys(p).sort().join(',') !== 'answerUsed,elapsedMs,status,values' || !Array.isArray(p.values) || p.values.length !== puzzle.size ** 2
    || !Array.from(p.values).every(v => v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= puzzle.size))
    || !validElapsed(p.elapsedMs) || typeof p.answerUsed !== 'boolean' || typeof p.status !== 'string' || !['ready', 'playing', 'cleared'].includes(p.status)) return false
  const values = p.values as CellValue[]
  if (puzzle.cages.some(c => c.op === '=' && values[c.cells[0]] !== c.target)) return false
  if ((p.status === 'cleared') !== isComplete(puzzle, values)) return false
  if (p.status === 'ready') {
    const fixed = new Set(puzzle.cages.filter(c => c.op === '=').map(c => c.cells[0]))
    if (p.elapsedMs !== 0 || p.answerUsed || values.some((v, id) => !fixed.has(id) && v !== null)) return false
  }
  return true
}
export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}.${Math.floor(ms % 1000 / 100)}`
}
