import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { VISUAL_IPC, type OmneDesktopBridge } from '../src/shared/desktop-bridge.ts'

const wire = vi.hoisted(() => ({
  sendSync: vi.fn<() => unknown>(() => ({ record: null, pending: false })),
  expose: vi.fn<(key: string, bridge: OmneDesktopBridge) => void>(),
  invoke: vi.fn<(channel: string, payload: unknown) => Promise<unknown>>(),
}))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: wire.expose },
  ipcRenderer: wire,
}))

async function load(): Promise<OmneDesktopBridge['visual']> {
  await import('../src/preload/preload.ts')
  expect(wire.expose).toHaveBeenCalledOnce()
  const [key, bridge] = wire.expose.mock.calls[0]!
  expect(key).toBe('omneDesktop')
  expect(Object.keys(bridge)).toEqual(['visual'])
  return bridge.visual
}

const isMainFrameDescriptor = Object.getOwnPropertyDescriptor(process, 'isMainFrame')
beforeEach(() => {
  Object.defineProperty(process, 'isMainFrame', { configurable: true, value: true })
  vi.resetModules()
  vi.clearAllMocks()
})
afterEach(() => {
  if (isMainFrameDescriptor) Object.defineProperty(process, 'isMainFrame', isMainFrameDescriptor)
  else Reflect.deleteProperty(process, 'isMainFrame')
})

it('does not expose the bridge or read the mirror in a sub-frame', async () => {
  Object.defineProperty(process, 'isMainFrame', { configurable: true, value: false })
  await import('../src/preload/preload.ts')
  expect(wire.sendSync).not.toHaveBeenCalled()
  expect(wire.expose).not.toHaveBeenCalled()
})

it('samples once for prepaint, reads live pending state and classifies the application-level push', async () => {
  const visual = await load()
  expect(visual.seed).toEqual({ record: null, pending: false })
  expect(wire.sendSync).toHaveBeenCalledExactlyOnceWith(VISUAL_IPC.read)
  wire.sendSync.mockReturnValueOnce({ record: 'live', pending: true })
  expect(visual.read()).toEqual({ record: 'live', pending: true })
  wire.invoke
    .mockResolvedValueOnce('ok')
    .mockResolvedValueOnce('failed')
    .mockRejectedValueOnce(new Error('IPC'))
    .mockResolvedValueOnce(null)
  for (const expected of ['ok', 'failed', 'unavailable', 'unavailable'])
    expect(await visual.push('raw')).toBe(expected)
  expect(wire.invoke.mock.calls).toEqual(Array.from({ length: 4 }, () => [VISUAL_IPC.push, 'raw']))
})

it('survives an unavailable seed and distinguishes a denied read from an empty mirror', async () => {
  wire.sendSync
    .mockImplementationOnce(() => {
      throw new Error('unavailable')
    })
    .mockReturnValueOnce(null)
  const visual = await load()
  expect(visual.seed).toBeNull()
  expect(() => visual.read()).toThrow('visual mirror unavailable')
  expect(visual.read()).toEqual({ record: null, pending: false })
})
