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
  SESSION_READ_PROTOCOL,
  decodeSessionExecution,
} from '@omne-harness/session-storage-sql/participants'
import type { DomainRef, SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { canonical } from '../testing/canonical.ts'
import { readExecutionRecords } from './execution-records.ts'
import { attemptOfAuthority } from './attempt-grant.ts'

const OWNER = 'session-adapters/conditions'
const LOGGER = 'session-adapters/conditions'
const ACTION = 'read-conditions'

export type DefaultModes = Readonly<{ modes: Modes; basis: DurableEvidence }>

export type DefaultModesFailure = Readonly<{ kind: 'unavailable'; diagnostic: string }>

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

function fromSession(failure: SessionFailure, what: string): Failure {
  return failure.kind === 'denied'
    ? denied
    : unavailable(`${what} is not readable (${failure.kind})`)
}

function directiveOf(
  collaboration: Modes['collaboration'],
  basis: DurableEvidence,
): ProgressionDirective {
  return { kind: collaboration === 'auto-drive' ? 'continue' : 'evaluate-completion', basis }
}

function openScope(work: WorkSnapshot): ContextScopeBinding | null {
  const open = (work.contextScopes ?? []).filter(binding => binding.ended === null)
  return open.length === 0 ? null : (open[open.length - 1] ?? null)
}

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

function modelOf(saved: SessionModelSelection): Adoption {
  const { name, basis } = saved.selection
  return { owner: basis.owner, name, revision: basis.revision, digest: basis.digest }
}

function bindingOf(resident: WorkSnapshot['residents'][number]): Adoption {
  return {
    owner: resident.admitted.owner,
    name: resident.capability,
    revision: resident.version,
    digest: resident.admitted.digest,
  }
}

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

  async function sessionOf(
    tenantText: string,
    domain: DomainRef,
    execution: string,
  ): Promise<Outcome<SessionId, Failure>> {
    const result = await ports.storage.read({
      domain,
      handler: SESSION_EXECUTION_HANDLER,
      protocol: SESSION_READ_PROTOCOL,
      requestKey: randomUUID(),
      input: { tenant: tenantText, execution },
    })
    if (result.kind !== 'read') return fail(unavailable('the execution index is not readable'))
    const indexed = decodeSessionExecution(result.output)
    if (indexed === 'malformed') return fail(unavailable('the execution index row is malformed'))
    return indexed === null ? fail(denied) : succeed(indexed.session as SessionId)
  }

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
    return succeed({ source, ...facts })
  }

  return { read }
}

class SessionConditions extends CurrentConditionsService<unknown> {
  readonly read: CurrentConditions<unknown>['read']
  constructor(ctx: Context, conditions: CurrentConditions<unknown>) {
    super(ctx)
    this.read = conditions.read
  }
}

type ReadSelection = Ports<unknown>['readModelSelection']

type SelectionLink = { read: ReadSelection | undefined }

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
