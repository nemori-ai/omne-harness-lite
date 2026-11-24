// Simulated native Windows RPC answers; NOT Windows filesystem/OS evidence.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHostFileLookup } from '../src/host-file-lookup.ts'
import type { NativeReply } from '../src/windows-files/protocol.ts'

const native = vi.hoisted(() => ({ request: vi.fn<(input: unknown) => Promise<unknown>>() }))
vi.mock('../src/windows-files/helper.ts', () => ({
  getWindowsFilesHelper: () => ({ request: native.request }),
}))
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
const root = 'C:/repo'
const file = 'C:/repo/AGENTS.md'
beforeEach(() => {
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' })
  native.request.mockReset()
})
afterEach(() => {
  Object.defineProperty(process, 'platform', platform)
})

const reply = (type: NativeReply['info']['type'], directory?: string): NativeReply => ({
  info: { type, token: 'native-file', size: 3, version: 'v1', modified: 0, name: 'AGENTS.md' },
  bytes: '',
  entries: [],
  hits: [],
  next: -1,
  truncated: false,
  eof: true,
  ...(directory === undefined ? {} : { directory }),
})

describe('createHostFileLookup with simulated Windows native-boundary answers', () => {
  it.each([
    'notFound',
    'unresolved',
    'notAuthorized',
    'unavailable',
    'unknown',
    'unsupported',
  ] as const)('preserves native %s meaning at the public lookup entry', async answer => {
    native.request.mockResolvedValue(answer)
    const result = await createHostFileLookup(root, '10:20')(file)
    expect(result).toEqual(
      answer === 'notFound' ? { ok: true, value: null } : { ok: false, failure: answer },
    )
    expect(native.request).toHaveBeenCalledWith({
      root,
      expectedRoot: 'node-stat:10:20',
      segments: ['AGENTS.md'],
      rooted: true,
      operation: 'lookup',
      directory: false,
      follow: false,
    })
  })
  it.each(['C:/repo2/AGENTS.md', 'C:/repo', 'C:/repo/../repo/AGENTS.md'])(
    'refuses lexical path %s before invoking the native process',
    async path => {
      native.request.mockResolvedValue('notFound')
      expect(await createHostFileLookup(root, '10:20')(path)).toEqual({
        ok: false,
        failure: 'notAuthorized',
      })
      expect(native.request).not.toHaveBeenCalled()
    },
  )
  it('keeps native non-file metadata unsupported before considering its directory', async () => {
    native.request.mockResolvedValue(reply('directory'))
    expect(await createHostFileLookup(root, '10:20')(file)).toEqual({
      ok: false,
      failure: 'unsupported',
    })
  })
  it.each([undefined, 'relative-parent'])(
    'refuses file metadata without an absolute containing directory (%s)',
    async directory => {
      native.request.mockResolvedValue(reply('file', directory))
      expect(await createHostFileLookup(root, '10:20')(file)).toEqual({
        ok: false,
        failure: 'unknown',
      })
    },
  )
})
