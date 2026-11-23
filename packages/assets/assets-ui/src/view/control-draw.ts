import type { RenderDrawer } from '@omne-harness/shell-contract'
import { createContext } from 'react'

/** The shell that draws the control of a setting by the kind of its value; with none, a row draws its own. */
export const ControlDrawContext = createContext<RenderDrawer | null>(null)
