import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  fixtures,
  center,
  configured,
  logged,
  actor,
  ok,
  rejected,
  unavailable,
  open,
  read,
  replace,
  deferred,
} from './support.ts'
import { AI15, AI16, AI50, AR8, OG36, og, READ_OPERATIONS } from '../src/routes.ts'
import { exitStatus } from '@omne-harness-lite/governance-client-operations'
import { finish, reportFrame } from '../src/report.ts'
import { captureAction, validReport } from '../src/validation.ts'
import type { ActionInput, ActionReport } from '@omne-harness-lite/governance-client-operations'
import type { Runtime } from '../src/actions.ts'

const examples: { definition: string; valid: boolean; value: unknown }[] = JSON.parse(
  readFileSync(
    new URL(
      '../../../../.meta_harness/design/spec/compositions/governance-client-operations/v1/examples.json',
      import.meta.url,
    ),
    'utf8',
  ),
)
const outputs = examples
  .filter(e => e.valid && e.definition === 'Output')
  .map(e => e.value as ActionReport)
const inputs = examples
  .filter(e => e.valid && e.definition === 'Input')
  .map(e => e.value as ActionInput)

describe('canonical actions through real CLS', () => {
  const f = fixtures()
  for (const input of inputs.filter(i => ['invoke', 'register', 'login'].includes(i.action))) {
    const operation =
      input.action === 'invoke' ? input.operation : input.action === 'login' ? AI15 : AR8
    it(`projects ${operation}`, async () => {
      const response = outputs.find(o => o.operation === operation && o.remote.status === 'success')
        ?.remote.reply?.reply
      expect(response).toBeDefined()
      const { client, exchange, state } = await f()
      exchange.mockResolvedValue({
        kind: 'reply',
        sendAttempted: true,
        reply:
          operation === AI15
            ? { result: { loginState: 'new-private-bearer', loginStateHandle: 'new-handle' } }
            : response!,
      })
      // OG36 is the authority for account identity, so use the example's own account.
      if (operation === OG36 && response !== undefined && 'result' in response) {
        const account = (response.result as { account: string }).account
        await replace(state, { ...logged, login: { ...logged.login!, accountId: account } })
      }
      const result = await client.runAction(input)
      expect(result.defect).toBeUndefined()
      expect(result.remote.status).toBe('success')
      expect(result.view.source).toBe('online')
      expect(validReport(result)).toBe(true)
      expect(exchange).toHaveBeenCalledTimes(1)
      const envelope = exchange.mock.calls[0]![1] as Record<string, unknown>
      expect(envelope['payload']).toEqual('payload' in input ? input.payload : undefined)
      expect(envelope['presentedLoginState']).toBe(
        input.action === 'invoke' ? logged.login!.presentation : undefined,
      )
      expect(JSON.stringify(result)).not.toContain('new-private-bearer')
      expect(JSON.stringify(result)).not.toContain(logged.login!.presentation)
      if (operation === AI15)
        expect((await read(state)).value?.login).toEqual({
          presentation: 'new-private-bearer',
          handle: 'new-handle',
        })
    })
  }
  it('binds only a health-verified center and preserves selected login on same-center reconfiguration', async () => {
    const { client, state, health } = await f(null)
    const configure = { action: 'configure', endpoint: center.endpoint, trust: center.trust }
    expect(await client.runAction(configure)).toMatchObject({
      remote: { status: 'success', stage: 'health', sendAttempted: false },
      local: { status: 'installed' },
    })
    await replace(state, logged)
    expect(
      (await client.runAction({ ...configure, endpoint: 'https://new.example.invalid/' })).local
        .status,
    ).toBe('installed')
    expect((await read(state)).value?.login).toEqual(logged.login)
    health.mockResolvedValue({
      kind: 'health',
      reply: { reachable: true, centerId: '22222222222222222222222222222222', version: 'other' },
    })
    const mismatch = await client.runAction(configure)
    expect(mismatch).toMatchObject({
      admission: { reason: 'center-mismatch' },
      remote: { status: 'not-attempted' },
      local: { status: 'not-requested' },
    })
  })
  it.each(['unavailable', 'invalid-input', 'login-state-rejected'] as const)(
    'health %s is a malformed reply, not a login verdict',
    async answer => {
      const { client, state, health, exchange } = await f()
      health.mockResolvedValue({ kind: 'entry-answer', answer })
      const result = await client.runAction({ action: 'logout' })
      expect(result).toMatchObject({
        remote: { status: 'unavailable', stage: 'health', transportFailure: 'response-invalid' },
        local: { status: 'not-requested' },
      })
      expect(result.remote.answer).toBeUndefined()
      expect(exchange).not.toHaveBeenCalled()
      expect((await read(state)).value).toEqual(logged)
    },
  )
  it('preflights login without sending credentials when the center differs', async () => {
    const { client, health, exchange } = await f()
    health.mockResolvedValue({
      kind: 'health',
      reply: { reachable: true, centerId: '22222222222222222222222222222222', version: 'other' },
    })
    expect(
      (
        await client.runAction({
          action: 'login',
          payload: { loginIdentifier: 'person', credential: 'private-password' },
        })
      ).admission.reason,
    ).toBe('center-mismatch')
    expect(exchange).not.toHaveBeenCalled()
  })
  it('registration interrupted is unknown, never a confirmed rejection or automatic retry', async () => {
    const { client, exchange } = await f(configured)
    exchange.mockResolvedValue(rejected('interrupted'))
    const result = await client.runAction({
      action: 'register',
      payload: { loginIdentifier: 'person', credential: 'private-password' },
    })
    expect(result.remote).toMatchObject({
      status: 'unknown',
      reply: { reply: { failure: 'interrupted' } },
    })
    expect(exitStatus(result)).toBe(3)
    expect(exchange).toHaveBeenCalledTimes(1)
  })
  it('account preparation uses the same bearer and one combined CAS', async () => {
    const { client, state, exchange } = await f({
      ...logged,
      login: { presentation: logged.login!.presentation, handle: logged.login!.handle },
    })
    exchange.mockResolvedValueOnce(ok(actor)).mockResolvedValueOnce(ok([actor]))
    const before = await read(state)
    const result = await client.runAction({
      action: 'invoke',
      operation: og(27),
      payload: {},
      readMode: 'refresh',
    })
    expect(result.origin.accountId).toBe(actor.account)
    expect((await read(state)).revision).toBe(before.revision + 1)
    expect((await read(state)).value?.cache.map(c => c.operation)).toEqual([OG36, og(27)])
    expect(exchange.mock.calls.map(c => (c[1] as { operation: string }).operation)).toEqual([
      OG36,
      og(27),
    ])
    for (const call of exchange.mock.calls)
      expect(call[1]).toMatchObject({ presentedLoginState: logged.login!.presentation })
  })
  it('identity preparation rejection does not issue the target, and clears only a rejected login', async () => {
    const { client, state, exchange } = await f({
      ...logged,
      login: { presentation: logged.login!.presentation, handle: logged.login!.handle },
    })
    exchange.mockResolvedValue({
      kind: 'entry-answer',
      answer: 'login-state-rejected',
      sendAttempted: true,
    })
    const result = await client.runAction({ action: 'invoke', operation: og(27), payload: {} })
    expect(result).toMatchObject({
      remote: { stage: 'identity', sendAttempted: false, answer: 'login-state-rejected' },
      use: 'reenter-required',
      local: { status: 'installed' },
    })
    expect((await read(state)).value).toEqual(configured)
    expect(exchange).toHaveBeenCalledTimes(1)
  })
  it('does not preserve the preparatory current-tenant copy after a successful switch', async () => {
    const { client, state, exchange } = await f({
      ...logged,
      login: { presentation: logged.login!.presentation, handle: logged.login!.handle },
    })
    exchange.mockResolvedValueOnce(ok(actor)).mockResolvedValueOnce(ok('ok'))
    const result = await client.runAction({
      action: 'invoke',
      operation: og(37),
      payload: { expectedTenant: actor, targetTenant: { ...actor, organization: 'org-other' } },
    })
    expect(result.defect).toBeUndefined()
    expect((await read(state)).value?.cache).toEqual([])
  })
  it.each([AI50, AI16])(
    'possibly sent %s ends the use without pretending to clear local selection',
    async operation => {
      const { client, state, exchange } = await f()
      const use = await open(client)
      exchange.mockResolvedValue(unavailable())
      const payload =
        operation === AI16
          ? { loginStateHandle: logged.login!.handle }
          : { currentCredential: 'old-secret', newCredential: 'new-secret' }
      const result = await use.run({ action: 'invoke', operation, payload })
      expect(result).toMatchObject({
        remote: { status: 'unknown' },
        local: { status: 'not-requested' },
        use: 'reenter-required',
      })
      expect((await read(state)).value).toEqual(logged)
      expect((await use.run({ action: 'logout' })).admission.reason).toBe('reenter-required')
      expect(exchange).toHaveBeenCalledTimes(1)
    },
  )
  it('captures input before waiting and does not print password material', async () => {
    const pause = deferred(),
      entered = deferred()
    const { client, exchange } = await f(configured, {
      health: async () => {
        entered.resolve()
        await pause.promise
        return {
          kind: 'health',
          reply: { reachable: true, centerId: center.centerId, version: 'test' },
        }
      },
    })
    exchange.mockResolvedValue(ok('registered'))
    const input = {
      action: 'register',
      payload: { loginIdentifier: 'original', credential: 'original-password' },
    }
    const pending = client.runAction(input)
    await entered.promise
    input.payload.credential = 'changed-password'
    pause.resolve()
    const result = await pending
    expect(exchange.mock.calls[0]![1]).toMatchObject({
      payload: { credential: 'original-password' },
    })
    expect(JSON.stringify(result)).not.toContain('password')
  })
  it('rejects malformed inputs before touching transport or state', async () => {
    const { client, exchange, health } = await f()
    for (const input of [
      undefined,
      { action: 'invoke', operation: AI15, payload: {} },
      {
        action: 'invoke',
        operation: AI50,
        payload: { currentCredential: 'x', newCredential: 'y' },
        readMode: 'refresh',
      },
    ]) {
      expect((await client.runAction(input)).admission.reason).toBe('invalid-input')
    }
    expect(exchange).not.toHaveBeenCalled()
    expect(health).not.toHaveBeenCalled()
  })
  it('removes an invalid view without flattening already known remote and local facts', () => {
    const frame = reportFrame(
      captureAction({
        action: 'invoke',
        operation: AI50,
        payload: { currentCredential: 'a', newCredential: 'b' },
      }),
    )
    frame.remote = {
      status: 'success',
      stage: 'operation',
      sendAttempted: true,
      reply: { operation: AI50, reply: { result: 'ok' } },
    }
    frame.local = { status: 'unconfirmed', recovery: { observation: 'unknown' } }
    frame.view = {
      source: 'online',
      data: { operation: AI15, reply: { result: { loginState: 'secret' } } },
    }
    const result = finish(frame)
    expect(result).toMatchObject({
      remote: { status: 'success' },
      local: { status: 'unconfirmed' },
      defect: { stage: 'output' },
      view: { source: 'none' },
    })
    expect(exitStatus(result)).toBe(70)
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})
