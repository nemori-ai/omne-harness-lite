import type { Cell } from './cell.ts'
import { kCells } from './cells-k.ts'

export const cells: readonly Cell[] = [...kCells]
