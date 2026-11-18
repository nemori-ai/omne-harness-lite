import {
  decideSend,
  parseSendRequest,
  parseWith,
  precheckSend,
  sendIdentitySchema,
  type Accepted,
  type CallContext,
  type EventTypeFacts,
  type NamedCheck,
  type NotificationSending,
  type Outcome,
  type ParseRefusal,
  type RecipientRef,
  type SendDecision,
  type SendLimits,
  type SendRefusal,
  type SendRequest,
  type SourceLookup,
  type TenantId,
} from '@omne-harness/notification-contract'
import { ask, type Clock, type NotificationAuthority } from './ports.ts'
import type { NotificationSources } from './registries.ts'
import type { NotificationStore } from './store.ts'
import type { RecipientDefaults } from './transactions/destinations.ts'

export type SendingDependencies = Readonly<{
  authority: NotificationAuthority
  store: NotificationStore
  sources: NotificationSources
  clock: Clock
  limits: SendLimits
  defaults: RecipientDefaults
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

type Admitted = Readonly<{ request: SendRequest }>
type Decided =
  | Exclude<SendDecision, { kind: 'recalled' }>
  | Readonly<{ kind: 'recalled'; recipients: readonly RecipientRef[] }>
type Blocked = Exclude<SendOutcome, { kind: 'done' }>

/** Steps one and two: the request parses, names this tenant, fits, and the subject may send. */
async function admit(
  deps: SendingDependencies,
  ctx: CallContext,
  input: unknown,
): Promise<Admitted | Blocked> {
  const parsed = parseSendRequest(input)
  if ('refused' in parsed) return { kind: 'refused', reason: parsed.refused }
  const request = parsed.ok
  const { identity } = request
  if (identity.tenant !== ctx.tenant) return { kind: 'refused', reason: 'not-permitted' }
  const authority = await ask(deps.authority, ctx, { kind: 'send-as', source: identity.source })
  const precheck = precheckSend(request, authority, deps.limits)
  return precheck.kind === 'proceed' ? { request } : precheck
}

/** Steps three to six, against the earlier send as the store reads it now. */
async function decide(
  deps: SendingDependencies,
  ctx: CallContext,
  request: SendRequest,
): Promise<Decided> {
  const known = await deps.store.send(ctx.tenant, request.identity)
  if (known.kind === 'unavailable') return UNAVAILABLE
  const source = lookupSource(deps.sources, request)
  const named = known.value === null ? await namedChecks(deps, ctx, request) : []
  const record = known.value?.record ?? null
  try {
    const decision = decideSend(record, request, source, named, deps.limits)
    if (decision.kind !== 'recalled') return decision
  } catch {
    return UNAVAILABLE
  }
  return { kind: 'recalled', recipients: record?.recipients ?? [] }
}

export function createSending(deps: SendingDependencies): NotificationSending {
  async function commit(
    ctx: CallContext,
    request: SendRequest,
    type: EventTypeFacts,
  ): Promise<SendOutcome> {
    const { identity } = request
    const command = { request, type, defaults: deps.defaults, now: deps.clock.now() }
    const answer = await deps.store.accept(ctx.tenant, command)
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

  async function send(ctx: CallContext, input: unknown): Promise<SendOutcome> {
    const admitted = await admit(deps, ctx, input)
    if ('kind' in admitted) return admitted
    const { request } = admitted
    const decision = await decide(deps, ctx, request)
    if (decision.kind === 'recalled') {
      const value = { identity: request.identity, recipients: decision.recipients }
      return { kind: 'done', recalled: true, value }
    }
    if (decision.kind !== 'proceed') return decision
    const { defaults, external } = decision.declared
    return commit(ctx, request, { defaults, external })
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
