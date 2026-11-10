import { neighbors, connected } from './constraints.ts'
import { shuffle } from './random.ts'
import type { Cage, Digit, Operator } from './types.ts'
export function makeCage(cells: readonly number[], op: Cage['op'], solution: readonly Digit[]): Cage {
  const sorted = [...cells].sort((a, b) => a - b), values = sorted.map(id => solution[id])
  const actual = sorted.length === 1 ? '=' : op
  const target = actual === '=' ? values[0] : actual === '+' ? values.reduce<number>((a, b) => a + b, 0) : actual === '*' ? values.reduce<number>((a, b) => a * b, 1) : actual === '-' ? Math.abs(values[0] - values[1]) : Math.max(...values) / Math.min(...values)
  // Arity is checked here, before constructing the discriminated union.
  const id = `c${sorted[0]}`
  if (actual === '=' && sorted.length === 1) return { id, cells: [sorted[0]], op: '=', target: target as Digit }
  if ((actual === '-' || actual === '/') && sorted.length === 2 && Number.isInteger(target)) return { id, cells: [sorted[0], sorted[1]], op: actual, target }
  if ((actual === '+' || actual === '*') && sorted.length >= 2) return { id, cells: [sorted[0], sorted[1], ...sorted.slice(2)], op: actual, target }
  throw new Error('Invalid cage operation/arity')
}
export function createCages(solution: readonly Digit[], random: () => number, operators: readonly Operator[], size = 5, cageLimit = 4): Cage[] {
  const available = new Set(Array.from({ length: size * size }, (_, i) => i)), cages: Cage[] = []
  const maxSize = operators.some(op => op === '+' || op === '*') ? cageLimit : 2
  while (available.size) {
    const first = shuffle([...available], random)[0], cells = [first]
    available.delete(first)
    const desired = 2 + Math.floor(random() * (maxSize - 1))
    while (cells.length < desired) {
      const frontier = [...new Set(cells.flatMap(id => neighbors(id, size)).filter(id => available.has(id)))]
      if (!frontier.length) break
      const next = frontier[Math.floor(random() * frontier.length)]
      cells.push(next); available.delete(next)
    }
    const values = cells.map(id => solution[id])
    const choices = operators.filter(op => (op === '+' || op === '*') || (cells.length === 2 && (op === '-' || Math.max(...values) % Math.min(...values) === 0)))
    if (cells.length === 1 || !choices.length) cages.push(...cells.map(id => makeCage([id], '=', solution)))
    else cages.push(makeCage(cells, choices[Math.floor(random() * choices.length)], solution))
  }
  return cages.sort((a, b) => a.cells[0] - b.cells[0])
}
// Splitting +/* into same-operation connected components strengthens the old
// condition. Splitting a binary cage fixes both cells. The known Latin solution
// always survives. No unselected operator is introduced.
export function refineCage(cages: readonly Cage[], cell: number, solution: readonly Digit[], size = 5): Cage[] {
  const cage = cages.find(c => c.cells.includes(cell))
  if (!cage || cage.cells.length === 1) throw new Error('Cannot refine a fixed/unknown cell')
  const remaining = new Set(cage.cells.filter(id => id !== cell)), replacements: Cage[] = [makeCage([cell], '=', solution)]
  while (remaining.size) {
    const first = [...remaining][0], component = [first]
    remaining.delete(first)
    for (let i = 0; i < component.length; i++) for (const n of neighbors(component[i], size)) if (remaining.delete(n)) component.push(n)
    if (!connected(component, size)) throw new Error('Invalid refinement')
    replacements.push(makeCage(component, cage.op, solution))
  }
  return [...cages.filter(c => c !== cage), ...replacements].sort((a, b) => a.cells[0] - b.cells[0])
}
