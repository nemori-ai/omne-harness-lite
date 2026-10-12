import { openStorage } from '@omne-harness-lite/storage-sql'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { openClientLocalState, type ClientLocalStateInstance } from '../src/open.ts'
import type { LocalRecord, LocalSnapshot } from '@omne-harness-lite/client-local-state'

export const center: LocalRecord['center'] = {
  centerId: '11111111111111111111111111111111',
  endpoint: 'https://center.example.invalid/',
  trust: { mode: 'ca' },
}
export const config: LocalRecord = { center, cache: [] }
export const logged: LocalRecord = {
  ...config,
  login: { presentation: 'first-bearer', handle: 'first-handle', accountId: 'acc_first' },
}
export const other: LocalRecord = {
  ...config,
  login: { presentation: 'second-bearer', handle: 'second-handle', accountId: 'acc_second' },
}

export function fixtures() {
  const dirs: string[] = []
  const instances: ClientLocalStateInstance[] = []
  afterEach(async () => {
    await Promise.all(instances.splice(0).map(s => s.close()))
    await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true })))
  })
  return {
    async directory() {
      const root = await mkdtemp(join(await realpath(tmpdir()), 'omne-cls-'))
      dirs.push(root)
      return join(root, 'state')
    },
    async open(directory: string) {
      const state = await openClientLocalState(
        { directory },
        {
          storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
        },
      )
      instances.push(state)
      return state
    },
    own(state: ClientLocalStateInstance) {
      instances.push(state)
      return state
    },
  }
}

export async function read(state: ClientLocalStateInstance): Promise<LocalSnapshot> {
  const result = await state.read()
  if (result.kind !== 'read') throw new Error(`fixture read failed: ${result.reason}`)
  return result.snapshot
}

export function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(yes => {
    resolve = yes
  })
  return { promise, resolve }
}
