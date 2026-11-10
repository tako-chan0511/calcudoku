import type { ConstraintPuzzle } from './types.ts'
export function cageEdges(puzzle: ConstraintPuzzle): string {
  const size = puzzle.size
  const membership = Array<string>(size * size)
  for (const cage of puzzle.cages) for (const cell of cage.cells) membership[cell] = cage.id
  const segments: string[] = []
  for (let id = 0; id < size * size; id++) {
    const row = Math.floor(id / size), col = id % size, x = col * 100, y = row * 100
    if (col === 0 || membership[id] !== membership[id - 1]) segments.push(`M${x},${y}v100`)
    if (row === 0 || membership[id] !== membership[id - size]) segments.push(`M${x},${y}h100`)
    if (col === size - 1) segments.push(`M${x + 100},${y}v100`)
    if (row === size - 1) segments.push(`M${x},${y + 100}h100`)
  }
  return segments.join(' ')
}
