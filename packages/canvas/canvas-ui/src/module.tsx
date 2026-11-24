import { canvasProtocol } from '@omne-harness/canvas-protocol'
import { needProtocol } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { CanvasClient } from './model/reading.ts'
import { canvasParts } from './parts.ts'
import { canvasPoints } from './points.ts'
import { CanvasBack } from './view/canvas-back.tsx'

export const CANVAS_BACK_ID = 'canvas'

/** The canvas on the back of the application while `canvas/v1` is served, and the four points it draws by. */
export const canvasUiModule = defineUiModule({
  name: 'canvas-ui',
  needs: { canvas: needProtocol<CanvasClient>(canvasProtocol) },
  apply(shell, { canvas: client }) {
    for (const part of canvasParts) part.declare(shell)
    for (const point of canvasPoints) point.declare(shell)
    shell.contribute('back', {
      id: CANVAS_BACK_ID,
      render: ({ scope }) =>
        scope === undefined ? null : <CanvasBack client={client} tenant={scope} />,
    })
  },
})
