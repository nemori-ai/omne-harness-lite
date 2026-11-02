// AD-10 on real Cordis: the evidence bridge. What is checked: the bridge needs all three narrow
// sources and is absent while one of them is absent; it provides `sessionEvidence` and removes it
// on stop; it asks exactly the sources that the material table names for the command; a source
// failure comes back as the source gave it, a throw or a malformed answer is `unavailable` with the
// source's key, and a command with no material at all is `unavailable`, not an empty success; a
// command whose tenant was not minted, and an initialization material bound to another tenant or
// session, get `denied`; a login confirmation passes only for `startRun`.
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { GuardCommand, SessionCommand, SessionFailure } from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  creation,
  guard,
  initializationFixtureFacts,
  initializationFixtureGuard,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  sessionId,
} from '@omne-harness/session-contract/testing'
import {
  SessionAdoptionSourceService,
  SessionCustodySourceService,
  SessionProductionSourceService,
  sessionEvidenceKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { SessionEvidenceBridgeProvider } from '../src/cordis/evidence-bridge.ts'

const A = memoryAccess<unknown>('caller')
const B = memoryOtherAccess<unknown>('caller')

type SourceName = 'adoption' | 'production' | 'custody'
type Answer = (
  command: SessionCommand,
) => Promise<{ ok: readonly GuardCommand[] } | { failure: SessionFailure }>

/** A command of the given kind; the bridge reads only the kind, the tenant and the session. */
function command(kind: SessionCommand['kind'], base: typeof A = A): SessionCommand {
  return {
    kind,
    input: { tenant: base.tenant, session: base.session, operation: operationId(`op-${kind}`) },
  } as unknown as SessionCommand
}

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  await Promise.all(disposers.splice(0).map(dispose => dispose()))
})
async function mount(ctx: Context, plugin: Parameters<Context['plugin']>[0]) {
  const fiber = await ctx.plugin(plugin)
  disposers.push(() => fiber.dispose())
  return fiber
}

/** The three source services; each records the commands it was asked and answers by script. */
function sources(scripts: Partial<Record<SourceName, Answer>> = {}) {
  const asked: { source: SourceName; kind: string }[] = []
  const answer =
    (source: SourceName): Answer =>
    async given => {
      asked.push({ source, kind: given.kind })
      const scripted = scripts[source]
      return scripted ? scripted(given) : succeed([guard(`${source}-source`, source, given.kind)])
    }
  class Adoption extends SessionAdoptionSourceService {
    readonly prepare = answer('adoption') as SessionAdoptionSourceService['prepare']
  }
  class Production extends SessionProductionSourceService {
    readonly prepare = answer('production') as SessionProductionSourceService['prepare']
  }
  class Custody extends SessionCustodySourceService {
    readonly prepare = answer('custody') as SessionCustodySourceService['prepare']
  }
  return { asked, services: { adoption: Adoption, production: Production, custody: Custody } }
}

async function assembled(scripts: Partial<Record<SourceName, Answer>> = {}) {
  const ctx = new Context()
  const { asked, services } = sources(scripts)
  const fibers = {
    adoption: await mount(ctx, services.adoption),
    production: await mount(ctx, services.production),
    custody: await mount(ctx, services.custody),
  }
  const bridge = await mount(ctx, SessionEvidenceBridgeProvider)
  const prepare = (given: SessionCommand) => ctx.get(sessionEvidenceKey)!.prepare(given)
  return { ctx, asked, fibers, bridge, prepare }
}
const provides = (ctx: Context) => ctx.get(sessionEvidenceKey) !== undefined

describe('loading and stopping on real Cordis', () => {
  it('provides sessionEvidence and removes the key when the plugin stops', async () => {
    const { ctx, bridge } = await assembled()
    expect(sessionEvidenceKey).toBe('sessionEvidence')
    expect(provides(ctx)).toBe(true)
    await bridge.dispose()
    expect(provides(ctx)).toBe(false)
  })

  it.each(['adoption', 'production', 'custody'] as const)(
    'stays absent while the %s source is absent and appears when it arrives',
    async missing => {
      const ctx = new Context()
      const { services } = sources()
      for (const name of ['adoption', 'production', 'custody'] as const)
        if (name !== missing) await mount(ctx, services[name])
      await mount(ctx, SessionEvidenceBridgeProvider)
      expect(provides(ctx)).toBe(false)
      await mount(ctx, services[missing])
      expect(provides(ctx)).toBe(true)
    },
  )

  it('goes away with a source and prepares through the source that replaces it', async () => {
    const { ctx, fibers } = await assembled()
    await fibers.custody.dispose()
    expect(provides(ctx)).toBe(false)
    const next = sources({ custody: async () => succeed([guard('next', 'custody-next', 'x')]) })
    await mount(ctx, next.services.custody)
    const answer = await ctx.get(sessionEvidenceKey)!.prepare(command('completeConsumption'))
    expect(answer).toEqual(succeed([guard('next', 'custody-next', 'x')]))
  })

  it('answers unavailable through a handle held after the plugin stopped', async () => {
    const { ctx, bridge, asked } = await assembled()
    const held = ctx.get(sessionEvidenceKey)!
    await bridge.dispose()
    expect(await held.prepare(command('startRun'))).toMatchObject({
      failure: { kind: 'unavailable', owner: 'sessionEvidence' },
    })
    expect(asked).toEqual([])
  })
})

describe('the material table, split by command', () => {
  it.each([
    ['create', ['adoption']],
    ['startRun', ['adoption']],
    ['reload', ['adoption']],
    ['change', ['adoption']],
    ['freeze', ['adoption']],
    ['completeInitialization', ['adoption', 'production']],
    ['receive', ['production']],
    ['preserveResult', ['production', 'custody']],
    ['completeConsumption', ['custody']],
    ['completeExternalConsumption', ['custody']],
  ] as const)('%s asks %j and hands over their material in that order', async (kind, names) => {
    const { asked, prepare } = await assembled()
    const answer = await prepare(command(kind))
    expect(asked).toEqual(names.map(source => ({ source, kind })))
    expect(answer).toEqual(succeed(names.map(source => guard(`${source}-source`, source, kind))))
  })

  it('asks no source and hands no material for a command outside the table', async () => {
    const { asked, prepare } = await assembled()
    expect(await prepare(command('claim'))).toEqual(succeed([]))
    expect(asked).toEqual([])
  })
})

describe('failures of the sources', () => {
  it('hands a source failure back as the source gave it, and asks no further source', async () => {
    const refusal = fail({ kind: 'denied' as const, action: 'preserveResult' })
    const down = fail({ kind: 'unavailable' as const, owner: 'custody-store', diagnostic: 'down' })
    const refused = await assembled({ production: async () => refusal })
    expect(await refused.prepare(command('preserveResult'))).toEqual(refusal)
    expect(refused.asked.map(item => item.source)).toEqual(['production'])
    const unreachable = await assembled({ custody: async () => down })
    expect(await unreachable.prepare(command('preserveResult'))).toEqual(down)
  })

  it('answers unavailable with the source key when a source throws or answers malformed', async () => {
    const thrown = await assembled({
      adoption: async () => {
        throw new Error('crashed')
      },
    })
    expect(await thrown.prepare(command('reload'))).toMatchObject({
      failure: { kind: 'unavailable', owner: 'sessionAdoptionSource' },
    })
    const malformed = await assembled({
      custody: async () => succeed([{ owner: 'custody' } as unknown as GuardCommand]),
    })
    expect(await malformed.prepare(command('completeConsumption'))).toMatchObject({
      failure: { kind: 'unavailable', owner: 'sessionCustodySource' },
    })
  })

  it('answers unavailable, not an empty success, when no source gives material', async () => {
    const { prepare } = await assembled({
      production: async () => succeed([]),
      custody: async () => succeed([]),
    })
    expect(await prepare(command('preserveResult'))).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    // One empty source next to one with material is fine.
    const { prepare: partly } = await assembled({ production: async () => succeed([]) })
    expect(await partly(command('preserveResult'))).toEqual(
      succeed([guard('custody-source', 'custody', 'preserveResult')]),
    )
  })
})

describe('the boundary checks of the bridge', () => {
  it('refuses a command whose tenant was not minted, before it asks any source', async () => {
    const { asked, prepare } = await assembled()
    const forged = {
      kind: 'startRun',
      input: { ...command('startRun').input, tenant: { organization: 'org', account: 'acc' } },
    } as unknown as SessionCommand
    expect(await prepare(forged)).toEqual(fail({ kind: 'denied', action: 'startRun' }))
    expect(asked).toEqual([])
  })

  it('refuses an initialization material bound to another tenant or session than the command', async () => {
    const create = (
      base: typeof A,
      session = base.session,
    ): Extract<SessionCommand, { kind: 'create' }> => ({
      kind: 'create',
      input: {
        tenant: base.tenant,
        session,
        operation: operationId('create'),
        creation: creation(),
      },
    })
    const materialOf = (given: Extract<SessionCommand, { kind: 'create' }>) =>
      initializationFixtureGuard(
        initializationFixtureFacts(given, null, adoptedInitializationFixture(given), []),
      )
    const ours = materialOf(create(A))
    const own = await assembled({ adoption: async () => succeed([ours]) })
    expect(await own.prepare(create(A))).toEqual(succeed([ours]))

    const theirs = await assembled({ adoption: async () => succeed([materialOf(create(B))]) })
    expect(await theirs.prepare(create(A))).toEqual(fail({ kind: 'denied', action: 'create' }))
    const otherSession = await assembled({
      adoption: async () => succeed([materialOf(create(A, sessionId('session-2')))]),
    })
    expect(await otherSession.prepare(create(A))).toEqual(
      fail({ kind: 'denied', action: 'create' }),
    )
  })

  it('passes a login confirmation for startRun only', async () => {
    const login = guard('adoption-source', 'login-entry', 'first-input-origin')
    const { prepare } = await assembled({
      adoption: async given => succeed([guard('adoption-source', 'adoption', given.kind), login]),
    })
    expect(await prepare(command('startRun'))).toEqual(
      succeed([guard('adoption-source', 'adoption', 'startRun'), login]),
    )
    expect(await prepare(command('reload'))).toMatchObject({
      failure: { kind: 'unavailable', owner: 'sessionAdoptionSource' },
    })
  })
})
