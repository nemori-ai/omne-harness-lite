import type { Context } from '@deepseek-ai/cordis'
import type {
  ActingForTenantPrincipal,
  PrincipalVerification,
  PrincipalVerifier,
} from '@omne-harness/identity'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type {
  AuthorityDecision,
  Eligibility,
  HolderAction,
  HolderDecision,
  ProducerAction,
  RuntimeContextAuthority,
  RuntimeContextTrust,
  ScopeBindingSource,
  ScopeRef,
} from '@omne-harness/runtime-context-contract'
import {
  RuntimeContextTrustService,
  runtimeContextTrustKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import {
  createSessionRuntimeContextTrust,
  type SessionReplayFacts,
  type StepCommittedBlocks,
} from '@omne-harness/session-adapters'
import {
  sessionReplayFactsKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { EntryEnv, EntryObjectModule } from '../types.ts'
import { verifierOf } from './principals.ts'
import {
  decideSessionModesProducer,
  type SessionModesAuthoritySources,
} from './session-modes-authority.ts'
import type { SessionScopeSource } from './session-scope-source.ts'

const REFUSED: AuthorityDecision<unknown> = Object.freeze({ kind: 'refused' })
const UNAVAILABLE: AuthorityDecision<unknown> = Object.freeze({ kind: 'unavailable' })

async function verify(verifier: PrincipalVerifier, value: unknown): Promise<PrincipalVerification> {
  try {
    return await verifier.verify(value)
  } catch {
    return { kind: 'unavailable', diagnostic: 'the principal verifier threw an exception' }
  }
}

function tenantOf(action: HolderAction<unknown>): TenantId | undefined {
  switch (action.kind) {
    case 'prepare':
      return action.change.tenant
    case 'commit':
      return action.input.kind === 'registration' ? action.input.change.tenant : action.input.tenant
    case 'issue':
      return action.material.tenant
    case 'begin-replay':
    case 'finish-replay':
      return action.tenant
    case 'revoke':
      return undefined
    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }
}

export type RuntimeContextAuthorityOptions = SessionModesAuthoritySources

async function readerScopeDecision(
  options: RuntimeContextAuthorityOptions,
  verified: ActingForTenantPrincipal,
  tenant: TenantId,
  scope: ScopeRef,
): Promise<AuthorityDecision<unknown>> {
  try {
    const owner = await options.scopeOwners?.lookup(scope)
    if (owner === undefined || owner.kind === 'unavailable') return UNAVAILABLE
    if (owner.kind === 'unknown') return { kind: 'unknown' }
    if (
      owner.kind !== 'bound' ||
      !tenantEquals(owner.tenant, tenant) ||
      owner.session !== verified.work.work
    )
      return REFUSED
    return { kind: 'authorized', principal: verified, current: () => true }
  } catch {
    return UNAVAILABLE
  }
}

export function createRuntimeContextAuthority(
  options: RuntimeContextAuthorityOptions,
): RuntimeContextAuthority<unknown> {
  async function decide(
    principal: unknown,
    tenant: TenantId | undefined,
  ): Promise<AuthorityDecision<unknown>> {
    const verification = await verify(options.verifier, principal)
    if (verification.kind === 'unavailable') return UNAVAILABLE
    if (verification.kind === 'rejected') return REFUSED
    const verified = verification.principal
    if (verified.kind !== 'acting-for-tenant') return REFUSED
    if (tenant === undefined || !tenantEquals(verified.tenant, tenant)) return REFUSED
    return { kind: 'authorized', principal: verified, current: () => true }
  }
  return Object.freeze({
    holder(principal: unknown, action: HolderAction<unknown>): Promise<HolderDecision<unknown>> {
      return decide(principal, tenantOf(action))
    },
    async producer(
      principal: unknown,
      action: ProducerAction,
    ): Promise<AuthorityDecision<unknown>> {
      const verification = await verify(options.verifier, principal)
      if (verification.kind === 'unavailable') return UNAVAILABLE
      if (verification.kind === 'rejected' || verification.principal.kind !== 'acting-for-tenant')
        return REFUSED
      return decideSessionModesProducer(options, verification.principal, action)
    },
    async reader(
      principal: unknown,
      eligibility: Eligibility<unknown>,
    ): Promise<AuthorityDecision<unknown>> {
      const tenant = eligibility.tenant
      const scope = Object.freeze({ ref: eligibility.scope.ref })
      const verification = await verify(options.verifier, principal)
      if (verification.kind === 'unavailable') return UNAVAILABLE
      if (verification.kind === 'rejected') return REFUSED
      const verified = verification.principal
      if (verified.kind !== 'acting-for-tenant' || !tenantEquals(verified.tenant, tenant))
        return REFUSED
      if (verified.actor.component !== 'sessionWorkPrincipals' || verified.work.owner !== 'session')
        return REFUSED
      return readerScopeDecision(options, verified, tenant, scope)
    },
  })
}

export const unavailableScopeBindings: ScopeBindingSource = Object.freeze({
  lookup: () => Promise.resolve({ kind: 'unavailable' as const }),
})

export type ReplayFactsReader = () => SessionReplayFacts | undefined

export function readReplayFactsService(env: EntryEnv): SessionReplayFacts | undefined {
  const facts: SessionReplayFacts | undefined = env
    .readTrusted(sessionReplayFactsKey)
    .get(sessionReplayFactsKey)
  return facts
}

const FACTS_UNAVAILABLE: StepCommittedBlocks = Object.freeze({ kind: 'unavailable' })

export function entryReplayFacts(
  read: ReplayFactsReader,
  trace: (diagnostic: string) => void = () => {},
): SessionReplayFacts & Readonly<{ diagnostic: string }> {
  return Object.freeze({
    diagnostic:
      'no running facts sub-plugin of row session-ad03 provides sessionReplayFacts; the holder facts are unavailable',
    async stepCommittedBlocks(
      ...args: Parameters<SessionReplayFacts['stepCommittedBlocks']>
    ): Promise<StepCommittedBlocks> {
      try {
        const facts = read()
        if (facts === undefined) return FACTS_UNAVAILABLE
        return await facts.stepCommittedBlocks(...args)
      } catch {
        trace('reading the session replay facts threw; answered unavailable')
        return FACTS_UNAVAILABLE
      }
    },
  })
}

type Generation = { retired: boolean }

type TrustState = Readonly<{
  verifier: PrincipalVerifier
  scopes: SessionScopeSource | undefined
  sessionWork: SessionModesAuthoritySources['sessionWork']
  replayFacts: SessionReplayFacts
  currents: WeakMap<Context, () => boolean>
  byReader: WeakMap<Context, RuntimeContextTrust<unknown>>
}>

function trustFor(state: TrustState, reader: Context): RuntimeContextTrust<unknown> {
  const made = state.byReader.get(reader)
  if (made !== undefined) return made
  const current = currentForReader(state.currents, reader)
  const trust = createSessionRuntimeContextTrust<unknown>({
    authority: createRuntimeContextAuthority({
      verifier: state.verifier,
      scopeOwners: state.scopes?.scopeOwners,
      sessionWork: state.sessionWork,
    }),
    bindings: state.scopes?.bindings ?? unavailableScopeBindings,
    current: { capture: () => ({ current }) },
    replayFacts: state.replayFacts,
  })
  state.byReader.set(reader, trust)
  return trust
}

class EntryRuntimeContextTrust extends RuntimeContextTrustService<unknown> {
  readonly state: TrustState
  constructor(
    ctx: Context,
    verifier: PrincipalVerifier,
    replayFacts: SessionReplayFacts,
    scopes?: SessionScopeSource,
    sessionWork?: SessionModesAuthoritySources['sessionWork'],
  ) {
    super(ctx)
    this.state = {
      verifier,
      scopes,
      sessionWork,
      replayFacts,
      currents: new WeakMap(),
      byReader: new WeakMap(),
    }
  }
  get authority(): RuntimeContextTrust<unknown>['authority'] {
    return trustFor(this.state, this.ctx).authority
  }
  get bindings(): RuntimeContextTrust<unknown>['bindings'] {
    return trustFor(this.state, this.ctx).bindings
  }
}

export function createRuntimeContextTrustModule(
  scopes?: SessionScopeSource,
  readReplayFacts: (env: EntryEnv) => SessionReplayFacts | undefined = readReplayFactsService,
): EntryObjectModule {
  return {
    name: runtimeContextTrustKey,
    implementation: 'real',
    install(scope, env) {
      const logger = scope.logger('runtimeContextTrust')
      const replayFacts = entryReplayFacts(
        () => readReplayFacts(env),
        diagnostic => logger.debug(diagnostic),
      )
      const sessionWork: NonNullable<SessionModesAuthoritySources['sessionWork']> = async input => {
        const service = env.readTrusted(sessionWorkPrincipalsKey).get(sessionWorkPrincipalsKey)
        if (service === undefined)
          return {
            failure: {
              kind: 'unavailable',
              owner: sessionWorkPrincipalsKey,
              diagnostic: 'the session work principal source is not available',
            },
          }
        return service.forSession(input)
      }
      new EntryRuntimeContextTrust(scope, verifierOf(env), replayFacts, scopes, sessionWork)
    },
  }
}

export const runtimeContextTrust = createRuntimeContextTrustModule()

/** Captures a caller fiber before the first await; retirement is irreversible. */
export function currentForReader(
  readers: WeakMap<Context, () => boolean>,
  reader: Context,
): () => boolean {
  const found = readers.get(reader)
  if (found !== undefined) return found
  const generation: Generation = { retired: false }
  reader.effect(
    () => () => {
      generation.retired = true
    },
    'entryAuthority.generation',
  )
  const current = () => !generation.retired
  readers.set(reader, current)
  return current
}
