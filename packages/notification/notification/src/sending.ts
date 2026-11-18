import {
  decideSend,
  parseSendRequest,
  parseWith,
  precheckSend,
  sendIdentitySchema,
  type Accepted,
  type CallContext,
  type NamedCheck,
  type NotificationSending,
  type Outcome,
  type ParseRefusal,
  type SendLimits,
  type SendRefusal,
  type SendRequest,
  type SourceLookup,
  type TenantId,
} from '@omne-harness/notification-contract'
import { ask, type Clock, type NotificationAuthority } from './ports.ts'
import type { NotificationSources } from './registries.ts'
import type { NotificationStore } from './store.ts'

export type SendingDependencies = Readonly<{
  authority: NotificationAuthority
  store: NotificationStore
  sources: NotificationSources
  clock: Clock
  limits: SendLimits
  /** Called after a send was accepted. Only a wake-up: the store holds what is to be done. */
  accepted?: (tenant: TenantId) => void
}>

type SendOutcome = Outcome<Accepted, ParseRefusal | SendRefusal>
const UNAVAILABLE = { kind: 'basis-unavailable' } as const

function lookupSource(sources: NotificationSources, request: SendRequest): SourceLookup {
  try {
    return sources.lookup(request.identity.source)
  } catch {
    return { kind: 'unreadable' }
  }
}

async function namedChecks(
  deps: SendingDependencies,
  ctx: CallContext,
  request: SendRequest,
): Promise<readonly NamedCheck[]> {
  const checks: NamedCheck[] = []
  for (const recipient of request.event.named)
    checks.push({
      recipient,
      admissible: await ask(deps.authority, ctx, { kind: 'be-recipient', recipient }),
    })
  return checks
}

export function createSending(deps: SendingDependencies): NotificationSending {
  async function send(ctx: CallContext, input: unknown): Promise<SendOutcome> {
    const parsed = parseSendRequest(input)
    if ('refused' in parsed) return { kind: 'refused', reason: parsed.refused }
    const request = parsed.ok
    const { identity } = request
    if (identity.tenant !== ctx.tenant) return { kind: 'refused', reason: 'not-permitted' }
    const authority = await ask(deps.authority, ctx, { kind: 'send-as', source: identity.source })
    const precheck = precheckSend(request, authority, deps.limits)
    if (precheck.kind !== 'proceed') return precheck

    const known = await deps.store.send(ctx.tenant, identity)
    if (known.kind === 'unavailable') return UNAVAILABLE
    const source = lookupSource(deps.sources, request)
    const named = known.value === null ? await namedChecks(deps, ctx, request) : []
    let decision
    try {
      decision = decideSend(known.value?.record ?? null, request, source, named, deps.limits)
    } catch {
      // A rule of the declaration could not answer.
      return UNAVAILABLE
    }
    if (decision.kind === 'recalled')
      return {
        kind: 'done',
        recalled: true,
        value: { identity, recipients: known.value!.record.recipients },
      }
    if (decision.kind !== 'proceed') return decision

    const type = { defaults: decision.declared.defaults }
    const answer = await deps.store.accept(ctx.tenant, { request, type, now: deps.clock.now() })
    if (answer.kind === 'rolled-back') return UNAVAILABLE
    if (answer.kind === 'unknown') return { kind: 'unknown' }
    if (answer.value.kind === 'conflict') return { kind: 'refused', reason: 'conflict' }
    if (answer.value.kind === 'accepted') deps.accepted?.(ctx.tenant)
    return {
      kind: 'done',
      recalled: answer.value.kind === 'recalled',
      value: { identity, recipients: answer.value.recipients },
    }
  }

  return {
    send,
    async querySend(ctx, input) {
      const parsed = parseWith(sendIdentitySchema, { ...input })
      if ('refused' in parsed) return { kind: 'refused', reason: parsed.refused }
      const identity = parsed.ok
      if (identity.tenant !== ctx.tenant) return { kind: 'refused', reason: 'not-permitted' }
      const answer = await ask(deps.authority, ctx, { kind: 'send-as', source: identity.source })
      if (answer === 'denied') return { kind: 'refused', reason: 'not-permitted' }
      if (answer === 'unavailable') return UNAVAILABLE
      const known = await deps.store.send(ctx.tenant, identity)
      if (known.kind === 'unavailable') return UNAVAILABLE
      return {
        kind: 'done',
        recalled: false,
        value:
          known.value === null
            ? { kind: 'not-submitted' }
            : { kind: 'accepted', notifications: known.value.notifications },
      }
    },
  }
}
