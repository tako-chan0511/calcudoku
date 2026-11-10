import { neighbors, connected } from './constraints.ts'
import { makeCage, refineCage } from './cages.ts'
import { shuffle } from './random.ts'
import { WorkBudget } from './budget.ts'
import type { BoardSize, Cage, Difficulty, Digit, Operator } from './types.ts'
// Each remaining row is a regular column/digit bipartite graph, so an
// augmenting-path perfect matching always exists. No Latin backtracking.
export function diverseLatin(size: BoardSize, random: () => number, budget: WorkBudget): Digit[] {
  const used = Array.from({ length: size }, () => new Set<Digit>()), board: Digit[] = []
  for (let row = 0; row < size; row++) {
    const order = shuffle(Array.from({ length: size }, (_, i) => i), random)
    const edges = new Map(order.map(col => [col, shuffle(Array.from({ length: size }, (_, i) => (i + 1) as Digit).filter(v => !used[col].has(v)), random)]))
    const match = new Map<Digit, number>()
    function augment(col: number, seen: Set<Digit>): boolean {
      for (const digit of edges.get(col)!) {
        budget.spend(); if (seen.has(digit)) continue; seen.add(digit)
        if (!match.has(digit) || augment(match.get(digit)!, seen)) { match.set(digit, col); return true }
      }
      return false
    }
    for (const col of order) if (!augment(col, new Set())) throw new Error('Latin matching failed')
    const line = Array<Digit>(size)
    for (const [digit, col] of match) { line[col] = digit; used[col].add(digit) }
    board.push(...line)
  }
  return board
}
export function matchingCages(solution: readonly Digit[], size: BoardSize, operators: readonly Operator[], random: () => number, budget: WorkBudget): Cage[] {
  const left = shuffle(Array.from({ length: size * size }, (_, i) => i).filter(id => (Math.floor(id / size) + id % size) % 2 === 0), random)
  const choices = (a: number, b: number) => operators.filter(op => op !== '/' || Math.max(solution[a], solution[b]) % Math.min(solution[a], solution[b]) === 0)
  const edges = new Map(left.map(id => [id, shuffle(neighbors(id, size).filter(other => choices(id, other).length > 0), random)])), match = new Map<number, number>()
  function augment(id: number, seen: Set<number>): boolean {
    for (const other of edges.get(id)!) {
      budget.spend(); if (seen.has(other)) continue; seen.add(other)
      if (!match.has(other) || augment(match.get(other)!, seen)) { match.set(other, id); return true }
    }
    return false
  }
  for (const id of left) augment(id, new Set())
  const covered = new Set<number>(), cages: Cage[] = []
  for (const [a, b] of match) { const ops = choices(a, b); cages.push(makeCage([a,b], ops[Math.floor(random() * ops.length)], solution)); covered.add(a); covered.add(b) }
  for (let id = 0; id < size * size; id++) if (!covered.has(id)) cages.push(makeCage([id], '=', solution))
  return cages.sort((a,b) => a.cells[0] - b.cells[0])
}
// Strengthen only a constraint which actually distinguishes the witnesses.
// Prefer connected 2+2 splits, then low-cost single-cell splits. Avoid creating
// unnecessary fixed cells by cutting the middle of a branching cage.
export function strengthen(cages: readonly Cage[], witnesses: readonly [readonly Digit[], readonly Digit[]], solution: readonly Digit[], size: BoardSize, maxFixed: number, random: () => number, budget: WorkBudget): Cage[] | null {
  const candidates: { cages: Cage[]; score: number }[] = [], fixed = cages.filter(c => c.op === '=').length
  const different = shuffle(solution.map((_, id) => id).filter(id => witnesses[0][id] !== witnesses[1][id]), random)
  for (const id of different) {
    budget.spend(); const next = refineCage(cages, id, solution, size), count = next.filter(c => c.op === '=').length
    if (count <= maxFixed) candidates.push({ cages: next, score: (count - fixed) * 10 + next.length - cages.length })
    const cage = cages.find(c => c.cells.includes(id))!
    if (cage.cells.length === 4 && (cage.op === '+' || cage.op === '*')) {
      for (let i = 1; i < 4; i++) {
        budget.spend(); const a = [cage.cells[0], cage.cells[i]], b = cage.cells.filter(v => !a.includes(v))
        if (!connected(a,size) || !connected(b,size)) continue
        const replacement = [makeCage(a,cage.op,solution),makeCage(b,cage.op,solution)]
        const rejects = witnesses.some(w => replacement.some(c => c.op === '+' ? c.cells.reduce((s,j)=>s+w[j],0) !== c.target : c.cells.reduce((s,j)=>s*w[j],1) !== c.target))
        if (rejects) candidates.push({ cages: [...cages.filter(c=>c!==cage),...replacement].sort((a,b)=>a.cells[0]-b.cells[0]), score: 1 })
      }
    }
  }
  return candidates.sort((a,b)=>a.score-b.score)[0]?.cages ?? null
}
// Exhaustive connected partition shapes of 3×3, capped at one fixed cell.
// Ordering favors ambiguous binary differences and a multi-cell sum for hard;
// every selected proposal still needs full uniqueness and difficulty proof.
export function smallHardShapes(budget: WorkBudget): number[][][] {
  const result: number[][][] = []
  function visit(remaining: Set<number>, groups: number[][], fixed: number) {
    budget.spend(); if (!remaining.size) { result.push(groups); return }
    const first = Math.min(...remaining), sets = new Map<string,number[]>()
    function grow(cells: Set<number>) {
      budget.spend(); const ids = [...cells].sort((a,b)=>a-b), key = ids.join(','); if (sets.has(key)) return; sets.set(key,ids)
      if (ids.length === 3) return
      for (const n of new Set(ids.flatMap(id=>neighbors(id,3)).filter(id=>remaining.has(id)&&!cells.has(id)))) grow(new Set([...cells,n]))
    }
    grow(new Set([first]))
    for (const ids of sets.values()) if (!(ids.length === 1 && fixed)) visit(new Set([...remaining].filter(id=>!ids.includes(id))),[...groups,ids],fixed+Number(ids.length===1))
  }
  visit(new Set(Array.from({length:9},(_,i)=>i)),[],0)
  return result
}
export function latinThrees(): Digit[][] {
  const permutations: Digit[][] = [[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]], result: Digit[][] = []
  for (const a of permutations) for (const b of permutations) for (const c of permutations) if (a.every((v,i)=>v!==b[i]&&v!==c[i]&&b[i]!==c[i])) result.push([...a,...b,...c])
  return result
}

// The structural allowance is derived from the exact unavoidable singleton
// count for this Latin grid. Keep only a small extra clue margin, not 60% as a
// target; the separate safety ceiling never replaces the logical grade proof.
export function binaryFixedLimit(size: BoardSize, difficulty: Difficulty, unavoidable: number, ceiling: number): number {
  const base = Math.max(1, Math.floor(size * size * (difficulty === 'easy' ? .45 : difficulty === 'normal' ? .20 : .12)))
  return Math.min(ceiling, Math.max(base, unavoidable + Math.max(1, Math.ceil(size * size * .05))))
}
