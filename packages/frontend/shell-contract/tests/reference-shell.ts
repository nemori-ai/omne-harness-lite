import { Context, type Fiber } from '@deepseek-ai/cordis'
import {
  createFigureStore,
  createToastStore,
  definePoint,
  type FigureBoard,
  type FigureStore,
  type ToastBoard,
  type ToastStore,
} from '@omne-harness/shell-contract'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { ReferenceShell as ExportedShell } from '@omne-harness/shell-contract/testing'

/** The exported reference shell, with a toast board and a figure board the cases read. */
export class ReferenceShell extends ExportedShell {
  /** Two at a time; a toast stays until the test takes it down. */
  readonly toastStore: ToastStore = createToastStore({
    visible: 2,
    durationMs: 1000,
    schedule: () => () => undefined,
  })
  readonly figureStore: FigureStore = createFigureStore()

  protected override toasts(): ToastBoard {
    return this.toastStore
  }

  protected override figures(): FigureBoard {
    return this.figureStore
  }
}

const text = { encode: (value: string) => value, decode: (value: string) => value }

/** The points the cases of this member attach to: a place counts only while it is declared. */
export const TEST_POINTS = ['test.a', 'test.b', 'test.chat', 'test.other', 'test.x']

export async function startShell(points: readonly string[] = TEST_POINTS): Promise<{
  root: Context
  shell: ReferenceShell
  host: Fiber
}> {
  const root = new Context()
  await root.plugin(DynamisService)
  const host = root.plugin(ReferenceShell)
  await host
  for (const name of points) definePoint({ title: 'test', name, subject: text }).declare(root.shell)
  return { root, shell: root.shell as unknown as ReferenceShell, host }
}

export const render = (): null => null
