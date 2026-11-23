import type { Baseline, LiveCell, MatrixRow } from './cells.ts'
import { fitsBudget, judge, type Measured, type Turn } from './measure.ts'

export async function executeCells(
  cells: readonly LiveCell[],
  baseline: Baseline,
  budgetUsd: number,
  run: (cell: LiveCell) => Promise<Readonly<{ measured: Measured; turns: readonly Turn[] }>>,
  save: (rows: readonly MatrixRow[]) => void,
): Promise<readonly MatrixRow[]> {
  const rows: MatrixRow[] = []
  let spent: number | null = 0
  let dearest = 0
  for (const cell of cells) {
    if (!fitsBudget(spent, dearest, budgetUsd)) {
      rows.push({
        cell: cell.id,
        state: 'not-run',
        reasons: [spent === null ? 'cost unknown after incomplete call' : 'budget'],
        measured: null,
      })
    } else {
      try {
        const { measured, turns } = await run(cell)
        spent =
          spent === null || measured.costUsd === null || measured.unanswered > 0
            ? null
            : spent + measured.costUsd
        if (measured.costUsd !== null) dearest = Math.max(dearest, measured.costUsd)
        const reasons = judge(measured, baseline.cells[cell.id])
        rows.push({
          cell: cell.id,
          state: reasons.length === 0 ? 'green' : 'red',
          reasons,
          measured,
          turns,
        })
      } catch (error) {
        spent = null
        rows.push({ cell: cell.id, state: 'error', reasons: [String(error)], measured: null })
      }
    }
    save([...rows])
  }
  return rows
}
