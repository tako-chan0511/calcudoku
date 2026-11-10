import { makeCage } from '../src/core/cages.ts'
import { generateLatinSquare } from '../src/core/latinSquare.ts'
import { createRandom } from '../src/core/random.ts'
import type { Cage, ConstraintPuzzle, Digit } from '../src/core/types.ts'
export const solution = generateLatinSquare(createRandom(123))
export const fixedPuzzle: ConstraintPuzzle = { size: 5, cages: solution.map((_, id) => makeCage([id], '=', solution)) }
export const multiplePuzzle: ConstraintPuzzle = { size: 5, cages: Array.from({ length: 5 }, (_, row) => makeCage(Array.from({ length: 5 }, (_, col) => row * 5 + col), '+', solution)) }
export function impossiblePuzzle(): ConstraintPuzzle {
  const bad = [...solution]; bad[1] = bad[0]
  return { size: 5, cages: bad.map((_, id) => makeCage([id], '=', bad)) }
}
// An independent, deliberately simple reference oracle. Enumerate row
// permutations, reject used column values, then check completed cage arithmetic.
// It does not use the production solver or its cage/constraint predicates.
export function referenceCount(puzzle: ConstraintPuzzle): number {
  const size = puzzle.size
  const permutations: Digit[][] = []
  function permute(prefix: Digit[], remaining: Digit[]) {
    if (!remaining.length) { permutations.push(prefix); return }
    for (const n of remaining) permute([...prefix, n], remaining.filter(v => v !== n))
  }
  permute([], Array.from({ length: size }, (_, i) => (i + 1) as Digit))
  const board: Digit[] = []
  let found = 0
  function cageMatches(cage: Cage) {
    const values = cage.cells.map(id => board[id])
    switch (cage.op) {
      case '=': return values[0] === cage.target
      case '+': return values.reduce<number>((a, b) => a + b, 0) === cage.target
      case '*': return values.reduce<number>((a, b) => a * b, 1) === cage.target
      case '-': return values[0] - values[1] === cage.target || values[1] - values[0] === cage.target
      case '/': return values[0] === cage.target * values[1] || values[1] === cage.target * values[0]
    }
  }
  function visit(row: number) {
    if (row === size) { found++; return }
    for (const permutation of permutations) {
      if (permutation.some((v, col) => board.some((other, id) => id % size === col && other === v))) continue
      board.push(...permutation)
      if (puzzle.cages.every(c => c.cells.some(id => id >= board.length) || cageMatches(c))) visit(row + 1)
      board.splice(row * size)
      if (found >= 2) return
    }
  }
  visit(0)
  return found
}
