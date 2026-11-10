import { shuffle } from './random.ts'
import { SIZE, type Digit } from './types.ts'
export function generateLatinSquare(random: () => number, size: number = SIZE): Digit[] {
  const indices = Array.from({ length: size }, (_, i) => i)
  const rows = shuffle(indices, random), columns = shuffle(indices, random)
  const digits = shuffle<Digit>(Array.from({ length: size }, (_, i) => (i + 1) as Digit), random)
  return rows.flatMap(row => columns.map(column => digits[(row + column) % size]))
}
