import { canonicalPuzzle, verifyDefinition } from '../core/definition.ts'
import type { VerifyResponse } from './protocol.ts'
export function handleVerify(raw: unknown): VerifyResponse {
  const request = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const requestId = typeof request.requestId === 'number' && Number.isSafeInteger(request.requestId) ? request.requestId : -1
  try { return { type: 'verified', requestId, valid: request.type === 'verify' && requestId > 0 && canonicalPuzzle(request.puzzle) && verifyDefinition(request.puzzle) } }
  catch { return { type: 'verified', requestId, valid: false } }
}
