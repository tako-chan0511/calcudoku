export class BudgetExceeded extends Error {}
export class WorkBudget {
  used = 0
  readonly limit: number
  private readonly parent?: WorkBudget
  constructor(limit: number, parent?: WorkBudget) {
    this.limit = limit; this.parent = parent
    if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError('Invalid work budget')
  }
  spend(units = 1) {
    if (this.used + units > this.limit) throw new BudgetExceeded('Work budget exceeded')
    this.parent?.spend(units)
    this.used += units
  }
}
