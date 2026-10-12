import { describe, expect, it } from 'vitest'
import type { ClientLocalState } from '@omne-harness-lite/client-local-state'
import { Client } from '../src/client.ts'
import { exitStatus } from '@omne-harness-lite/governance-client-operations'
import { fixtures, logged, open, read, replace, ok, deferred } from './support.ts'

describe('remote facts and local settlement are independent', () => {
  const f = fixtures()
  it.each(['before-commit', 'after-commit', 'unavailable', 'defect'] as const)(
    'one recovery reading after %s never upgrades unconfirmed',
    async mode => {
      const { runtime, state } = await f()
      let casCalls = 0,
        recoveryCalls = 0,
        recovering = false
      const wrapped: ClientLocalState = {
        async read() {
          if (!recovering) return state.read()
          recoveryCalls++
          if (mode === 'defect') throw new Error('must-not-leak-private-information')
          if (mode === 'unavailable') return { kind: 'failed', reason: 'unavailable' }
          return state.read()
        },
        async compareAndReplace(...args) {
          casCalls++
          if (mode === 'after-commit') await state.compareAndReplace(...args)
          recovering = true
          return { kind: 'unconfirmed' }
        },
      }
      const client = new Client({ ...runtime, state: wrapped, exchange: async () => ok('ok') })
      try {
        const use = await open(client)
        const result = await use.run({ action: 'logout' })
        expect(result.remote.status).toBe('success')
        expect(result.local).toMatchObject({
          status: 'unconfirmed',
          recovery: {
            observation:
              mode === 'after-commit'
                ? 'visible-this-operation'
                : mode === 'before-commit'
                  ? 'not-seen'
                  : 'unknown',
          },
        })
        expect(casCalls).toBe(1)
        expect(recoveryCalls).toBe(1)
        expect(exitStatus(result)).toBe(mode === 'defect' ? 70 : 5)
        if (mode === 'defect')
          expect(result.defect).toEqual({ stage: 'recovery', code: 'internal-defect' })
        expect(JSON.stringify(result)).not.toContain('private-information')
        expect(JSON.stringify(result)).not.toContain(logged.login!.presentation)
      } finally {
        await client.close()
      }
    },
  )
  it.each(['other-record', 'different-store'] as const)(
    'recovery observes %s without rewriting original uncertainty',
    async mode => {
      const { runtime, state } = await f()
      let recovering = false
      const wrapped: ClientLocalState = {
        async read() {
          const result = await state.read()
          return recovering && mode === 'different-store' && result.kind === 'read'
            ? { ...result, snapshot: { ...result.snapshot, storeId: 'another-store' } }
            : result
        },
        async compareAndReplace() {
          await replace(state, {
            ...logged,
            login: { presentation: 'new-secret', handle: 'new-handle' },
          })
          recovering = true
          return { kind: 'unconfirmed' }
        },
      }
      const client = new Client({ ...runtime, state: wrapped, exchange: async () => ok('ok') })
      try {
        const result = await client.runAction({ action: 'logout' })
        expect(result.local).toMatchObject({
          status: 'unconfirmed',
          recovery: {
            observation: mode === 'different-store' ? 'different-store' : 'visible-other-record',
            current: { loginStateHandle: 'new-handle' },
          },
        })
        expect(exitStatus(result)).toBe(5)
      } finally {
        await client.close()
      }
    },
  )
  it('shutdown waits for the unconfirmed recovery read after CAS has already returned', async () => {
    const { runtime, state } = await f()
    let recovering = false
    const entered = deferred(),
      release = deferred()
    const client = new Client({
      ...runtime,
      state: {
        async read() {
          if (recovering) {
            entered.resolve()
            await release.promise
          }
          return state.read()
        },
        async compareAndReplace() {
          recovering = true
          return { kind: 'unconfirmed' }
        },
      },
      exchange: async () => ok('ok'),
    })
    const use = await open(client),
      running = use.run({ action: 'logout' })
    await entered.promise
    let closed = false
    const closing = client.close().then(() => {
      closed = true
    })
    expect(closed).toBe(false)
    release.resolve()
    expect((await running).local.status).toBe('unconfirmed')
    await closing
    expect((await state.read()).kind).toBe('read')
  })
  it.each(['unavailable', 'invalid-record', 'unsupported-format', 'invalid-input'] as const)(
    'preserves successful remote logout with local not-installed %s',
    async reason => {
      const { runtime, state } = await f()
      const client = new Client({
        ...runtime,
        state: {
          read: () => state.read(),
          compareAndReplace: async () => ({ kind: 'not-installed', reason }),
        },
        exchange: async () => ok('ok'),
      })
      try {
        const result = await client.runAction({ action: 'logout' })
        expect(result).toMatchObject({
          remote: { status: 'success' },
          local: { status: 'not-installed', reason },
          use: 'reenter-required',
        })
        expect(exitStatus(result)).toBe(5)
        expect((await read(state)).value).toEqual(logged)
      } finally {
        await client.close()
      }
    },
  )
  it('a CAS defect is distinct from not-installed, with a stable safe diagnostic', async () => {
    const { runtime, state } = await f()
    const client = new Client({
      ...runtime,
      state: {
        read: () => state.read(),
        compareAndReplace: async () => {
          throw new Error('secret-sql-parameter')
        },
      },
      exchange: async () => ok('ok'),
    })
    try {
      const result = await client.runAction({ action: 'logout' })
      expect(result).toMatchObject({
        remote: { status: 'success' },
        local: { status: 'defect' },
        defect: { stage: 'settlement' },
        view: { source: 'none' },
      })
      expect(exitStatus(result)).toBe(70)
      expect(JSON.stringify(result)).not.toContain('secret-sql')
    } finally {
      await client.close()
    }
  })
})
