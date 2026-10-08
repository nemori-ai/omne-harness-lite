import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { Client } from '../src/client.ts'
import { AI15, AI16, AI50, AR8, OG36, og } from '../src/routes.ts'
import { exitStatus } from '@omne-harness-lite/governance-client-operations'
import type {
  ActionPreview,
  InputPrompt,
  PromptResult,
} from '@omne-harness-lite/governance-client-operations'
import {
  actor,
  center,
  configured,
  deferred,
  fixtures,
  logged,
  ok,
  open,
  read,
  replace,
} from './support.ts'

const next: PromptResult = { kind: 'continue', secrets: {} }
const login = { action: 'login', payload: { loginIdentifier: 'person' } }
const change = { action: 'invoke', operation: AI50, payload: {} }
const members = { action: 'invoke', operation: og(27), payload: {}, readMode: 'refresh' }
const unknown = {
  ...logged,
  login: { presentation: logged.login!.presentation, handle: logged.login!.handle },
}

describe('CG2 fixed capture and interactive input', () => {
  const f = fixtures()
  it.each(['register', 'login'] as const)(
    '%s previews verified center before obtaining the only credential slot',
    async action => {
      const { client, exchange, health } = await f(configured)
      exchange.mockResolvedValue(
        ok(
          action === 'login'
            ? { loginState: 'NEW-PRIVATE', loginStateHandle: 'new-handle' }
            : 'registered',
        ),
      )
      const prompt = vi.fn<InputPrompt>(async preview => {
        expect(health).toHaveBeenCalledTimes(1)
        expect(exchange).not.toHaveBeenCalled()
        expect(preview).toMatchObject({
          intent: { action, payload: { loginIdentifier: 'person' } },
          origin: { centerId: center.centerId, accountId: null, loginStateHandle: null },
          source: 'verified-center',
        })
        expect(Object.isFrozen(preview.intent)).toBe(true)
        return { kind: 'continue', secrets: { credential: 'INPUT-PRIVATE' } }
      })
      const result = await client.runPrepared({ ...login, action }, prompt)
      expect(prompt).toHaveBeenCalledTimes(1)
      expect(exchange.mock.calls[0]![1]).toMatchObject({
        operation: action === 'login' ? AI15 : AR8,
        payload: { loginIdentifier: 'person', credential: 'INPUT-PRIVATE' },
      })
      expect(JSON.stringify(result)).not.toMatch(/INPUT-PRIVATE|NEW-PRIVATE/)
      if (action === 'login') expect(result.local.status).toBe('installed')
    },
  )
  it.each([
    'https://user:PRIVATE@example.invalid',
    'https://example.invalid/?secret=PRIVATE',
    'https://example.invalid/#PRIVATE',
    'http://example.invalid',
  ])('rejects unsafe configuration %s before any callback or transport', async endpoint => {
    const { client, health } = await f(null)
    const prompt = vi.fn<InputPrompt>(async () => next)
    const result = await client.runPrepared(
      { action: 'configure', endpoint, trust: { mode: 'ca' } },
      prompt,
    )
    expect(result.admission.reason).toBe('invalid-input')
    expect(prompt).not.toHaveBeenCalled()
    expect(health).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('PRIVATE')
  })
  it.each([
    '-----BEGIN PRIVATE KEY-----\nPRIVATE\n-----END PRIVATE KEY-----',
    '-----BEGIN CERTIFICATE-----\nINVALID\n-----END CERTIFICATE-----',
    'prefix garbage',
  ])('does not forward non-CA material into a public preview', async certificateAuthorities => {
    const { client, health } = await f(null)
    const prompt = vi.fn<InputPrompt>(async () => next)
    const result = await client.runPrepared(
      {
        action: 'configure',
        endpoint: center.endpoint,
        trust: { mode: 'ca', certificateAuthorities },
      },
      prompt,
    )
    expect(result.admission.reason).toBe('invalid-input')
    expect(prompt).not.toHaveBeenCalled()
    expect(health).not.toHaveBeenCalled()
  })
  it('first configuration previews normalized endpoint and system trust before health', async () => {
    const { client, health } = await f(null)
    const result = await client.runPrepared(
      { action: 'configure', endpoint: 'https://CENTER.example.invalid', trust: { mode: 'ca' } },
      async preview => {
        expect(health).not.toHaveBeenCalled()
        expect(preview).toMatchObject({
          intent: { endpoint: center.endpoint, trust: { mode: 'ca', source: 'system' } },
          endpoint: center.endpoint,
          origin: { centerId: null },
          source: 'local-selection',
        })
        return next
      },
    )
    expect(result.local.status).toBe('installed')
  })
  it.each(['configure', 'health'] as const)(
    '%s cancel occurs before target health',
    async action => {
      const { client, health } = await f(configured)
      const result = await client.runPrepared(
        action === 'configure'
          ? { action, endpoint: center.endpoint, trust: center.trust }
          : { action },
        async () => ({ kind: 'cancelled' }),
      )
      expect(health).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        admission: { reason: 'invalid-input' },
        remote: { status: 'not-attempted', stage: 'none' },
        view: { source: 'none' },
      })
    },
  )
  it.each([login, change, members, { action: 'logout' }])(
    'rejects mismatched secret slots without the target: $action $operation',
    async intent => {
      const { client, exchange } = await f()
      const result = await client.runPrepared(intent, async () => ({
        kind: 'continue',
        secrets: intent.action === 'login' ? {} : { credential: 'PRIVATE' },
      }))
      expect(result.admission.reason).toBe('invalid-input')
      expect(exchange).not.toHaveBeenCalled()
      expect(result.remote).toMatchObject({
        status: 'not-attempted',
        stage: 'health',
        sendAttempted: false,
      })
    },
  )
  it('prepares unknown account for interactive logout, with no intermediate CAS', async () => {
    const { client, state, exchange } = await f(unknown)
    const result = await client.runPrepared({ action: 'logout' }, async preview => {
      expect(preview.origin.accountId).toBe(actor.account)
      expect((await read(state)).value!.login!.accountId).toBeUndefined()
      expect(exchange).toHaveBeenCalledTimes(1)
      return next
    })
    expect(exchange.mock.calls.map(x => (x[1] as { operation: string }).operation)).toEqual([
      OG36,
      AI16,
    ])
    expect(result.local.status).toBe('installed')
    expect((await read(state)).value!.login).toBeUndefined()
  })
  it('retains identity preparation and one original CAS when input is cancelled', async () => {
    const { runtime, state } = await f(unknown)
    const cas = vi.fn(state.compareAndReplace.bind(state))
    const client = new Client({
      ...runtime,
      state: { read: () => state.read(), compareAndReplace: cas },
    })
    const result = await client.runPrepared(change, async () => {
      expect(cas).not.toHaveBeenCalled()
      return { kind: 'cancelled' }
    })
    expect(result).toMatchObject({
      origin: { accountId: actor.account },
      admission: { reason: 'invalid-input' },
      remote: { status: 'not-attempted', stage: 'identity', reply: { operation: OG36 } },
      local: { status: 'installed' },
      view: { source: 'none' },
    })
    expect(cas).toHaveBeenCalledTimes(1)
    expect(exitStatus(result)).toBe(2)
    await client.close()
  })
  it('callback exceptions keep preparation facts while removing the original secret diagnostic', async () => {
    const { client, exchange } = await f(unknown)
    const result = await client.runPrepared(change, async () => {
      throw new Error('SECRET-EXCEPTION')
    })
    expect(result).toMatchObject({
      admission: { status: 'admitted' },
      defect: { stage: 'input' },
      remote: { status: 'not-attempted', stage: 'identity' },
      local: { status: 'installed' },
    })
    expect(exchange).toHaveBeenCalledTimes(1)
    expect(exitStatus(result)).toBe(70)
    expect(JSON.stringify(result)).not.toContain('SECRET-EXCEPTION')
  })
  it('previews original identity and sends original login after an external switch; CAS cannot overwrite it', async () => {
    const { client, state, exchange } = await f()
    exchange.mockResolvedValue(ok([actor]))
    const newer = {
      ...logged,
      login: { presentation: 'OTHER-PRIVATE', handle: 'new-handle', accountId: 'other-account' },
    }
    const result = await client.runPrepared(members, async preview => {
      expect(preview.origin).toMatchObject({
        accountId: actor.account,
        loginStateHandle: logged.login!.handle,
      })
      await replace(state, newer)
      return next
    })
    expect(exchange.mock.calls[0]![1]).toMatchObject({
      presentedLoginState: logged.login!.presentation,
    })
    expect(result.local.status).toBe('conflict')
    expect((await read(state)).value).toEqual(newer)
  })
  it('captures nonsecret payload before await and leaves expectedTenant unchanged', async () => {
    const { client, exchange } = await f()
    const input = {
      action: 'invoke',
      operation: og(23),
      payload: { invitedAccount: 'invited-account', expectedTenant: { ...actor } },
    }
    const result = await client.runPrepared(input, async preview => {
      expect(preview.origin.expectedTenant).toEqual(actor)
      input.payload.expectedTenant.account = 'changed-account'
      return next
    })
    expect(result.origin.expectedTenant).toEqual(actor)
    expect(exchange.mock.calls[0]![1]).toMatchObject({ payload: { expectedTenant: actor } })
  })
  it('does not query again or touch login activity for a prefer-copy hit', async () => {
    const { client, exchange, health } = await f({
      ...logged,
      cache: [
        {
          centerId: center.centerId,
          accountId: actor.account,
          operation: og(27),
          payload: {},
          result: [actor],
          acquiredAt: '2026-09-25T01:00:00Z',
        },
      ],
    })
    const prompt = vi.fn<InputPrompt>(async preview => {
      expect(preview.source).toBe('local-selection')
      return next
    })
    const result = await client.runPrepared({ ...members, readMode: 'prefer-copy' }, prompt)
    expect(result.view.source).toBe('copy')
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(exchange).not.toHaveBeenCalled()
    expect(health).not.toHaveBeenCalled()
  })
  it.each(['root', 'use'] as const)(
    '%s closing aborts but waits for actual input completion and forbids late continue',
    async owner => {
      const { client, exchange, state } = await f()
      const use = await open(client),
        entered = deferred(),
        release = deferred()
      let signal: AbortSignal | undefined
      const prompt: InputPrompt = async (_, value) => {
        signal = value
        entered.resolve()
        await release.promise
        return {
          kind: 'continue',
          secrets: { currentCredential: 'OLD-PRIVATE', newCredential: 'NEW-PRIVATE' },
        }
      }
      const pending = use.runPrepared(change, prompt)
      await entered.promise
      expect((await use.run(members)).admission.reason).toBe('busy')
      let closed = false
      const closing = (owner === 'root' ? client.close() : use.close()).then(() => {
        closed = true
      })
      expect(signal!.aborted).toBe(true)
      await Promise.resolve()
      expect(closed).toBe(false)
      release.resolve()
      const result = await pending
      await closing
      expect(result.admission.reason).toBe('invalid-input')
      expect(exchange).not.toHaveBeenCalled()
      expect((await state.read()).kind).toBe('read')
    },
  )
  it('root pre-login close waits for the callback and does not install a late login', async () => {
    const { client, exchange, state } = await f(configured)
    const entered = deferred(),
      release = deferred()
    const pending = client.runPrepared(login, async (_, signal) => {
      entered.resolve()
      await release.promise
      expect(signal.aborted).toBe(true)
      return { kind: 'continue', secrets: { credential: 'PRIVATE' } }
    })
    await entered.promise
    let closed = false
    const closing = client.close().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    release.resolve()
    expect((await pending).admission.reason).toBe('invalid-input')
    await closing
    expect(exchange).not.toHaveBeenCalled()
    expect((await read(state)).value).toEqual(configured)
  })
  it('close while health is pending suppresses both identity preparation and prompt', async () => {
    const { client, health, exchange } = await f(unknown)
    const entered = deferred(),
      release = deferred()
    health.mockImplementation(async () => {
      entered.resolve()
      await release.promise
      return {
        kind: 'health',
        reply: { reachable: true, centerId: center.centerId, version: 'test' },
      }
    })
    const prompt = vi.fn<InputPrompt>(async () => next)
    const pending = client.runPrepared(change, prompt)
    await entered.promise
    const closing = client.close()
    release.resolve()
    await pending
    await closing
    expect(exchange).not.toHaveBeenCalled()
    expect(prompt).not.toHaveBeenCalled()
  })
  it('previews only the original CA digest and rejects appended private key material', async () => {
    const certificateAuthorities = readFileSync(
      new URL(
        '../../../tenancy/governance-center-entry-node/tests/fixtures/tls/ca.pem',
        import.meta.url,
      ),
      'utf8',
    )
    const { client, health } = await f(null)
    const intent = {
      action: 'configure',
      endpoint: center.endpoint,
      trust: { mode: 'ca', certificateAuthorities },
    }
    const prompt = vi.fn<InputPrompt>(async preview => {
      expect(JSON.stringify(preview)).not.toContain('BEGIN CERTIFICATE')
      expect(preview.intent).toMatchObject({
        trust: {
          mode: 'ca',
          source: 'explicit',
          sha256: createHash('sha256').update(certificateAuthorities).digest('hex'),
        },
      })
      return next
    })
    expect((await client.runPrepared(intent, prompt)).local.status).toBe('installed')
    expect(health.mock.calls[0]![0].trust).toEqual(intent.trust)
    const rejected = await client.runPrepared(
      {
        ...intent,
        trust: {
          mode: 'ca',
          certificateAuthorities: certificateAuthorities + '-----BEGIN PRIVATE KEY-----PRIVATE',
        },
      },
      prompt,
    )
    expect(rejected.admission.reason).toBe('invalid-input')
    expect(prompt).toHaveBeenCalledTimes(1)
  })
  it('fills AI50 credentials only after the verified identity preview and clears the old login', async () => {
    const { client, state, exchange } = await f()
    const result = await client.runPrepared(change, async preview => {
      expect(JSON.stringify(preview)).not.toContain(logged.login!.presentation)
      expect(preview.intent).toEqual(change)
      expect(preview.origin.accountId).toBe(actor.account)
      return {
        kind: 'continue',
        secrets: { currentCredential: 'OLD-PRIVATE', newCredential: 'NEW-PRIVATE' },
      }
    })
    expect(exchange.mock.calls[0]![1]).toMatchObject({
      operation: AI50,
      payload: { currentCredential: 'OLD-PRIVATE', newCredential: 'NEW-PRIVATE' },
    })
    expect(result).toMatchObject({
      remote: { status: 'success' },
      local: { status: 'installed' },
      use: 'reenter-required',
    })
    expect((await read(state)).value!.login).toBeUndefined()
    expect(JSON.stringify(result)).not.toMatch(/OLD-PRIVATE|NEW-PRIVATE/)
  })
  it('cancellation retains an unknown local preparation commit and waits for its one recovery read', async () => {
    const { runtime, state } = await f(unknown)
    const recovering = deferred(),
      release = deferred()
    let recovery = false
    const local = {
      async read() {
        if (recovery) {
          recovering.resolve()
          await release.promise
          throw new Error('PRIVATE')
        }
        return state.read()
      },
      async compareAndReplace() {
        recovery = true
        return { kind: 'unconfirmed' as const }
      },
    }
    const client = new Client({ ...runtime, state: local })
    const pending = client.runPrepared(change, async () => ({ kind: 'cancelled' }))
    await recovering.promise
    let closed = false
    const closing = client.close().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    release.resolve()
    const result = await pending
    await closing
    expect(result).toMatchObject({
      remote: { status: 'not-attempted', stage: 'identity' },
      local: { status: 'unconfirmed', recovery: { observation: 'unknown' } },
      defect: { stage: 'recovery' },
    })
    expect(exitStatus(result)).toBe(70)
  })
  it('a target switch invalidates the identity read prepared before the prompt', async () => {
    const { client, state } = await f(unknown)
    const result = await client.runPrepared(
      {
        action: 'invoke',
        operation: og(37),
        payload: { expectedTenant: actor, targetTenant: { ...actor, organization: 'another-org' } },
      },
      async () => next,
    )
    expect(result.remote.status).toBe('success')
    expect((await read(state)).value!.cache.filter(c => c.operation === OG36)).toEqual([])
  })
  it('schema resources match both independent original inputs without overwriting v1', () => {
    for (const version of [1, 2]) {
      const published = readFileSync(
        createRequire(import.meta.url).resolve(
          `@omne-harness-lite/governance-client-operations/schema${version === 1 ? '' : '/v2'}`,
        ),
        'utf8',
      )
      const authority = readFileSync(
        new URL(
          `../../../core/governance-client-operations/tests/fixtures/operation-v${version}.schema.json`,
          import.meta.url,
        ),
        'utf8',
      )
      expect(published).toBe(authority)
    }
  })
  it('a close between prompt completion and prefer-copy delivery suppresses the old view', async () => {
    const { client } = await f({
      ...logged,
      cache: [
        {
          centerId: center.centerId,
          accountId: actor.account,
          operation: og(27),
          payload: {},
          result: [actor],
          acquiredAt: '2026-09-25T01:00:00Z',
        },
      ],
    })
    let closing: Promise<void> | undefined
    const result = await client.runPrepared({ ...members, readMode: 'prefer-copy' }, async () => {
      queueMicrotask(() =>
        queueMicrotask(() => {
          closing = client.close()
        }),
      )
      return next
    })
    await closing
    expect(result).toMatchObject({
      admission: { reason: 'invalid-input' },
      view: { source: 'none' },
    })
  })

  it('close during failed refresh prevents automatic fallback and preserves the health failure', async () => {
    const { client, health } = await f({
      ...logged,
      cache: [
        {
          centerId: center.centerId,
          accountId: actor.account,
          operation: og(27),
          payload: {},
          result: [actor],
          acquiredAt: '2026-09-25T01:00:00Z',
        },
      ],
    })
    const entered = deferred(),
      release = deferred()
    health.mockImplementation(async () => {
      entered.resolve()
      await release.promise
      return { kind: 'unavailable', reason: 'connection' }
    })
    const prompt = vi.fn<InputPrompt>(async () => next)
    const pending = client.runPrepared(members, prompt)
    await entered.promise
    const closing = client.close()
    release.resolve()
    const result = await pending
    await closing
    expect(result).toMatchObject({
      admission: { reason: 'invalid-input' },
      remote: { stage: 'health', transportFailure: 'connection', sendAttempted: false },
      view: { source: 'none' },
    })
    expect(prompt).not.toHaveBeenCalled()
  })
})
