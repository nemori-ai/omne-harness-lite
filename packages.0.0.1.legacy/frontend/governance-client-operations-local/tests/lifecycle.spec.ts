import { describe, expect, it } from 'vitest'
import type { ClientLocalState } from '@omne-harness-lite/client-local-state'
import { Client } from '../src/client.ts'
import { og } from '../src/routes.ts'
import {
  actor,
  configured,
  deferred,
  fixtures,
  logged,
  ok,
  open,
  read,
  replace,
} from './support.ts'

const members = { action: 'invoke', operation: og(27), payload: {}, readMode: 'refresh' }
describe('fixed use and complete lifecycle', () => {
  const f = fixtures()
  it('pure cache revision changes are accepted but a different login stops this use', async () => {
    const { client, state, exchange } = await f()
    exchange.mockResolvedValue(ok([actor]))
    const use = await open(client)
    await replace(state, logged)
    expect((await use.run(members)).remote.status).toBe('success')
    await replace(state, {
      ...logged,
      login: {
        presentation: 'other-private-bearer',
        handle: 'other-handle',
        accountId: 'other-account',
      },
    })
    const blocked = await use.run(members)
    expect(blocked).toMatchObject({
      admission: { reason: 'selection-changed' },
      origin: { accountId: actor.account, loginStateHandle: logged.login!.handle },
      use: 'reenter-required',
    })
    expect(exchange).toHaveBeenCalledTimes(1)
  })
  it('rejects concurrent actions without queuing and closes only after the in-flight write settles', async () => {
    const { runtime, state } = await f()
    const networkEntered = deferred(),
      releaseNetwork = deferred(),
      casEntered = deferred(),
      releaseCas = deferred()
    const blockedState: ClientLocalState = {
      read: () => state.read(),
      async compareAndReplace(...args) {
        casEntered.resolve()
        await releaseCas.promise
        return state.compareAndReplace(...args)
      },
    }
    const client = new Client({
      ...runtime,
      state: blockedState,
      exchange: async () => {
        networkEntered.resolve()
        await releaseNetwork.promise
        return ok([actor])
      },
    })
    const use = await open(client)
    const running = use.run(members)
    await networkEntered.promise
    expect((await use.run(members)).admission.reason).toBe('busy')
    let closed = false
    const closing = client.close().then(() => {
      closed = true
    })
    await expect(use.run(members)).rejects.toMatchObject({ reason: 'closed' })
    expect(closed).toBe(false)
    releaseNetwork.resolve()
    await casEntered.promise
    expect(closed).toBe(false)
    releaseCas.resolve()
    expect((await running).local.status).toBe('installed')
    await closing
    expect((await state.read()).kind).toBe('read') // borrowed provider is still open
    await client.close()
  })
  it('includes openUse creation in shutdown and never leaks a late use', async () => {
    const { runtime, state } = await f()
    const entered = deferred(),
      release = deferred()
    const client = new Client({
      ...runtime,
      state: {
        compareAndReplace: (...args) => state.compareAndReplace(...args),
        async read() {
          entered.resolve()
          await release.promise
          return state.read()
        },
      },
    })
    const opening = client.openUse()
    await entered.promise
    let closed = false
    const closing = client.close().then(() => {
      closed = true
    })
    expect(closed).toBe(false)
    release.resolve()
    expect(await opening).toEqual({ kind: 'blocked', reason: 'reenter-required' })
    await closing
    await expect(client.openUse()).rejects.toMatchObject({ reason: 'closed' })
  })
  it('late logout reports original success plus CAS conflict and preserves the newer login', async () => {
    const { client, state, exchange } = await f()
    const entered = deferred(),
      release = deferred()
    exchange.mockImplementation(async () => {
      entered.resolve()
      await release.promise
      return ok('ok')
    })
    const use = await open(client),
      pending = use.run({ action: 'logout' })
    await entered.promise
    const other = {
      ...logged,
      login: { presentation: 'new-secret', handle: 'new-handle', accountId: 'other-account' },
    }
    await replace(state, other)
    release.resolve()
    const result = await pending
    expect(result).toMatchObject({
      remote: { status: 'success' },
      local: { status: 'conflict' },
      use: 'reenter-required',
      origin: { loginStateHandle: logged.login!.handle },
    })
    expect((await read(state)).value).toEqual(other)
  })
  it('prevents entering actions while a TUI use is open; closing the UI does not log out', async () => {
    const { client, state, exchange } = await f()
    const use = await open(client)
    expect(
      (
        await client.runAction({
          action: 'login',
          payload: { loginIdentifier: 'person', credential: 'secret' },
        })
      ).admission.reason,
    ).toBe('busy')
    await use.close()
    expect(exchange).not.toHaveBeenCalled()
    expect((await read(state)).value).toEqual(logged)
  })
  it('reserves the pre-login phase before waiting, and keeps health independent', async () => {
    const entered = deferred(),
      release = deferred()
    const { client, health } = await f(configured)
    health.mockImplementation(async () => {
      entered.resolve()
      await release.promise
      return { kind: 'entry-answer', answer: 'version-mismatch' }
    })
    const logging = client.runAction({
      action: 'login',
      payload: { loginIdentifier: 'person', credential: 'secret' },
    })
    await entered.promise
    expect(await client.openUse()).toEqual({ kind: 'blocked', reason: 'busy' })
    release.resolve()
    await logging
    expect(await client.openUse()).toEqual({ kind: 'blocked', reason: 'not-logged-in' })
  })
})
