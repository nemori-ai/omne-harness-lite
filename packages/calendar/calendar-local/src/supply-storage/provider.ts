import { z } from 'zod'
import {
  calendarProbeInputSchema,
  calendarSourceStandingSchema,
} from '@omne-harness/calendar-contract'
import type { CalendarSupplyJournal, CalendarSourceMaterialStore } from '@omne-harness/calendar'
import { ackSchema, operationQuerySchema } from '../storage/schema.ts'
import { read, write, query, recover, type AccessOptions } from './access.ts'
import { custody, materialLimit, type CalendarSeedPackRegistry } from './custody.ts'
import { canonical, digest, identity, intent } from './encoding.ts'
import {
  DOMAIN,
  PARTICIPANT,
  text,
  probeQuerySchema,
  runSchema,
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
  return {
    materials: custody(options, registry, materialLimit(options.maxMaterialBytes)),
    journal: {
      prepareRun: payload =>
        write(options, { action: 'run.prepare', systemScopeRef: scope, payload }, runSchema),
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
        const id = {
          ...identity('run.prepare', scope, {}),
          operationKey: input.operationRef.slice('calendar-operation:'.length),
        }
        const schema = runSchema.refine(
          value =>
            value.command.address.systemScopeRef === scope &&
            `calendar-operation:${digest(value.command.address)}` === input.operationRef,
        )
        return recover(options, id, schema, payload =>
          intent({ action: 'run.prepare', systemScopeRef: scope, payload }),
        )
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
          return await query(
            options,
            identity('run.prepare', scope, parsed.data.address),
            {
              action: 'run.prepare',
              systemScopeRef: scope,
              intentDigest: digest({
                address: parsed.data.address,
                fingerprint: parsed.data.expectedFingerprint,
              }),
            },
            runSchema,
          )
        } catch {
          return { kind: 'conflict', reason: 'invalidInput' }
        }
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
