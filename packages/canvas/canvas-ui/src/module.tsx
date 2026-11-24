import { CONNECTION_SERVER_POINTS, type ServerPoints } from '@omne-harness/client-assembly'
import { canvasProtocol } from '@omne-harness/canvas-protocol'
import { attachWhile, needPoint, needProtocol, type Reader } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { CanvasPreferences } from './model/preferences.ts'
import type { CanvasClient } from './model/reading.ts'
import { canvasParts } from './parts.ts'
import { canvasElement, canvasPoints } from './points.ts'
import { appDrawing, CANVAS_APP } from './view/app.tsx'
import { CanvasBack, type KindsFollow } from './view/canvas-back.tsx'

export const CANVAS_BACK_ID = 'canvas'

export type CanvasUiOptions = Readonly<{
  /** Where this device keeps the view and the magnet of the canvas: the application's to say. */
  preferences: CanvasPreferences
}>

/** Calls the listener when the keys the server makes public on `canvas.kinds` change, while it tells them. */
function following(server: Reader<ServerPoints>): KindsFollow {
  return listener =>
    attachWhile(server, points => {
      const told = (): string => JSON.stringify(canvasElement.keys(points))
      let last = told()
      return points.subscribe(() => {
        const now = told()
        if (now === last) return
        last = now
        listener()
      })
    })
}

/** The canvas on the back of the application while `canvas/v1` is served, and the four points it draws by. */
export function createCanvasUiModule(options: CanvasUiOptions) {
  return defineUiModule({
    name: 'canvas-ui',
    needs: {
      canvas: needProtocol<CanvasClient>(canvasProtocol),
      server: needPoint<ServerPoints>(CONNECTION_SERVER_POINTS, { optional: true }),
    },
    apply(shell, { canvas: client, server }) {
      for (const part of canvasParts) part.declare(shell)
      for (const point of canvasPoints) point.declare(shell)
      canvasElement.put(shell, CANVAS_APP, appDrawing(shell))
      const followKinds = following(server)
      shell.contribute('back', {
        id: CANVAS_BACK_ID,
        render: ({ scope, turn }) =>
          scope === undefined ? null : (
            <CanvasBack
              client={client}
              tenant={scope}
              host={shell}
              preferences={options.preferences}
              followKinds={followKinds}
              turn={turn}
            />
          ),
      })
    },
  })
}
