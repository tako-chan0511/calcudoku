import { expect, it } from 'vitest'
import { handleGenerate } from '../src/workers/handleGenerate.ts'
import { settingsForSeed } from '../src/core/types.ts'
it('returns only a uniquely verified definition through the real Worker protocol', () => {
  const response = handleGenerate({ type: 'generate', requestId: 10, settings: settingsForSeed(42) })
  expect(response.requestId).toBe(10)
  expect(response.result.status).toBe('success')
  expect(JSON.stringify(response)).not.toMatch(/solution|witness/)
})
it.each([null, {}, { type: 'generate', requestId: 1, settings: { ...settingsForSeed(42), seed: -1 } }])('rejects malformed Worker input %j', input => {
  const response = handleGenerate(input)
  expect(response.result.status).toBe('failure')
  expect(response.result).not.toHaveProperty('puzzle')
})
