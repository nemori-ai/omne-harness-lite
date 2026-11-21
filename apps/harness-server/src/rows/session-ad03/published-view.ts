import type { Context } from '@deepseek-ai/cordis'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import type { SessionAccess, SessionWork, SessionId } from '@omne-harness/session-contract'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeScopeRef,
  type ContextBlockKey,
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

export type PublishedNeedBinding<V> = Readonly<{
  key: ContextBlockKey
  need: Readonly<{ name: string; shape: z.ZodType<V> }>
}>
export type PublishedViewBinding<V extends Basis> = PublishedNeedBinding<V> &
  Readonly<{ key: 'session.modes' }>

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

async function selected<V>(
  reader: ContextReader,
  { key, need }: PublishedNeedBinding<V>,
): Promise<PublishedViewRead<V | null>> {
  const result = await reader.read([{ key, need: need.name }])
  if (result.kind === 'missing') return succeed(null)
  if (result.kind !== 'success') return fail(`read: ${result.kind}`)
  const item = result.value.length === 1 ? result.value[0]! : undefined
  if (item === undefined || item.need !== need.name) return fail('read: not the one asked need')
  if (item.kind !== 'value') return fail(`read: ${item.kind}`)
  const parsed = need.shape.safeParse(item.value)
  return parsed.success ? succeed(parsed.data) : fail('read: the view does not parse')
}

/** A view that names the session it was computed for is refused when it names another. */
export async function readPublishedView<V extends Basis>(
  ports: PublishedViewPorts,
  input: SessionAccess<unknown>,
  binding: PublishedViewBinding<V>,
): Promise<PublishedViewRead<V>> {
  const view = await readPublishedNeed(ports, input, binding)
  if ('failure' in view) return view
  if (view.ok === null) return fail('read: missing')
  const tenant = tenantCodec.encode(input.tenant)
  if (!tenant.ok) return fail('read: the view does not parse')
  const { basis } = view.ok
  return basis.tenant === tenant.value && basis.session === input.session
    ? succeed(view.ok)
    : fail('read: the basis names another session')
}

/** One need of the coordinator in the open scope of the session. Null: the block has no value now. */
export async function readPublishedNeed<V>(
  ports: PublishedViewPorts,
  input: SessionAccess<unknown>,
  binding: PublishedNeedBinding<V>,
): Promise<PublishedViewRead<V | null>> {
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
      return await selected(bound.reader, binding)
    } finally {
      await bound.reader.end()
    }
  } catch (error) {
    return fail(`threw: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** `declared: false` reads the services lazily, for a row that does not list them among its injects. */
export function publishedViewPortsOf(ctx: Context, declared = true): PublishedViewPorts | null {
  const session = ctx.intercept(sessionKey, { caller: 'coordinator' }).get(sessionKey, declared)
  const eligibility = ctx.get(runtimeContextReaderEligibilityKey, declared)
  const runtime = ctx
    .intercept(runtimeContextKey, { consumer: 'coordinator' })
    .get(runtimeContextKey, declared)
  const modes = ctx.get(sessionModesInstallationKey, declared)
  if (!session || !eligibility || !runtime || !modes) return null
  return {
    work: session.work,
    eligibility,
    runtime,
    recoverSession: input => modes.recoverSession(input),
  }
}
