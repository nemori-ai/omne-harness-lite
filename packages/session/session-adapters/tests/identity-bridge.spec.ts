// AD-09: the identity bridge on real Cordis. What is checked: the bridge needs the identity
// verifier and is absent without it; it provides the `sessionIdentity` key and removes it on stop;
// a verified principal gets material bound to tenant, session, operation and command; a forged
// principal, a principal of another tenant and a value that identity never issued get `denied`;
// an identity source that cannot answer gets `unavailable`, never material.
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { inProcessPrincipalAuthority, type PrincipalVerifier } from '@omne-harness/identity'
import { PrincipalVerifierService } from '@omne-harness/identity/cordis'
import { sessionIdentityKey } from '@omne-harness/session-cordis-contract/cordis'
import type { SessionCommand } from '@omne-harness/session-contract'
import {
  creation,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  sessionId,
} from '@omne-harness/session-contract/testing'
import { SessionIdentityBridgeProvider } from '../src/cordis/identity-bridge.ts'

const access = memoryAccess<unknown>('placeholder')
const other = memoryOtherAccess<unknown>('placeholder')
const denied = { failure: { kind: 'denied', action: 'create' } }

const createCommand = (
  base: typeof access = access,
  operation = operationId('identity-create'),
  session = base.session,
): Extract<SessionCommand, { kind: 'create' }> => ({
  kind: 'create',
  input: { tenant: base.tenant, session, operation, creation: creation() },
})

/** An identity verifier service whose answer the test scripts. */
function verifierService(verify: PrincipalVerifier['verify']) {
  class Verifier extends PrincipalVerifierService {
    readonly verify = verify
  }
  return Verifier
}

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  await Promise.all(disposers.splice(0).map(dispose => dispose()))
})

/** Mounts a plugin on the root and disposes its fiber after the test. */
async function mount(ctx: Context, plugin: Parameters<Context['plugin']>[0]) {
  const fiber = await ctx.plugin(plugin)
  disposers.push(() => fiber.dispose())
  return fiber
}
const provides = (ctx: Context) => ctx.get(sessionIdentityKey) !== undefined

/** A real Cordis root with the in-process verifier and the bridge installed. */
async function assembled() {
  const authority = inProcessPrincipalAuthority()
  const ctx = new Context()
  await mount(ctx, verifierService(authority.verifier.verify))
  const bridge = await mount(ctx, SessionIdentityBridgeProvider)
  const system = authority.issuer.issueSystem({ component: 'scanner' })
  if (!('ok' in system)) throw new Error('fixture: system principal')
  const acting = (tenant: typeof access.tenant) => {
    const issued = authority.issuer.issueActingForTenant({
      actor: system.ok,
      tenant,
      work: { owner: 'test', work: 'work-secret-text' },
    })
    if (!('ok' in issued)) throw new Error('fixture: acting principal')
    return issued.ok
  }
  const prepare = (principal: unknown, command: SessionCommand, base = access) =>
    ctx.get(sessionIdentityKey)!.prepare({ ...base, principal }, command)
  return { authority, ctx, bridge, system: system.ok, acting, prepare }
}

describe('loading and stopping on real Cordis', () => {
  it('provides sessionIdentity and removes the key when the plugin stops', async () => {
    const { ctx, bridge } = await assembled()
    expect(sessionIdentityKey).toBe('sessionIdentity')
    expect(provides(ctx)).toBe(true)
    await bridge.dispose()
    expect(provides(ctx)).toBe(false)
  })

  it('stays absent while the identity verifier is absent and appears when it arrives', async () => {
    const ctx = new Context()
    await mount(ctx, SessionIdentityBridgeProvider)
    expect(provides(ctx)).toBe(false)
    await mount(
      ctx,
      verifierService(async () => ({ kind: 'rejected' })),
    )
    expect(provides(ctx)).toBe(true)
  })

  it('goes away with its verifier and is rebuilt on the verifier that replaces it', async () => {
    const first = inProcessPrincipalAuthority()
    const second = inProcessPrincipalAuthority()
    const ctx = new Context()
    const firstVerifier = await mount(ctx, verifierService(first.verifier.verify))
    await mount(ctx, SessionIdentityBridgeProvider)
    const system = first.issuer.issueSystem({ component: 'scanner' })
    if (!('ok' in system)) throw new Error('fixture')
    const given = await ctx
      .get(sessionIdentityKey)!
      .prepare({ ...access, principal: system.ok }, createCommand())
    expect(given).toHaveProperty('ok')

    await firstVerifier.dispose()
    expect(provides(ctx)).toBe(false)

    await mount(ctx, verifierService(second.verifier.verify))
    const rerun = await ctx
      .get(sessionIdentityKey)!
      .prepare({ ...access, principal: system.ok }, createCommand())
    expect(rerun).toEqual(denied)
  })

  it('answers unavailable, not material, through a handle held after the plugin stopped', async () => {
    const { ctx, bridge, system } = await assembled()
    const held = ctx.get(sessionIdentityKey)!
    await bridge.dispose()
    const answer = await held.prepare({ ...access, principal: system }, createCommand())
    expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner: 'identity' } })
  })
})

describe('material for a verified principal', () => {
  it('is bound to tenant, session, operation and command', async () => {
    const { system, acting, prepare } = await assembled()
    const material = async (
      principal: unknown,
      command: SessionCommand,
      base: typeof access = access,
    ) => {
      const answer = await prepare(principal, command, base)
      if (!('ok' in answer)) throw new Error(`no material: ${JSON.stringify(answer)}`)
      return answer.ok
    }
    const base = await material(acting(access.tenant), createCommand())
    expect(base).toMatchObject({ owner: 'identity', participant: 'identity-bridge' })
    // The same bound inputs give the same material, whichever verified principal carries them.
    expect(await material(system, createCommand())).toEqual(base)

    const sessionB = sessionId('another-session')
    const changed = [
      await material(acting(other.tenant), createCommand(other), other),
      await material(system, createCommand(access, undefined, sessionB), {
        ...access,
        session: sessionB,
      }),
      await material(system, createCommand(access, operationId('another-operation'))),
      await material(system, {
        ...createCommand(),
        input: {
          ...createCommand().input,
          creation: {
            ...createCommand().input.creation,
            requiredIdentities: [{ capability: 'login', name: 'another-identity' }],
          },
        },
      }),
      // The same input under another command kind.
      await material(system, {
        kind: 'setRelation',
        input: createCommand().input,
      } as unknown as SessionCommand),
      await material(system, {
        kind: 'control',
        input: { ...createCommand().input, intent: { kind: 'archive' } },
      }),
    ]
    for (const next of changed) expect(next.facts).not.toEqual(base.facts)
  })

  it('does not carry the identifying texts of the principal', async () => {
    const { acting, prepare } = await assembled()
    const text = JSON.stringify(await prepare(acting(access.tenant), createCommand()))
    expect(text).not.toContain('work-secret-text')
    expect(text).not.toContain('scanner')
  })
})

describe('refusal', () => {
  it('denies a hand-built copy of an issued principal', async () => {
    const { acting, prepare } = await assembled()
    // The copy has the shape of the issued principal but not its issue.
    const copy = { ...acting(access.tenant) }
    expect(await prepare(copy, createCommand())).toEqual(denied)
  })

  it('denies a principal that another authority issued', async () => {
    const { prepare } = await assembled()
    const system = inProcessPrincipalAuthority().issuer.issueSystem({ component: 'scanner' })
    if (!('ok' in system)) throw new Error('fixture')
    expect(await prepare(system.ok, createCommand())).toEqual(denied)
  })

  it.each([undefined, null, 'principal', 7, {}])(
    'denies a value that is no principal: %j',
    async value => {
      const { prepare } = await assembled()
      expect(await prepare(value, createCommand())).toEqual(denied)
    },
  )

  it('denies a genuine principal of another tenant, and gives no material', async () => {
    const { acting, prepare } = await assembled()
    expect(await prepare(acting(other.tenant), createCommand())).toEqual(denied)
  })

  it('denies a command that names another tenant or another session than the access', async () => {
    const { system, prepare } = await assembled()
    expect(await prepare(system, createCommand(other))).toEqual(denied)
    expect(
      await prepare(system, createCommand(access, undefined, sessionId('another-session'))),
    ).toEqual(denied)
  })
})

describe('an identity source that cannot answer', () => {
  const answerOf = async (verify: PrincipalVerifier['verify']) => {
    const ctx = new Context()
    await mount(ctx, verifierService(verify))
    await mount(ctx, SessionIdentityBridgeProvider)
    return ctx.get(sessionIdentityKey)!.prepare({ ...access, principal: {} }, createCommand())
  }
  const unavailable = { failure: { kind: 'unavailable', owner: 'identity' } }

  it('maps unavailable to unavailable with the identity source as owner', async () => {
    const answer = await answerOf(async () => ({
      kind: 'unavailable',
      diagnostic: 'store is down',
    }))
    expect(answer).toMatchObject(unavailable)
    expect(JSON.stringify(answer)).toContain('store is down')
  })

  it('maps a throwing verifier to unavailable, not to material or denial', async () => {
    const answer = await answerOf(async () => {
      throw new Error('boom')
    })
    expect(answer).toMatchObject(unavailable)
  })

  it('does not take a malformed verdict or a swapped principal as verified', async () => {
    const malformed = await answerOf(
      async () =>
        ({ kind: 'verified' }) as unknown as Awaited<ReturnType<PrincipalVerifier['verify']>>,
    )
    expect(malformed).toMatchObject(unavailable)
    const system = inProcessPrincipalAuthority().issuer.issueSystem({ component: 'scanner' })
    if (!('ok' in system)) throw new Error('fixture')
    const swapped = await answerOf(async () => ({ kind: 'verified', principal: system.ok }))
    expect(swapped).toMatchObject(unavailable)
  })
})
