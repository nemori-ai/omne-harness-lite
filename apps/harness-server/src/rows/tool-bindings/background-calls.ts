import type { Context } from '@deepseek-ai/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { readJsonText } from '@omne-harness/json-text'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  deriveSessionOperation,
  type BackgroundCallView,
  type SessionFailure,
  type SessionId,
  type SessionWork,
} from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  FixedToolRequest,
  ToolInvocationQueries,
  ToolInvocationRef,
} from '@omne-harness/tool-contract'
import {
  commandArguments,
  type CallAccess,
  type ToolExecutionScope,
} from '@omne-harness/tool-contract/provider'
import { toolRuntimeKey, type ToolRuntimeService } from '@omne-harness/tool-cordis-contract/cordis'
import {
  attachBackgroundCalls,
  type BackgroundCallItem,
  type BackgroundFailure,
  type BackgroundOutputPart,
  type BackgroundReply,
  type BoundBackgroundCalls,
} from '@omne-harness/tool-definitions'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { verifySessionWork } from '../tool-runtime/session-work.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>
type Work = Pick<SessionWork<unknown>, 'readBackgroundCalls' | 'resolveBackgroundCall' | 'stopCall'>
export type BackgroundBindingPorts = Readonly<{
  verifier(): PrincipalVerifier | undefined
  work(): Work | undefined
  queries(): Pick<ToolInvocationQueries<unknown, never>, 'readOutput'> | undefined
}>
type Bound = Readonly<{
  work: Work
  principal: unknown
  tenant: Parent['tenant']
  session: SessionId
}>

const OUTPUT_PART_BYTES = 16_384
const unavailable = (diagnostic: string) => ({
  failure: { kind: 'unavailable', diagnostic } as const,
})
const denied = { failure: { kind: 'denied' } as const }

// Another session's short number, or none, is not found alike (I-9); the rest says what failed.
function failureOf(id: string, value: SessionFailure): BackgroundFailure {
  if (value.kind === 'not-found') return { kind: 'not-found', id }
  if (value.kind === 'denied') return { kind: 'denied' }
  return { kind: 'unavailable', diagnostic: `Session answered ${value.kind}` }
}

function itemOf(view: BackgroundCallView): BackgroundCallItem {
  const { tool, command, preview, intent } = view.label
  const action = `${tool}${command === null ? '' : ` ${command}`}${preview === '' ? '' : ` · ${preview}`}`
  const stop =
    view.stop === null
      ? null
      : { by: view.stop.initiator, reason: view.stop.reason, progress: view.stop.progress }
  return { id: view.id, intent, action, status: view.status, stop, lastLine: view.lastLine }
}

// The arguments this call fixed at admission; the port answers only them (as TodoItems does).
function fixedArguments(parent: Parent): unknown {
  const selected = commandArguments(
    parent.request.availability.definition,
    parent.request.command,
    parent.request.arguments,
  )
  if ('failure' in selected || !selected.ok.complete || selected.ok.effective === null) return null
  const parsed = readJsonText(selected.ok.effective, {
    maxBytes: 65_536,
    maxDepth: 4,
    maxItems: 8,
    maxMembers: 8,
    maxStringLength: 4096,
    maxNumberLength: 32,
  })
  if (parsed.kind !== 'ok' || parsed.value.kind !== 'object') return null
  const value = JSON.parse(selected.ok.effective) as Record<string, unknown>
  return parent.request.command === 'output' ? { after: null, ...value } : value
}

export function createBoundBackgroundCalls(
  parent: Parent,
  ports: BackgroundBindingPorts,
  live: () => boolean,
): BoundBackgroundCalls {
  const original = fixedArguments(parent)
  const run = async <T>(
    command: string,
    business: unknown,
    apply: (bound: Bound) => Promise<BackgroundReply<T>>,
  ): Promise<BackgroundReply<T>> => {
    if (!live()) return unavailable('the BkgToolCalls execution has ended')
    if (
      original === null ||
      command !== parent.request.command ||
      canonicalDigest(original) !== canonicalDigest(business)
    )
      return denied
    try {
      const verified = await verifySessionWork(ports.verifier(), parent.principal, parent.tenant)
      if (!live()) return unavailable('the BkgToolCalls execution has ended')
      if (verified.kind === 'denied') return denied
      if (verified.kind === 'unavailable') return unavailable(verified.diagnostic)
      const work = ports.work()
      if (work === undefined) return unavailable('the Session work port is absent')
      const { principal, tenant } = parent
      return await apply({ work, principal, tenant, session: verified.session as SessionId })
    } catch {
      return unavailable('a dependency did not answer')
    }
  }
  const access = (bound: Bound) => ({
    principal: bound.principal,
    tenant: bound.tenant,
    session: bound.session,
  })
  const resolve = async (bound: Bound, id: string) => {
    const resolved = await bound.work.resolveBackgroundCall({ ...access(bound), id })
    return 'failure' in resolved ? { failure: failureOf(id, resolved.failure) } : resolved
  }
  const outputOf = async (
    bound: Bound,
    reference: string,
    after: string | null,
  ): Promise<BackgroundOutputPart> => {
    const queries = ports.queries()
    if (queries === undefined) return { kind: 'unreadable', reason: 'Tool is away' }
    const read = await queries.readOutput({
      principal: bound.principal,
      tenant: bound.tenant,
      reference: reference as ToolInvocationRef,
      after,
      maxBytes: OUTPUT_PART_BYTES,
    })
    if ('failure' in read)
      return { kind: 'unreadable', reason: `Tool answered ${read.failure.kind}` }
    if (read.ok.kind === 'none') return { kind: 'none' }
    return { kind: read.ok.kind, text: read.ok.text, next: read.ok.through }
  }
  return {
    list: () =>
      run('list', {}, async bound => {
        const listed = await bound.work.readBackgroundCalls(access(bound))
        return 'failure' in listed
          ? { failure: failureOf('', listed.failure) }
          : { ok: listed.ok.map(itemOf) }
      }),
    output: business =>
      run('output', business, async bound => {
        const resolved = await resolve(bound, business.id)
        if ('failure' in resolved) return resolved
        const listed = await bound.work.readBackgroundCalls(access(bound))
        const view = 'ok' in listed ? listed.ok.find(item => item.id === business.id) : undefined
        const status = resolved.ok.settled !== null ? 'ended' : (view?.status ?? 'unknown')
        const output = await outputOf(bound, resolved.ok.producer.call, business.after)
        return { ok: { id: business.id, status, output } }
      }),
    terminate: business =>
      run('terminate', business, async bound => {
        const resolved = await resolve(bound, business.id)
        if ('failure' in resolved) return resolved
        if (resolved.ok.settled !== null) return { ok: { id: business.id, kind: 'ended' } }
        const tenant = tenantCodec.encode(bound.tenant)
        if (!tenant.ok) return denied
        const operation = deriveSessionOperation({
          kind: 'stop-tool-call',
          tenant: tenant.value,
          session: bound.session,
          call: parent.call,
        })
        const stopped = await bound.work.stopCall({
          ...access(bound),
          operation,
          producer: resolved.ok.producer,
          reason: business.reason,
        })
        if ('failure' in stopped) return { failure: failureOf(business.id, stopped.failure) }
        const kind = stopped.ok.answer.kind === 'ended' ? 'ended' : 'requested'
        return { ok: { id: business.id, kind } }
      }),
  }
}

export function bindReleaseBackgroundCalls(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  let active = true
  const coordinator = ctx.intercept(sessionKey, { caller: 'coordinator' })
  const value = createBoundBackgroundCalls(
    parent,
    {
      verifier: () => toolRuntimeHolder(ctx).verifier(),
      work: () => coordinator.get(sessionKey, false)?.work,
      queries: () =>
        (ctx.get(toolRuntimeKey, false) as ToolRuntimeService<unknown, never> | undefined)?.queries,
    },
    () => active && !scope.context.signal.aborted,
  )
  const attached = attachBackgroundCalls(scope, value)
  return {
    ...attached,
    finish(exit) {
      active = false
      return attached.finish(exit)
    },
  }
}
