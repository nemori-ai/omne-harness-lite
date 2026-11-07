import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { SettingsFailure } from '@omne-harness/settings'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import { accessGrantSchema, domainSchema, failureSchema } from './schema.ts'
import type { SettingsSqlAccessGrant } from './types.ts'
import type { PreparationRegistration } from './preparation-types.ts'
import {
  sourcePageSchema,
  sourceRequestSchema,
  SOURCE_SNAPSHOT_PARTICIPANT,
  SOURCE_RETENTION_OWNER,
  type SourceRequest,
  type SourcePage,
} from './source-retention-schema.ts'
import { sourceCustodyReceiptSchema } from './source-custody-schema.ts'
import {
  SOURCE_SERVICE_READ,
  sourceDestinationResultSchema,
  sourceRecognitionSchema,
  sourceReservationObservationSchema,
  sourceHeldPageSchema,
  sourcePendingPageSchema,
  type SettingsSourceDestination,
  type sourceServiceReadSchema,
} from './source-service-schema.ts'
import { equal, json, withinBudget } from './encoding.ts'
type Receipt = z.infer<typeof sourceCustodyReceiptSchema>
type Reply = Receipt | SettingsFailure
export type SettingsSourceOptions<Context> = {
  storage: SqlStorage
  domain: DomainRef
  registration: PreparationRegistration
  access: {
    authorize(
      context: Context,
      request: SourceRequest,
    ): Promise<SettingsSqlAccessGrant | SettingsFailure>
  }
  destination: SettingsSourceDestination
}
const failure = (reason: SettingsFailure['reason']): SettingsFailure => ({
  kind: 'rejected',
  reason,
})
function observation(raw: unknown): Reply {
  const result = sourceReservationObservationSchema.parse(raw)
  switch (result.kind) {
    case 'held':
    case 'settled':
      return result
    case 'not_found':
      return failure('unavailable')
    case 'conflict':
      return failure('operation_conflict')
    case 'blocked':
      return failure('basis_changed')
    case 'limited':
      return failure('limit_exceeded')
    case 'unavailable':
      return failure(result.reason)
  }
}
export function createSettingsSourceReservations<Context>(input: SettingsSourceOptions<Context>) {
  const options = {
    ...input,
    domain: domainSchema.parse(input.domain),
    registration: { ...input.registration },
    authorize: input.access.authorize,
    seal: input.destination.seal.bind(input.destination),
    recognize: input.destination.recognize.bind(input.destination),
  }
  const active = new Set<Promise<unknown>>()
  let closing: Promise<void> | undefined
  function run<T>(task: () => Promise<T>): Promise<T | SettingsFailure> {
    if (closing) return Promise.resolve(failure('closing'))
    const pending = task().catch(() => failure('unavailable'))
    active.add(pending)
    void pending.then(() => active.delete(pending))
    return pending
  }
  function parse(raw: SourceRequest) {
    if (!withinBudget(raw)) return failure('limit_exceeded')
    const result = sourceRequestSchema.safeParse(raw)
    if (!result.success) return failure('invalid_input')
    return equal(result.data.source.domain, options.domain) ? result.data : failure('forbidden')
  }
  async function read(request: z.infer<typeof sourceServiceReadSchema>) {
    const result = await options.storage.read({
      domain: options.domain,
      ...SOURCE_SERVICE_READ,
      requestKey: randomUUID(),
      input: json(request),
    })
    if (result.kind !== 'read') throw new Error('Settings source read unavailable')
    return result.output
  }
  async function write(
    facts:
      | { kind: 'reserve'; request: SourceRequest }
      | {
          kind: 'settlement'
          settlement: { request: SourceRequest; outcome: 'committed' | 'aborted' }
        },
  ): Promise<Reply> {
    const result = await options.storage.commit({
      identity: {
        ...options.domain,
        operation: 'settings.source',
        protocolVersion: '2',
        operationKey: randomUUID(),
      },
      ...options.registration,
      commands: [SOURCE_SNAPSHOT_PARTICIPANT, SOURCE_RETENTION_OWNER].map(participant => ({
        participant,
        facts:
          facts.kind === 'reserve'
            ? { kind: facts.kind, request: json(facts.request) }
            : { kind: facts.kind, settlement: json(facts.settlement) },
      })),
    })
    if (result.kind !== 'committed') return failure('unavailable')
    return observation(
      result.responses.find(response => response.participant === SOURCE_RETENTION_OWNER)?.reply
        .response,
    )
  }
  async function reserve(context: Context, request: SourceRequest): Promise<Reply> {
    const access = await options.authorize(context, request)
    if (access.kind === 'rejected') return failureSchema.parse(access)
    const grant = accessGrantSchema.parse(access)
    if (
      !equal(grant.scope, options.domain.scope) ||
      !equal(grant.target, request.source.target) ||
      grant.principalRef !== request.destination.identity.principalRef
    )
      return failure('forbidden')
    const previous = sourceReservationObservationSchema.parse(
      await read({ kind: 'reservation', request }),
    )
    if (previous.kind !== 'not_found') return observation(previous)
    const recognized = sourceRecognitionSchema.parse(await options.recognize(request))
    if (recognized.kind !== 'known') return failure('unavailable')
    if (!equal(recognized.request, request)) return failure('operation_conflict')
    return write({ kind: 'reserve', request })
  }
  async function settle(request: SourceRequest): Promise<Reply> {
    const previous = observation(await read({ kind: 'reservation', request }))
    if (previous.kind !== 'held') return previous
    const result = sourceDestinationResultSchema.parse(await options.seal(request))
    if (result.kind !== 'terminal') return failure('unavailable')
    if (!equal(result.request, request)) return failure('operation_conflict')
    return write({ kind: 'settlement', settlement: { request, outcome: result.outcome } })
  }
  return {
    service: {
      reserve(context: Context, raw: SourceRequest): Promise<Reply> {
        const request = parse(raw)
        return 'kind' in request ? Promise.resolve(request) : run(() => reserve(context, request))
      },
      settle(raw: SourceRequest): Promise<Reply> {
        const request = parse(raw)
        return 'kind' in request ? Promise.resolve(request) : run(() => settle(request))
      },
    },
    control: {
      recover(raw: SourcePage) {
        const parsed = sourcePageSchema.safeParse(raw)
        if (!parsed.success) return Promise.resolve(failure('invalid_input'))
        return run(async () => {
          const page = sourceHeldPageSchema.parse(await read({ kind: 'holds', page: parsed.data }))
          const items: { request: SourceRequest; result: Reply }[] = []
          for (const item of page.items) {
            const result = await settle(item.request).catch(() => failure('unavailable'))
            items.push({ request: item.request, result })
          }
          return { kind: 'recovered' as const, items, after: page.after }
        })
      },
      pendingUpdates(raw: SourcePage) {
        const parsed = sourcePageSchema.safeParse(raw)
        if (!parsed.success) return Promise.resolve(failure('invalid_input'))
        return run(async () => ({
          kind: 'page' as const,
          ...sourcePendingPageSchema.parse(await read({ kind: 'updates', page: parsed.data })),
        }))
      },
      close() {
        return (closing ??= Promise.allSettled(active).then(() => undefined))
      },
    },
  }
}
