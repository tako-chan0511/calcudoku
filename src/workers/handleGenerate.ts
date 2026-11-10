import { generatePuzzle, validSettings } from '../core/generator.ts'
import type { GenerateResponse, ProgressResponse } from './protocol.ts'
export function handleGenerate(raw: unknown, progress?: (message: ProgressResponse) => void): GenerateResponse {
  const request = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const requestId = typeof request.requestId === 'number' && Number.isSafeInteger(request.requestId) ? request.requestId : -1
  const failure = (reason: 'invalid-settings' | 'internal-error'): GenerateResponse => ({ type: 'generated', requestId, result: { status: 'failure', reason, metrics: { attempts: 0, solverCalls: 0, refinements: 0, work: 0 } } })
  if (request.type !== 'generate' || requestId < 1 || !validSettings(request.settings)) return failure('invalid-settings')
  let last = ''
  try { return { type: 'generated', requestId, result: generatePuzzle(request.settings, {}, p => { const key = `${p.attempt}:${p.stage}`; if (key !== last) { last = key; progress?.({ type: 'progress', requestId, progress: p }) } }) } }
  catch { return failure('internal-error') }
}
