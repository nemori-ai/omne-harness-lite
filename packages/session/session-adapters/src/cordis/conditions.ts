// J06, the current conditions provider of the Session log combination (row `session-conditions`,
// R2-D145). It provides `agentConditions` and answers `CurrentConditions.read` from committed
// Session facts only. Nothing here is a default: a source that is absent closes the read with
// `unavailable`, an Authority that the Session does not hold as the current one is `stale-advance`,
// and another tenant's call cannot find the execution at all.
//
// The read follows the J06 row of the SPEC ("以原 Authority/grant 定位当前 Session Run"):
// 1. the tenant of the Access, its transaction domain and the execution index name the session of
//    `advance.execution`; the Session snapshot is read through the `session` face with the caller's
//    own Access, so the Session execution boundary checks the access (this plugin does not inject
//    `agentAccessCheck`, SPEC J06);
// 2. the active Run must hold the execution, and the attempt the Session issued the grant of this
//    Authority's attachment for (R2-D348, R2-D349) must be the Run's current attempt, as
//    `message-handoff.ts` checks it;
// 3. the fields come from the facts: the Run adoption (`configuration`), the collaboration mode of
//    the session (`progression`), the saved model selection (`model`), the open Runtime Context scope
//    of the session (`context`) and the resident tools (`bindings`). `source` is a digest of the five,
//    so the same facts give the same evidence; `previous` is compared and grants nothing.
import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {
  Access,
  Adoption,
  Authority,
  CurrentConditions,
  DurableEvidence,
  Failure,
  ProgressionDirective,
  Reply,
  RuntimeConditions,
} from '@omne-harness/agent-contract'
import { CurrentConditionsService } from '@omne-harness/agent-cordis-contract/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ContextScopeBinding,
  Modes,
  SessionFailure,
  SessionId,
  SessionModelSelection,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import {
  SESSION_EXECUTION_HANDLER,
  SESSION_PROTOCOL,
  decodeSessionExecution,
} from '@omne-harness/session-storage-sql/participants'
import type { DomainRef, SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { canonical } from '../testing/canonical.ts'
import { readExecutionRecords } from './agent-journal.ts'
import { attemptOfAuthority } from './attempt-grant.ts'

const OWNER = 'session-adapters/conditions'
const LOGGER = 'session-adapters/conditions'
const ACTION = 'read-conditions'

/** The default modes of a session: the value its tenant-default source stands for, and its basis. */
export type DefaultModes = Readonly<{ modes: Modes; basis: DurableEvidence }>

/** Why the default modes cannot be given: the owner of the source has no value for it now. */
export type DefaultModesFailure = Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * What the assembly hands to the provider: the resolver of a session's tenant-default modes. A
 * session created with `modes: { kind: 'tenant-default', source }` holds the source adoption only;
 * the resolver gives the modes that this exact source stands for, or `unavailable`. It never gives
 * the modes of another source, and it is a runtime object, not configuration.
 */
export type SessionConditionsInput = Readonly<{
  defaultModes(
    input: Readonly<{
      tenant: TenantId
      session: SessionId
      definition: WorkSnapshot['definition']
      source: Adoption
    }>,
  ): Promise<Outcome<DefaultModes, DefaultModesFailure>>
}>

type Ports<P> = Readonly<{
  storage: SqlStorage
  tenantDomainLookup: TenantDomainLookup
  readWork(
    access: Readonly<{ principal: P; tenant: TenantId; session: SessionId }>,
  ): Promise<Outcome<WorkSnapshot, SessionFailure>>
  readModelSelection(
    access: Readonly<{ principal: P; tenant: TenantId; session: SessionId }>,
  ): Promise<Outcome<SessionModelSelection, SessionFailure>>
}>

const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: OWNER,
  diagnostic,
})
const denied: Failure = { kind: 'denied', action: ACTION }
const stale: Failure = { kind: 'stale-advance' }

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** A Session read failure in the Agent's words: a refusal stays a refusal, the rest is unavailable. */
function fromSession(failure: SessionFailure, what: string): Failure {
  return failure.kind === 'denied'
    ? denied
    : unavailable(`${what} is not readable (${failure.kind})`)
}

/** The collaboration mode as the progression directive (session-and-run.md「协作」, mechanisms.md). */
function directiveOf(
  collaboration: Modes['collaboration'],
  basis: DurableEvidence,
): ProgressionDirective {
  return { kind: collaboration === 'auto-drive' ? 'continue' : 'evaluate-completion', basis }
}

/** The open Runtime Context scope of the session: the binding that has not ended. */
function openScope(work: WorkSnapshot): ContextScopeBinding | null {
  const open = (work.contextScopes ?? []).filter(binding => binding.ended === null)
  return open.length === 0 ? null : (open[open.length - 1] ?? null)
}

/** The evidence of one open scope binding: it names the scope, its generation and the commit. */
function scopeEvidence(
  tenantText: string,
  work: WorkSnapshot,
  binding: ContextScopeBinding,
): DurableEvidence {
  return {
    owner: 'session',
    record: binding.scope,
    revision: binding.generation,
    digest: sha256(
      canonical([tenantText, work.session, binding.scope, binding.generation, binding.operation]),
    ),
  }
}

/** The settings-side adoption basis of the saved model route (Agent SPEC「模型选择」1). */
function modelOf(saved: SessionModelSelection): Adoption {
  const { name, basis } = saved.selection
  return { owner: basis.owner, name, revision: basis.revision, digest: basis.digest }
}

/** A resident tool as the adoption that binds it: its admission names the owner and the digest. */
function bindingOf(resident: WorkSnapshot['residents'][number]): Adoption {
  return {
    owner: resident.admitted.owner,
    name: resident.capability,
    revision: resident.version,
    digest: resident.admitted.digest,
  }
}

/** The provider of one generation. */
function createConditions<P>(given: SessionConditionsInput, ports: Ports<P>): CurrentConditions<P> {
  async function domainOf(tenantText: string): Promise<Outcome<DomainRef, Failure>> {
    const found = await ports.tenantDomainLookup.lookup({ tenant: tenantText })
    return found.kind === 'ready'
      ? succeed(found.domain)
      : fail(
          unavailable(
            found.kind === 'unregistered'
              ? 'the tenant has no transaction domain'
              : found.diagnostic,
          ),
        )
  }

  /** The session that started `execution` for the tenant, by the execution index. */
  async function sessionOf(
    tenantText: string,
    domain: DomainRef,
    execution: string,
  ): Promise<Outcome<SessionId, Failure>> {
    const result = await ports.storage.read({
      domain,
      handler: SESSION_EXECUTION_HANDLER,
      protocol: SESSION_PROTOCOL,
      requestKey: randomUUID(),
      input: { tenant: tenantText, execution },
    })
    if (result.kind !== 'read') return fail(unavailable('the execution index is not readable'))
    const indexed = decodeSessionExecution(result.output)
    if (indexed === 'malformed') return fail(unavailable('the execution index row is malformed'))
    return indexed === null ? fail(denied) : succeed(indexed.session as SessionId)
  }

  /**
   * The current Run must hold the execution, and the Authority must be its current attempt: the
   * attempt the Session issued the grant of the Authority's attachment for. An attachment the
   * Agent did not record, or a grant the Session issued no attempt for, is stale; a snapshot
   * without its attempt records cannot prove it.
   */
  async function current(
    tenant: TenantId,
    session: SessionId,
    work: WorkSnapshot,
    advance: Authority,
  ): Promise<Outcome<Extract<WorkSnapshot['run'], { kind: 'active' }>, Failure>> {
    const run = work.run
    if (
      run.kind !== 'active' ||
      run.execution.execution !== advance.execution ||
      run.advance === null
    )
      return fail(stale)
    const records = await readExecutionRecords(ports, {
      tenant,
      session,
      execution: advance.execution,
    })
    if (records.kind === 'unavailable') return fail(unavailable(records.diagnostic))
    if (work.historyIndex === undefined)
      return fail(unavailable('the Session snapshot carries no attempt records'))
    const attempt = attemptOfAuthority(
      records.execution?.attachments ?? [],
      work.historyIndex.attempts,
      advance,
    )
    return attempt !== undefined && attempt.attempt === run.advance.attempt
      ? succeed(run)
      : fail(stale)
  }

  /** The collaboration mode the session holds now, with the evidence that declared it. */
  async function progressionOf(
    tenant: TenantId,
    session: SessionId,
    work: WorkSnapshot,
  ): Promise<Outcome<ProgressionDirective, Failure>> {
    const changed = [...(work.changes ?? [])]
      .reverse()
      .find(change => change.kind === 'collaboration-mode')
    if (changed !== undefined && changed.kind === 'collaboration-mode')
      return succeed(directiveOf(changed.value, changed.authorization))
    const modes = work.creation.modes
    if (modes.kind === 'explicit')
      return succeed(directiveOf(modes.value.collaboration, work.declarations))
    const resolved = await given.defaultModes({
      tenant,
      session,
      definition: work.definition,
      source: modes.source,
    })
    if ('failure' in resolved)
      return fail(
        unavailable(`the tenant-default modes are not readable: ${resolved.failure.diagnostic}`),
      )
    return succeed(directiveOf(resolved.ok.modes.collaboration, resolved.ok.basis))
  }

  async function read(
    input: Access<P> & Readonly<{ advance: Authority; previous: DurableEvidence | null }>,
  ): Reply<RuntimeConditions> {
    const { principal, tenant, advance } = input
    const encoded = tenantCodec.encode(tenant)
    if (!encoded.ok) return fail(denied)
    const tenantText = encoded.value
    const domain = await domainOf(tenantText)
    if ('failure' in domain) return domain
    const session = await sessionOf(tenantText, domain.ok, advance.execution)
    if ('failure' in session) return session
    const access = { principal, tenant, session: session.ok }
    const work = await ports.readWork(access)
    if ('failure' in work) return fail(fromSession(work.failure, 'the Session snapshot'))
    const run = await current(tenant, session.ok, work.ok, advance)
    if ('failure' in run) return run
    const progression = await progressionOf(tenant, session.ok, work.ok)
    if ('failure' in progression) return progression
    const saved = await ports.readModelSelection(access)
    if ('failure' in saved) return fail(fromSession(saved.failure, 'the saved model selection'))
    const scope = openScope(work.ok)
    if (scope === null) return fail(unavailable('the session has no open Runtime Context scope'))
    const facts = {
      configuration: run.ok.adoption,
      progression: progression.ok,
      model: modelOf(saved.ok),
      context: scopeEvidence(tenantText, work.ok, scope),
      bindings: work.ok.residents.map(bindingOf),
    }
    const source: DurableEvidence = {
      owner: OWNER,
      record: `${tenantText}/${session.ok}/${run.ok.run}`,
      revision: '1',
      digest: sha256(canonical(facts)),
    }
    // `previous` is the basis of the last preparation. The same facts give the same source; a
    // different one makes the Agent recompute its unrecorded candidate. Neither grants anything.
    return succeed({ source, ...facts })
  }

  return { read }
}

/** `agentConditions`, made by the body of the plugin. */
class SessionConditions extends CurrentConditionsService<unknown> {
  readonly read: CurrentConditions<unknown>['read']
  constructor(ctx: Context, conditions: CurrentConditions<unknown>) {
    super(ctx)
    this.read = conditions.read
  }
}

type ReadSelection = Ports<unknown>['readModelSelection']

/** Where the selection sub-plugin of the current generation leaves its read; empty while it is not running. */
type SelectionLink = { read: ReadSelection | undefined }

/**
 * The sub-plugin `session-conditions-selection`: the saved model selection is a read of the
 * `intake` and `maintainer` classes (session-contract SPEC「控制与模型选择」), and a plugin calls
 * `session` with one caller class only (AD-00 rule 1). So this sub-plugin injects `session` as
 * `maintainer` and reads nothing else; the caller's own Access goes through, so the access check
 * stays the Session's. While it is not running, the selection read answers `unavailable`.
 */
function createSelectionPlugin(link: SelectionLink) {
  return {
    name: 'session-conditions-selection',
    inject: { [sessionKey]: { caller: 'maintainer' as const } },
    apply(ctx: Context) {
      const session = ctx[sessionKey]
      const read: ReadSelection = access => session.work.readModelSelection(access)
      link.read = read
      ctx.effect(() => () => {
        if (link.read === read) link.read = undefined
      })
    },
  }
}

/**
 * The plugin of `agentConditions` (row `session-conditions`). It needs `storage`, the trusted
 * `tenantDomainLookup` and `session` with the `coordinator` class; while any is absent it stays
 * pending and provides nothing. Its sub-plugin `session-conditions-selection` reads the saved model
 * selection with the `maintainer` class. It has no configuration. Stopping makes every call, also
 * through a reference held from before, answer `unavailable`.
 */
export function createSessionConditionsPlugin<P>(input: SessionConditionsInput) {
  return {
    name: 'session-conditions',
    inject: {
      [storageKey]: null,
      [tenantDomainLookupKey]: null,
      [sessionKey]: { caller: 'coordinator' as const },
    },
    async apply(ctx: Context) {
      let stopped = false
      const session = ctx[sessionKey]
      const logger = ctx.logger(LOGGER)
      const link: SelectionLink = { read: undefined }
      const conditions = createConditions<P>(input, {
        storage: ctx[storageKey],
        tenantDomainLookup: ctx[tenantDomainLookupKey],
        readWork: access => session.work.readWork(access),
        readModelSelection: access =>
          link.read?.(access) ??
          Promise.resolve(
            fail({
              kind: 'unavailable' as const,
              owner: OWNER,
              diagnostic: 'the selection sub-plugin is not running',
            }),
          ),
      })
      const guarded: CurrentConditions<unknown>['read'] = async input => {
        if (stopped) return fail(unavailable('the conditions provider has stopped'))
        try {
          return await conditions.read(input as Access<P> & typeof input)
        } catch (cause) {
          logger.error(`a dependency threw: ${String(cause)}`)
          return fail(unavailable(`a dependency threw: ${String(cause)}`))
        }
      }
      new SessionConditions(ctx, { read: guarded })
      ctx.effect(() => () => {
        stopped = true
      })
      await ctx.plugin(createSelectionPlugin(link))
    },
  }
}
