import type { Cell } from './cell.ts'
import { dCells } from './cells-d.ts'
import { gCells } from './cells-g.ts'
import { hCells } from './cells-h.ts'
import { kCells } from './cells-k.ts'
import { qCells } from './cells-q.ts'
import { rCells } from './cells-r.ts'
import { xCells } from './cells-x.ts'

export const cells: readonly Cell[] = [
  ...kCells,
  ...hCells,
  ...qCells,
  ...gCells,
  ...rCells,
  ...dCells,
  ...xCells,
]
