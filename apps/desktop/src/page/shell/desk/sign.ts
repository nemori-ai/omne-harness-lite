import type { FigureLabelLine } from '@omne-harness/ui-kit'
import type { Point } from '../../desk/scene.ts'
import type { FigureFacts } from './device.ts'
import { inside } from './whereabouts.ts'

export const INSIDE_LABEL: readonly FigureLabelLine[] = [{ text: '应用里' }, { text: '松手回去' }]
export const OUTSIDE_LABEL: readonly FigureLabelLine[] = [
  { text: '应用外面' },
  { text: '松手就停在这里，双击回到应用' },
]
export const LOOK_HINT: FigureLabelLine = { text: '按住 ⌘ 让它看一个窗口' }

/** Whether a point is in the app's window as the main process last told it: known, shown, and holding the point. */
export const insideApp = (facts: FigureFacts | null | undefined, at: Point): boolean =>
  facts != null && facts.visible && inside(facts.content, at)

/** The label of the first hand the desk draws without Command: where letting go takes it, and the hint when a window can be looked at. */
export function firstLabel(back: boolean, hint: boolean): readonly FigureLabelLine[] {
  if (back) return INSIDE_LABEL
  return hint ? [...OUTSIDE_LABEL, LOOK_HINT] : OUTSIDE_LABEL
}
