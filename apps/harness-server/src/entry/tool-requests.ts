import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallAnswer } from '@omne-harness/agent'
import type { Failure } from '@omne-harness/agent-contract'
import type { AgentHostLocalPluginInput } from '@omne-harness/agent-host-local/cordis'
import { executionScopeBindingKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { writeJsonText } from '@omne-harness/json-text'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeScopeRef,
  type ScopeBindingSource,
  type ScopeRef,
} from '@omne-harness/runtime-context-contract'
import type {
  SessionAccess,
  SessionFailure,
  SessionId,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  sessionInquiryBinding,
  sessionInteractionBinding,
} from '@omne-harness/session-adapters/cordis'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { canonicalDigest } from '@omne-harness/tool'
import {
  describeCommandCallRejection,
  selectCommandText,
  type ToolAvailability,
  type ToolCatalog,
  type ToolConsumerProfile,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import { toolCatalogKey } from '@omne-harness/tool-cordis-contract/cordis'
import { toolRuntimeHolder } from '../rows/tool-runtime/holder.ts'
import { RELEASE_REQUEST_CONTEXT, runToolScope } from '../rows/tool-runtime/scope.ts'
import { verifySessionWork } from '../rows/tool-runtime/session-work.ts'
import { publishedViewPortsOf, readPublishedView } from '../rows/session-ad03/published-view.ts'
import {
  judgeMetaCommand,
  type SessionInquiryRead,
  type SessionInteractionRead,
} from './meta-capabilities.ts'
import { releaseOf, type ToolRelease } from './tool-release.ts'

export type ReleaseToolRequests = NonNullable<AgentHostLocalPluginInput['toolRequests']>
type DescribeInput = Parameters<ReleaseToolRequests['describe']>[0]
type PrepareInput = Parameters<ReleaseToolRequests['prepare']>[0]

export const TOOL_REQUESTS_OWNER = 'agentToolRequests'

export type ToolRequestPorts = Readonly<{
  verifier(): PrincipalVerifier | undefined
  catalog(): ToolCatalog<unknown> | undefined
  readWork(
    access: SessionAccess<unknown>,
  ): Promise<Outcome<WorkSnapshot, SessionFailure>> | undefined
  scopeBinding(): ScopeBindingSource | undefined
  release(): ToolRelease
  interaction: SessionInteractionRead
  inquiry: SessionInquiryRead
}>

const unavailable = (diagnostic: string) =>
  fail<Failure>({ kind: 'unavailable', owner: TOOL_REQUESTS_OWNER, diagnostic })
const denied = (action: string) => fail<Failure>({ kind: 'denied', action })

type Trusted = Extract<ToolRelease, { kind: 'trusted' }>

function commandOf(
  definition: ToolAvailability['definition'],
  effectiveArguments: string,
): Readonly<{ command: string | null }> | Readonly<{ answer: string }> {
  if (definition.kind === 'function') return { command: null }
  const selected = selectCommandText(
    definition.commands.map(command => command.name),
    effectiveArguments,
  )
  return 'failure' in selected
    ? { answer: describeCommandCallRejection(definition, selected.failure) }
    : { command: selected.ok }
}

async function sessionOf(
  ports: ToolRequestPorts,
  principal: unknown,
  tenant: TenantId,
): Promise<Outcome<SessionId, Failure>> {
  const verdict = await verifySessionWork(ports.verifier(), principal, tenant)
  switch (verdict.kind) {
    case 'unavailable':
      return unavailable(verdict.diagnostic)
    case 'denied':
      return denied('tool-request')
    default:
      return succeed(verdict.session as SessionId)
  }
}

function consumerOf(release: Trusted): ToolConsumerProfile {
  const { capabilities, conversion, attachmentAccess } = release.manifest.consumer
  return { capabilities, conversion, attachmentAccess }
}

async function availabilityOf(
  ports: ToolRequestPorts,
  release: Trusted,
  input: DescribeInput,
  session: SessionId,
): Promise<
  Outcome<
    | (Extract<ToolAvailability, { kind: 'available' }> & { command: string | null })
    | ToolCallAnswer,
    Failure
  >
> {
  const catalog = ports.catalog()
  if (catalog === undefined) return unavailable('tool catalog absent')
  const name = input.original.name
  if (!release.manifest.entries.some(entry => entry.asset.name === name))
    return unavailable(`${name} is not a release tool`)
  let answer: Awaited<ReturnType<ToolCatalog<unknown>['inspect']>>
  try {
    answer = await catalog.inspect({
      principal: input.principal,
      tenant: input.tenant,
      name,
      command: null,
      consumer: consumerOf(release),
    })
  } catch {
    return unavailable('tool catalog threw')
  }
  if ('failure' in answer)
    return answer.failure.kind === 'denied'
      ? denied('tool-request')
      : unavailable(`tool catalog answered ${answer.failure.kind}`)
  const availability = answer.ok
  if (availability.kind !== 'available' || availability.layer.kind !== 'official')
    return unavailable(`${name} is not available`)
  const selected = commandOf(availability.definition, input.effectiveArguments)
  if ('answer' in selected) return succeed({ kind: 'answered', text: selected.answer })
  const closed = await closedBySession(ports, input, session, selected.command)
  if ('failure' in closed) return closed
  return succeed(closed.ok ?? { ...availability, command: selected.command })
}

async function closedBySession(
  ports: ToolRequestPorts,
  input: DescribeInput,
  session: SessionId,
  command: string | null,
): Promise<Outcome<ToolCallAnswer | null, Failure>> {
  const access = { principal: input.principal, tenant: input.tenant, session }
  const verdict = await judgeMetaCommand(ports, access, input.original.name, command)
  switch (verdict.kind) {
    case 'unreadable':
      return unavailable(verdict.diagnostic)
    case 'closed':
      return succeed({ kind: 'answered', text: verdict.answer })
    default:
      return succeed(null)
  }
}

async function sessionScope(
  ports: ToolRequestPorts,
  tenant: TenantId,
  principal: unknown,
  session: SessionId,
): Promise<Outcome<ScopeRef, Failure>> {
  let read: Outcome<WorkSnapshot, SessionFailure> | undefined
  try {
    read = await ports.readWork({ principal, tenant, session })
  } catch {
    return unavailable('session read threw')
  }
  if (read === undefined) return unavailable('session absent')
  if ('failure' in read)
    return read.failure.kind === 'denied'
      ? denied('tool-request')
      : unavailable(`session read answered ${read.failure.kind}`)
  const binding = read.ok.contextScopes?.at(-1)
  if (binding === undefined) return unavailable('the session has no context scope')
  if (binding.ended !== null) return unavailable('the context scope of the session has ended')
  const scope = decodeScopeRef({ ref: binding.scope })
  return 'failure' in scope ? unavailable('the context scope is not a scope ref') : scope
}

async function tenantScope(
  ports: ToolRequestPorts,
  tenant: TenantId,
  scope: ScopeRef,
): Promise<Outcome<ScopeRef, Failure>> {
  const bindings = ports.scopeBinding()
  if (bindings === undefined) return unavailable('execution scope binding absent')
  let bound: Awaited<ReturnType<ScopeBindingSource['lookup']>>
  try {
    bound = await bindings.lookup(scope)
  } catch {
    return unavailable('execution scope binding threw')
  }
  switch (bound.kind) {
    case 'bound':
      return tenantEquals(bound.tenant, tenant) ? succeed(scope) : denied('tool-request-scope')
    case 'unbound':
      return denied('tool-request-scope')
    default:
      return unavailable(`execution scope binding answered ${bound.kind}`)
  }
}

async function currentScope(
  ports: ToolRequestPorts,
  tenant: TenantId,
  principal: unknown,
  session: SessionId,
): Promise<Outcome<ScopeRef, Failure>> {
  const scope = await sessionScope(ports, tenant, principal, session)
  return 'failure' in scope ? scope : tenantScope(ports, tenant, scope.ok)
}

export function createReleaseToolRequests(ports: ToolRequestPorts): ReleaseToolRequests {
  const trusted = (): Outcome<Trusted, Failure> => {
    const release = ports.release()
    return release.kind === 'trusted'
      ? succeed(release)
      : unavailable('release snapshot unavailable')
  }

  const describe: ReleaseToolRequests['describe'] = async input => {
    const release = trusted()
    if ('failure' in release) return release
    const session = await sessionOf(ports, input.principal, input.tenant)
    if ('failure' in session) return session
    const availability = await availabilityOf(ports, release.ok, input, session.ok)
    if ('failure' in availability) return availability
    return succeed(
      availability.ok.kind === 'answered'
        ? availability.ok
        : { kind: 'tool', definition: availability.ok.definition.adoption },
    )
  }

  const prepare: ReleaseToolRequests['prepare'] = async (input: PrepareInput) => {
    const release = trusted()
    if ('failure' in release) return release
    const session = await sessionOf(ports, input.principal, input.tenant)
    if ('failure' in session) return session
    const found = await availabilityOf(ports, release.ok, input, session.ok)
    if ('failure' in found) return found
    if (found.ok.kind === 'answered') return unavailable('the call is answered, not run')
    const { command, ...availability } = found.ok
    if (canonicalDigest(availability.definition.adoption) !== canonicalDigest(input.definition))
      return unavailable('the current definition differs from the described one')
    const entry = release.ok.manifest.entries.find(
      candidate => candidate.asset.name === availability.definition.name,
    )
    if (entry === undefined) return unavailable('release entry absent')
    const scope = await currentScope(ports, input.tenant, input.principal, session.ok)
    if ('failure' in scope) return scope
    let original: string
    try {
      original = writeJsonText(input.original.arguments)
    } catch {
      return fail({ kind: 'invalid', field: 'original.arguments', reason: 'not-json' })
    }
    const request: ToolInvokeRequest = {
      availability,
      command,
      arguments: { original, effective: input.effectiveArguments, complete: true },
      settings: entry.settings,
      context: RELEASE_REQUEST_CONTEXT,
      workspace: null,
      environment: availability.definition.declarations.environment,
      requesterScope: scope.ok,
      resources: [],
      scope: runToolScope(input.tenant, input.consumer),
      consumer: input.consumer,
      batchDecision: null,
      mode: 'foreground',
      limits: { concurrency: null, scopeBudget: null, foregroundMs: null, backgroundAfterMs: null },
    }
    return succeed(request)
  }

  return Object.freeze({ describe, prepare })
}

export function sessionWorkReaderOf(ctx: Context): ToolRequestPorts['readWork'] {
  const coordinator = ctx.intercept(sessionKey, { caller: 'coordinator' })
  return access => coordinator.get(sessionKey)?.work.readWork(access)
}

export function releaseToolRequestsOf(ctx: Context): ReleaseToolRequests {
  return createReleaseToolRequests({
    verifier: () => toolRuntimeHolder(ctx).verifier(),
    catalog: () => ctx.get(toolCatalogKey),
    readWork: sessionWorkReaderOf(ctx),
    scopeBinding: () => ctx.get(executionScopeBindingKey),
    release: () => releaseOf(ctx),
    interaction: async access => {
      const ports = publishedViewPortsOf(ctx)
      if (ports === null) return fail('the Session or Runtime Context services are absent')
      const view = await readPublishedView(ports, access, sessionInteractionBinding)
      return 'failure' in view ? view : succeed(view.ok.interaction)
    },
    inquiry: async access => {
      const ports = publishedViewPortsOf(ctx)
      if (ports === null) return fail('the Session or Runtime Context services are absent')
      const view = await readPublishedView(ports, access, sessionInquiryBinding)
      return 'failure' in view ? view : succeed(view.ok.inquiry.policy.onAsk)
    },
  })
}
