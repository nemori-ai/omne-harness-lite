import { VISUAL_IPC } from '../src/shared/desktop-bridge.ts'
import type { IpcMain } from 'electron'
import { expect, it, vi } from 'vitest'

import { nodeFs } from '../src/main/atomic-file.ts'
import { installVisualIpc } from '../src/main/visual-ipc.ts'
import { createVisualMirror } from '../src/main/visual-mirror.ts'

it('checks sender ownership on both channels and validates the wire record before changing memory', () => {
  const ipc = { on: vi.fn<IpcMain['on']>(), handle: vi.fn<IpcMain['handle']>() }
  const log = { warn: vi.fn<() => void>() }
  const fs = {
    ...nodeFs,
    readFileSync: () => '',
    openSync: vi.fn<typeof nodeFs.openSync>(() => {
      throw new Error('disk')
    }),
    rmSync: vi.fn<typeof nodeFs.rmSync>(),
  }
  const mirror = createVisualMirror('fixture', { log, fs })
  const trust = vi.fn<() => boolean>(() => false)
  installVisualIpc(ipc, mirror, trust, log)
  const [readChannel, read] = ipc.on.mock.calls[0]!
  const [pushChannel, push] = ipc.handle.mock.calls[0]!
  expect([readChannel, pushChannel]).toEqual([VISUAL_IPC.read, VISUAL_IPC.push])
  const event = { returnValue: undefined }
  const raw = '{"version":1,"stamp":{"t":1,"id":"a"},"preferences":{"size":"large"}}'
  Reflect.apply(read, null, [event])
  expect(event.returnValue).toBeNull()
  expect(Reflect.apply(push, null, [event, raw])).toBe('failed')
  trust.mockReturnValue(true)
  expect(Reflect.apply(push, null, [event, '{}'])).toBe('failed')
  expect(log.warn.mock.calls).toEqual([
    [{}, 'untrusted visual mirror read'],
    [{}, 'untrusted visual mirror push'],
    [{}, 'invalid visual mirror record'],
  ])
  expect(fs.openSync).not.toHaveBeenCalled()
  Reflect.apply(read, null, [event])
  expect(event.returnValue).toEqual({ record: null, pending: false })
  expect(Reflect.apply(push, null, [event, raw])).toBe('failed')
  Reflect.apply(read, null, [event])
  expect(event.returnValue).toEqual({ record: raw, pending: true })
})
