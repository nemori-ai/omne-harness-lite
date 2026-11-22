import type { PartDrawer } from '@omne-harness/shell-contract'
import { createContext } from 'react'

/** The shell that draws the parts of this page; with none, every part is drawn as it shipped. */
export const PartDrawContext = createContext<PartDrawer | null>(null)
