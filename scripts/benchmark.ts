import { performance } from 'node:perf_hooks'
import { generatePuzzle } from '../src/core/generator.ts'
import { solvePuzzle } from '../src/core/solver.ts'
import { settingsForSeed } from '../src/core/types.ts'
const count = Number(process.argv[2] ?? 100)
if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw new Error('Count must be 1..10000')
const times: number[] = [], failures: { seed: number; reason: string }[] = []
let maxWork = 0, refinements = 0
for (let seed = 0; seed < count; seed++) {
  const start = performance.now(), result = generatePuzzle(settingsForSeed(seed))
  times.push(performance.now() - start); maxWork = Math.max(maxWork, result.metrics.work); refinements += result.metrics.refinements
  if (result.status === 'failure') { failures.push({ seed, reason: result.reason }); continue }
  const verified = solvePuzzle(result.puzzle, { maxWork: 300_000 })
  if (verified.status !== 'unique') throw new Error(`Post-generation solver verification failed for seed ${seed}: ${verified.status}`)
}
times.sort((a, b) => a - b)
const percentile = (p: number) => Number(times[Math.ceil(times.length * p) - 1].toFixed(2))
console.log(JSON.stringify({ node: process.version, seeds: `0..${count - 1}`, attempts: count, successes: count - failures.length, failures, milliseconds: { median: percentile(.5), p95: percentile(.95), max: percentile(1) }, maxWork, totalRefinements: refinements }, null, 2))
