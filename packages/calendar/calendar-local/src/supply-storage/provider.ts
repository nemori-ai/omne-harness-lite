import { z } from 'zod'
import {
  calendarProbeInputSchema,
  calendarSourceStandingSchema,
} from '@omne-harness/calendar-contract'
import type { CalendarSupplyJournal, CalendarSourceMaterialStore } from '@omne-harness/calendar'
import { ackSchema, operationQuerySchema } from '../storage/schema.ts'
import { read, write, query, recover, type AccessOptions } from './access.ts'
import { custody, materialLimit, type CalendarSeedPackRegistry } from './custody.ts'
import { canonical, digest, identity, intent, operationRef } from './encoding.ts'
import { settledRun } from './run.ts'
import {
  DOMAIN,
  PARTICIPANT,
  text,
  probeQuerySchema,
  runSchema,
  settledRunSchema,
  journalRunSchema,
  healthSchema,
  acknowledgementQuerySchema,
} from './schema.ts'

export type CalendarSqlSupplyStorageOptions = AccessOptions &
  Readonly<{ seedPackRegistry: CalendarSeedPackRegistry; maxMaterialBytes?: number }>
export type CalendarSqlSupplyStorage = Readonly<{
  journal: CalendarSupplyJournal
  materials: CalendarSourceMaterialStore
}>
export function createCalendarSqlSupplyStorage(
  options: CalendarSqlSupplyStorageOptions,
): CalendarSqlSupplyStorage {
  if (
    !text.safeParse(options.systemScopeRef).success ||
    options.combination.scope.kind !== 'system' ||
    options.combination.transactionDomain !== DOMAIN ||
    !options.combination.participants.includes(PARTICIPANT) ||
    options.authority === undefined ||
    options.authority.participant === PARTICIPANT ||
    !options.combination.participants.includes(options.authority.participant) ||
    typeof options.authority.command !== 'function' ||
    typeof options.seedPackRegistry?.get !== 'function'
  )
    throw new Error(
      'Supply storage requires a system.calendar combination, scope, authority participant and trusted seed registry',
    )
  const registry = new Map(options.seedPackRegistry)
  const scope = options.systemScopeRef
  const storedRun = (ref: string) =>
    read(
      options,
      { kind: 'run', systemScopeRef: scope, operationRef: ref },
      journalRunSchema.nullable(),
    )
  return {
    materials: custody(options, registry, materialLimit(options.maxMaterialBytes)),
    journal: {
      async prepareRun(payload) {
        const written = await write(
          options,
          { action: 'run.prepare', systemScopeRef: scope, payload },
          settledRunSchema,
        )
        if (written.kind !== 'ok') return written
        if (canonical(written.value) === canonical(settledRun(payload)))
          return { kind: 'ok', value: payload }
        const stored = await storedRun(operationRef(payload.command.address))
        if (stored.kind !== 'ok') return stored
        if (stored.value === null) return { kind: 'unavailable', reason: 'preparedRunMissing' }
        return stored.value.state === 'pending'
          ? { kind: 'ok', value: stored.value.run }
          : { kind: 'conflict', reason: 'runCompleted' }
      },
      completeRun: payload =>
        write(options, { action: 'run.complete', systemScopeRef: scope, payload }, z.null()),
      recordProbe: payload =>
        write(
          options,
          { action: 'probe.record', systemScopeRef: payload.systemScopeRef, payload },
          calendarSourceStandingSchema,
        ),
      prepareAcknowledgement: payload =>
        write(options, { action: 'ack.prepare', systemScopeRef: scope, payload }, ackSchema),
      async readAcknowledgement(input) {
        const parsed = acknowledgementQuerySchema.safeParse(input)
        if (!parsed.success) return { kind: 'conflict', reason: 'invalidInput' }
        return recover(
          options,
          identity('ack.prepare', scope, parsed.data),
          ackSchema.refine(
            value => value.id === input.id && value.acknowledgementKey === input.acknowledgementKey,
          ),
          payload => intent({ action: 'ack.prepare', systemScopeRef: scope, payload }),
        )
      },
      async findRun(input) {
        if (input.systemScopeRef !== scope) return { kind: 'conflict', reason: 'scopeMismatch' }
        if (!/^calendar-operation:[a-f0-9]{64}$/.test(input.operationRef))
          return { kind: 'conflict', reason: 'invalidInput' }
        const found = await storedRun(input.operationRef)
        if (found.kind !== 'ok' || found.value === null) return found
        const { address } = found.value.run.command
        return address.systemScopeRef === scope && operationRef(address) === input.operationRef
          ? found
          : { kind: 'unavailable', reason: 'invalidStoredRun' }
      },
      health: input => read(options, { kind: 'health', ...input }, healthSchema),
      pending: input => read(options, { kind: 'pending', ...input }, z.array(runSchema)),
      due: input => read(options, { kind: 'due', ...input }, z.array(calendarProbeInputSchema)),
      async readRun(input) {
        const parsed = operationQuerySchema.safeParse(input)
        if (!parsed.success) return { kind: 'conflict', reason: 'invalidInput' }
        if (parsed.data.address.systemScopeRef !== scope)
          return { kind: 'conflict', reason: 'scopeMismatch' }
        try {
          canonical(input)
        } catch {
          return { kind: 'conflict', reason: 'invalidInput' }
        }
        const found = await storedRun(operationRef(parsed.data.address))
        if (found.kind !== 'ok' || found.value === null) return found
        return found.value.run.command.expectedFingerprint === parsed.data.expectedFingerprint
          ? found
          : { kind: 'conflict', reason: 'intentMismatch' }
      },
      async readProbe(input) {
        const parsed = probeQuerySchema.safeParse(input)
        if (!parsed.success) return { kind: 'conflict', reason: 'invalidInput' }
        if (parsed.data.systemScopeRef !== scope)
          return { kind: 'conflict', reason: 'scopeMismatch' }
        const { calendarId, operationKey, fingerprint } = parsed.data
        return query(
          options,
          identity('probe.record', scope, { calendarId, operationKey }),
          {
            action: 'probe.record',
            systemScopeRef: scope,
            intentDigest: digest({ calendarId, operationKey, fingerprint }),
          },
          calendarSourceStandingSchema,
        )
      },
    },
  }
}
