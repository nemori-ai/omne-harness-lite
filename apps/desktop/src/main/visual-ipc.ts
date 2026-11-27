import { VISUAL_IPC } from '../shared/desktop-bridge.ts'
import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'

import type { Logger } from './log.ts'
import type { VisualMirror } from './visual-mirror.ts'

export function installVisualIpc(
  ipc: Pick<IpcMain, 'on' | 'handle'>,
  mirror: VisualMirror,
  trusted: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean,
  log: Pick<Logger, 'warn'>,
) {
  ipc.on(VISUAL_IPC.read, event => {
    if (!trusted(event)) {
      log.warn({}, 'untrusted visual mirror read')
      event.returnValue = null
      return
    }
    event.returnValue = mirror.read()
  })
  ipc.handle(VISUAL_IPC.push, (event, raw: unknown) => {
    if (!trusted(event)) {
      log.warn({}, 'untrusted visual mirror push')
      return 'failed'
    }
    return mirror.push(raw)
  })
}
