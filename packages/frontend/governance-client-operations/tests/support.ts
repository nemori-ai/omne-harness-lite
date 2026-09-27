import { randomUUID } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, vi } from 'vitest'
import {
  openClientLocalState,
  type ClientLocalState,
  type LocalRecord,
  type ClientLocalStateInstance,
} from '@omne-harness-lite/client-local-state'
import type { GovernanceOutcome } from '@omne-harness-lite/governance-center-client'
import { Client } from '../src/client.ts'
import type { Runtime } from '../src/actions.ts'
import { OG36 } from '../src/routes.ts'

export const center: LocalRecord['center'] = {
  centerId: '11111111111111111111111111111111',
  endpoint: 'https://center.example.invalid/',
  trust: { mode: 'ca' },
}
export const actor = { organization: 'org_72be', account: 'acc_7f3c91' }
export const configured: LocalRecord = { center, cache: [] }
export const logged: LocalRecord = {
  ...configured,
  login: {
    presentation: 'captured-secret-bearer',
    handle: 'selected-handle',
    accountId: actor.account,
  },
}
export const ok = (result: unknown): GovernanceOutcome => ({
  kind: 'reply',
  reply: { result },
  sendAttempted: true,
})
export const rejected = (failure: string): GovernanceOutcome => ({
  kind: 'reply',
  reply: { failure },
  sendAttempted: true,
})
export const unavailable = (sendAttempted = true): GovernanceOutcome => ({
  kind: 'unavailable',
  reason: 'connection',
  sendAttempted,
})
export function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => {
    resolve = yes
  })
  return { promise, resolve }
}
export async function read(state: ClientLocalState) {
  const value = await state.read()
  if (value.kind !== 'read') throw new Error('fixture read unavailable')
  return value.snapshot
}
export async function replace(state: ClientLocalState, value: LocalRecord | null) {
  expect((await state.compareAndReplace((await read(state)).token, value, randomUUID())).kind).toBe(
    'installed',
  )
}
export function fixtures() {
  const roots: string[] = [],
    states: ClientLocalStateInstance[] = [],
    clients: Client[] = []
  afterEach(async () => {
    await Promise.all(clients.splice(0).map(c => c.close()))
    await Promise.all(states.splice(0).map(s => s.close()))
    await Promise.all(roots.splice(0).map(d => rm(d, { recursive: true, force: true })))
  })
  return async (value: LocalRecord | null = logged, overrides: Partial<Runtime> = {}) => {
    const root = await mkdtemp(join(await realpath(tmpdir()), 'omne-cg-'))
    roots.push(root)
    const state = await openClientLocalState({ directory: join(root, 'state') })
    states.push(state)
    if (value !== null) {
      if (value.cache.length !== 0) await replace(state, { ...value, cache: [] })
      await replace(state, value)
    }
    const health = vi.fn<Runtime['health']>().mockResolvedValue({
      kind: 'health',
      reply: { reachable: true, centerId: center.centerId, version: 'test' },
    })
    const exchange = vi
      .fn<Runtime['exchange']>()
      .mockImplementation(async (_, input) =>
        ok((input as { operation: string }).operation === OG36 ? actor : 'ok'),
      )
    const runtime: Runtime = {
      state,
      timeoutMs: 1000,
      health,
      exchange,
      observedAt: () => '2026-09-25T01:00:00Z',
      ...overrides,
    }
    const client = new Client(runtime)
    clients.push(client)
    return { state, client, health, exchange, runtime, root }
  }
}
export async function open(client: Client) {
  const result = await client.openUse()
  if (result.kind !== 'use') throw new Error(`fixture open: ${result.reason}`)
  expect(Object.keys(result.use)).toEqual([])
  return result.use
}
