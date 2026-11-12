// The trusted read of one translated view of `session.modes`: the current Context scope of the
// Session, its recovery, coordinator eligibility, one bound reader, one selected need. A consumer
// names the binding of its need (`sessionInquiryBinding` for the inquiry handling,
// `sessionInteractionBinding` for the meta-capability host) and gets only that view. Nothing is
// cached: every read binds and ends its own reader.
import type { Context } from '@deepseek-ai/cordis'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import type { SessionAccess, SessionWork, SessionId } from '@omne-harness/session-contract'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeScopeRef,
  type ContextReader,
  type ReaderEligibilityHandoff,
  type ReaderOperations,
  type ScopeRef,
} from '@omne-harness/runtime-context-contract'
import {
  runtimeContextKey,
  runtimeContextReaderEligibilityKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import type { z } from 'zod'
import { sessionModesInstallationKey } from './modes.ts'

export type PublishedViewPorts = Readonly<{
  work: Pick<SessionWork<unknown>, 'readWork'>
  eligibility: ReaderEligibilityHandoff<unknown>
  runtime: ReaderOperations
  recoverSession(
    input: Readonly<{ tenant: TenantId; session: SessionId; scope: ScopeRef }>,
  ): Promise<Readonly<{ kind: 'ready' | 'absent' | 'unavailable' }>>
}>

type Basis = Readonly<{ basis: Readonly<{ tenant: string; session: string }> }>

/** The part of a `session.modes` binding the read selects with. */
export type PublishedViewBinding<V extends Basis> = Readonly<{
  key: 'session.modes'
  need: Readonly<{ name: string; shape: z.ZodType<V> }>
}>

/** Why a read answered no view: a diagnostic for the consumer to report, never a default. */
export type PublishedViewRead<V> = Outcome<V, string>

async function currentScope(
  ports: PublishedViewPorts,
  access: SessionAccess<unknown>,
): Promise<PublishedViewRead<ScopeRef>> {
  const work = await ports.work.readWork(access)
  if ('failure' in work) return fail(`session work: ${work.failure.kind}`)
  if (!tenantEquals(work.ok.tenant, access.tenant) || work.ok.session !== access.session)
    return fail('session work: another session')
  const current = work.ok.contextScopes?.at(-1)
  if (current === undefined) return fail('session work: no context scope')
  if (current.ended !== null) return fail('session work: the context scope has ended')
  const scope = decodeScopeRef({ ref: current.scope })
  return 'failure' in scope ? fail('session work: the context scope is not a scope ref') : scope
}

async function selected<V extends Basis>(
  reader: ContextReader,
  access: SessionAccess<unknown>,
  { key, need }: PublishedViewBinding<V>,
): Promise<PublishedViewRead<V>> {
  const result = await reader.read([{ key, need: need.name }])
  if (result.kind !== 'success') return fail(`read: ${result.kind}`)
  const item = result.value.length === 1 ? result.value[0]! : undefined
  if (item === undefined || item.need !== need.name) return fail('read: not the one asked need')
  if (item.kind !== 'value') return fail(`read: ${item.kind}`)
  const parsed = need.shape.safeParse(item.value)
  const tenant = tenantCodec.encode(access.tenant)
  if (!parsed.success || !tenant.ok) return fail('read: the view does not parse')
  return parsed.data.basis.tenant === tenant.value && parsed.data.basis.session === access.session
    ? succeed(parsed.data)
    : fail('read: the basis names another session')
}

/**
 * Reads the view of `binding` from the current owner's publication and releases its reader.
 * A missing, refused, unknown, malformed or failed read answers why; the consumer decides what that
 * absence means.
 */
export async function readPublishedView<V extends Basis>(
  ports: PublishedViewPorts,
  input: SessionAccess<unknown>,
  binding: PublishedViewBinding<V>,
): Promise<PublishedViewRead<V>> {
  const access = { ...input }
  try {
    const scope = await currentScope(ports, access)
    if ('failure' in scope) return scope
    const recovered = await ports.recoverSession({
      tenant: access.tenant,
      session: access.session,
      scope: scope.ok,
    })
    if (recovered.kind !== 'ready') return fail(`session recovery: ${recovered.kind}`)
    const issued = await ports.eligibility.current({
      ...access,
      scope: scope.ok,
      consumer: 'coordinator',
    })
    if (issued.kind !== 'current') return fail(`eligibility: ${issued.kind}`)
    const bound = await ports.runtime.bind(issued.eligibility)
    if (bound.kind !== 'bound') return fail(`bind: ${bound.kind}`)
    try {
      if (bound.reader.consumer !== 'coordinator' || bound.reader.scope.ref !== scope.ok.ref)
        return fail('bind: another consumer or scope')
      return await selected(bound.reader, access, binding)
    } finally {
      await bound.reader.end()
    }
  } catch (error) {
    return fail(`threw: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** The ports from the running assembly, read per call; null when one of them is absent. */
export function publishedViewPortsOf(ctx: Context): PublishedViewPorts | null {
  const session = ctx.intercept(sessionKey, { caller: 'coordinator' }).get(sessionKey)
  const eligibility = ctx.get(runtimeContextReaderEligibilityKey)
  const runtime = ctx
    .intercept(runtimeContextKey, { consumer: 'coordinator' })
    .get(runtimeContextKey)
  const modes = ctx.get(sessionModesInstallationKey)
  if (!session || !eligibility || !runtime || !modes) return null
  return {
    work: session.work,
    eligibility,
    runtime,
    recoverSession: input => modes.recoverSession(input),
  }
}
