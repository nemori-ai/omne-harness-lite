import { describe, expect, it } from 'vitest'
import { diagnoseScreen, macosScreenPermission, screenBackendFor } from '@omne-harness/screen'
import { libraryOf, MACOS_RECORDED } from './fixtures/libraries.ts'

const loaded = async () => libraryOf(MACOS_RECORDED).library
const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv

describe('the permission of macOS to read the screen, asked of the system', () => {
  const asked = (answer: () => Promise<string>) => macosScreenPermission(answer)()

  it.each([
    ['true\n', 'satisfied'],
    ['false\n', 'unsatisfied'],
    ['', 'unknown'],
    ['maybe', 'unknown'],
  ])('the system answering %j is %s', async (stdout, permission) => {
    expect(await asked(async () => stdout)).toBe(permission)
  })

  it('is unknown, not satisfied, when the system cannot be asked', async () => {
    expect(await asked(() => Promise.reject(new Error('no osascript')))).toBe('unknown')
  })

  it('asks again after an answer that was not satisfied, and keeps a satisfied one', async () => {
    const answers = ['false', 'true', 'false']
    let calls = 0
    const permission = macosScreenPermission(async () => answers[calls++] ?? 'false')
    expect([await permission(), await permission(), await permission()]).toEqual([
      'unsatisfied',
      'satisfied',
      'satisfied',
    ])
    expect(calls).toBe(2)
  })
})

describe('the backend is chosen by the operating system', () => {
  it('macOS: the library in logical points, the permission asked of the system, verified on a device', async () => {
    const backend = await screenBackendFor('darwin', { load: loaded, ask: async () => 'false' })
    expect(backend).toMatchObject({ name: 'node-screenshots/darwin', verification: 'device' })
    expect(await backend?.permission()).toBe('unsatisfied')
    expect(await backend?.list()).toMatchObject([{ id: '2', pixels: { width: 1024, height: 768 } }])
  })

  it('Windows: no permission to ask for; the backend passed the contract suite only', async () => {
    const backend = await screenBackendFor('win32', { load: loaded })
    expect(backend).toMatchObject({
      name: 'node-screenshots/win32',
      verification: 'contract-suite',
    })
    expect(await backend?.permission()).toBe('satisfied')
  })

  it('Linux: satisfied on an X display, unknown elsewhere', async () => {
    const on = (environment: NodeJS.ProcessEnv) =>
      screenBackendFor('linux', { load: loaded, env: environment }).then(backend =>
        backend?.permission(),
      )
    expect(await on(env({ DISPLAY: ':0' }))).toBe('satisfied')
    expect(await on(env({ DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0' }))).toBe('unknown')
    expect(await on(env({}))).toBe('unknown')
    const backend = await screenBackendFor('linux', { load: loaded, env: env({}) })
    expect(backend).toMatchObject({
      name: 'node-screenshots/linux',
      verification: 'contract-suite',
    })
  })

  it('a system with no backend, and a system whose library does not load, have none', async () => {
    expect(await screenBackendFor('freebsd', { load: loaded })).toBeUndefined()
    expect(await screenBackendFor('darwin', { load: async () => undefined })).toBeUndefined()
    const throwing = () => Promise.reject(new Error('no prebuilt binary'))
    expect(await screenBackendFor('linux', { load: throwing })).toBeUndefined()
  })
})

describe('the diagnosis one runs on a machine', () => {
  it('says the backend, how it was verified, the permission, the check and the screens', async () => {
    expect(await diagnoseScreen('darwin', { load: loaded, ask: async () => 'true' })).toEqual({
      platform: 'darwin',
      backend: 'node-screenshots/darwin',
      verification: 'device',
      permission: 'satisfied',
      check: { kind: 'passed' },
      screens: [
        {
          id: '2',
          name: 'AWS Nitro D-1',
          primary: true,
          pixels: { width: 1024, height: 768 },
          scale: 1,
          origin: { x: 0, y: 0 },
        },
      ],
    })
  })

  it('says so when the system has no backend', async () => {
    expect(await diagnoseScreen('freebsd', { load: loaded })).toEqual({
      platform: 'freebsd',
      backend: null,
    })
  })
})
