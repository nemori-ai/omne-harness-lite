import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  standingPrincipalRef,
  type ActingForTenantPrincipal,
  type PrincipalVerifier,
  type StandingReservations,
  type Qualification,
} from '@omne-harness/identity'
import type { FactCommandV2, CommitResultV2 } from '@omne-harness/sql-contract'
import type {
  SettingsBasis,
  SettingsFailure,
  SettingsReadPort,
  SettingsRegistrySnapshot,
  SettingsViewRequest,
} from '@omne-harness/settings'
import {
  SettingDefinitionsSchema,
  SettingsDefinitionRefSchema,
  SettingsStateSchema,
  SettingsTargetSchema,
  SettingsReferenceSchema,
} from '@omne-harness/settings'
import { canonical, digest, equal, json, withinBudget } from './encoding.ts'
import { failureSchema } from './schema.ts'
import { TARGET_GUARD, projectionForChange } from './target-guard.ts'
import {
  SnapshotInputSchema,
  snapshotOperation,
  SNAPSHOT_PARTICIPANT,
  type SnapshotInput,
} from './snapshot-schema.ts'
import { TERMINAL_PARTICIPANT } from './terminal-schema.ts'
import type { SettingsSqlTerminalOptions } from './terminals.ts'
import type { SettingsSqlGuards, SettingsSqlAccess } from './types.ts'
import {
  SettingsProjectionBindingSchema,
  SettingsTargetProjectionSchema,
  type SettingsProjectionBinding,
} from './projection.ts'
export type SettingsProjectionCommands = (
  binding: SettingsProjectionBinding,
) => readonly FactCommandV2[]
export function createSettingsTargetGuards(project: SettingsProjectionCommands): SettingsSqlGuards {
  return {
    participant: TARGET_GUARD,
    command: binding => [
      ...project(projectionForChange(binding)),
      { participant: TARGET_GUARD, facts: { binding: json(binding) } },
    ],
  }
}
export interface SettingsSelectionSource {
  resolve(
    principal: ActingForTenantPrincipal,
    selectionRef: string,
  ): Promise<
    | Readonly<{ deploymentRef: string; targets: SettingsViewRequest['targets']; revision: string }>
    | SettingsFailure
  >
}
export type SettingsCatalogOptions = SettingsSqlTerminalOptions &
  Readonly<{
    deploymentRef: string
    destination: string
    verifier: PrincipalVerifier
    reservations: StandingReservations
    required: readonly Qualification[]
    registry: Readonly<{ snapshot(): SettingsRegistrySnapshot }>
    project: SettingsProjectionCommands
    selection?: SettingsSelectionSource
    clock: Readonly<{ now(): number }>
    cursorLifetimeMs: number
  }>
const BasisSchema = z.strictObject({
  scopeKey: SettingsReferenceSchema,
  revision: SettingsReferenceSchema,
  views: z
    .array(
      z.strictObject({
        target: SettingsTargetSchema,
        enabled: z.boolean(),
        definition: SettingDefinitionsSchema,
        definitionRef: SettingsDefinitionRefSchema,
        state: SettingsStateSchema,
        grants: SettingsTargetProjectionSchema.shape.grants,
      }),
    )
    .max(128),
  completeness: z.enum(['complete', 'partial']),
  unavailableProviders: z.array(z.string()).max(128),
})
export function createSettingsCatalog(
  input: SettingsCatalogOptions,
): SettingsReadPort<ActingForTenantPrincipal> & {
  access: SettingsSqlAccess<ActingForTenantPrincipal>
  close(): Promise<void>
} {
  if (!Number.isSafeInteger(input.cursorLifetimeMs) || input.cursorLifetimeMs < 1)
    throw new TypeError('Positive cursor lifetime required')
  const options = { ...input, required: [...input.required] },
    incarnation = randomUUID()
  type Captured =
    | { kind: 'captured'; basis: SettingsBasis }
    | { kind: 'authority'; targets: SettingsViewRequest['targets']; principalRef: string }
    | SettingsFailure
  const active = new Set<Promise<Captured>>()
  let closing: Promise<void> | undefined
  let observedTime = 0
  const fail = (reason: SettingsFailure['reason']): SettingsFailure => ({
    kind: 'rejected',
    reason,
  })
  async function selection(
    principal: ActingForTenantPrincipal,
    request: SettingsViewRequest,
  ): Promise<string | null | SettingsFailure> {
    if (request.mode === 'management') return null
    if (!request.selectionRef || !request.targets.length) return fail('invalid_input')
    if (!options.selection) return fail('unsupported')
    const selected = await options.selection.resolve(principal, request.selectionRef)
    if ('kind' in selected) return selected
    if (
      selected.deploymentRef !== request.deploymentRef ||
      !equal(selected.targets, request.targets)
    )
      return fail('forbidden')
    return digest(selected)
  }
  function response(result: CommitResultV2, capture: SnapshotInput): Captured {
    if (result.kind === 'committed') {
      const entry = result.responses.find(r => r.participant === SNAPSHOT_PARTICIPANT)?.reply
        .response
      if (capture.purpose === 'authority') {
        const parsed = z
          .object({ operation: z.unknown(), authority: z.array(SettingsTargetSchema).max(128) })
          .safeParse(entry)
        return parsed.success && equal(parsed.data.operation, snapshotOperation(capture))
          ? {
              kind: 'authority',
              targets: parsed.data.authority,
              principalRef: capture.binding.principalRef,
            }
          : fail('unavailable')
      }
      const parsed = z.object({ operation: z.unknown(), basis: BasisSchema }).safeParse(entry)
      return parsed.success && equal(parsed.data.operation, snapshotOperation(capture))
        ? { kind: 'captured', basis: parsed.data.basis }
        : fail('unavailable')
    }
    if (result.kind === 'rolled_back') {
      const last = result.responses.at(-1)?.reply
      if (last?.kind === 'conflict') {
        const parsed = failureSchema.safeParse(last.basis)
        if (parsed.success) return parsed.data
        const projection = z
          .strictObject({ binding: SettingsProjectionBindingSchema, failure: failureSchema })
          .safeParse(last.basis)
        if (projection.success && equal(projection.data.binding, capture.binding))
          return projection.data.failure
      }
    }
    return fail('unavailable')
  }
  async function prepareCapture(
    principal: ActingForTenantPrincipal,
    request: SettingsViewRequest,
    purpose: 'values' | 'authority',
  ) {
    const verified = await options.verifier.verify(principal)
    if (verified.kind === 'unavailable') return fail('unavailable')
    if (verified.kind !== 'verified' || verified.principal.kind !== 'acting-for-tenant')
      return fail('forbidden')
    const tenant = tenantCodec.encode(verified.principal.tenant)
    if (
      !tenant.ok ||
      options.domain.scope.kind !== 'tenant' ||
      options.domain.scope.tenant !== tenant.value ||
      request.deploymentRef !== options.deploymentRef ||
      request.targets.some(t => t.scopeRef !== tenant.value)
    )
      return fail('forbidden')
    const selected = await selection(verified.principal, request)
    if (selected && typeof selected !== 'string') return selected
    const clockTime = options.clock.now()
    if (!Number.isSafeInteger(clockTime) || clockTime < 0) return fail('unavailable')
    const now = (observedTime = Math.max(observedTime, clockTime))
    const before = options.registry.snapshot()
    const capture = SnapshotInputSchema.parse({
      purpose,
      binding: {
        domain: options.domain,
        principalRef: standingPrincipalRef(verified.principal),
        captureId: randomUUID(),
        request,
      },
      availability: before.definitions.map(d => ({
        providerId: d.providerId,
        definitionId: d.definitionId,
        version: d.version,
        digest: digest(d),
      })),
      incarnation,
      registryRevision: before.revision,
      expiryEpoch: Math.floor(now / options.cursorLifetimeMs),
      selectionDigest: selected,
    })
    return { capture, before, principal: verified.principal, scopeRef: tenant.value }
  }
  async function captureView(
    principal: ActingForTenantPrincipal,
    request: SettingsViewRequest,
    purpose: 'values' | 'authority',
  ): Promise<Captured> {
    const prepared = await prepareCapture(principal, request, purpose)
    if ('kind' in prepared) return prepared
    const { capture, before, principal: verifiedPrincipal, scopeRef } = prepared
    const operation = snapshotOperation(capture)
    const held = await options.reservations.reserve({
      principal: verifiedPrincipal,
      required: options.required,
      binding: {
        version: 'standing/1',
        owner: 'settings',
        operationId: operation.operationId,
        principalRef: operation.principalRef,
        destination: options.destination,
        scopeRef,
        targetRef: canonical(operation.target),
        inputDigest: operation.commandDigest,
      },
    })
    if (held.kind !== 'held')
      return fail(
        held.kind === 'denied'
          ? 'forbidden'
          : held.kind === 'blocked'
            ? 'basis_changed'
            : 'unavailable',
      )
    let result: Captured
    try {
      const committed = await options.storage.commit({
        identity: {
          ...options.domain,
          operation: 'settings.capture',
          protocolVersion: '2',
          operationKey: digest([operation.principalRef, operation.operationId]),
        },
        combinationVersion: options.combinationVersion,
        manifestDigest: options.manifestDigest,
        commands: [
          {
            participant: TERMINAL_PARTICIPANT,
            facts: { kind: 'consume', binding: json(operation) },
          },
          ...options.project(capture.binding),
          { participant: SNAPSHOT_PARTICIPANT, facts: { input: json(capture) } },
        ],
      })
      result = response(committed, capture)
    } catch {
      result = fail('unavailable')
    }
    const settled = await options.reservations.settle(held.reservation.id)
    if (settled.kind !== 'terminal' || settled.outcome !== 'committed')
      return result.kind === 'rejected' ? result : fail('basis_changed')
    if (before.revision !== options.registry.snapshot().revision) return fail('basis_changed')
    return result
  }
  function run(
    principal: ActingForTenantPrincipal,
    request: SettingsViewRequest,
    purpose: 'values' | 'authority',
  ): Promise<Captured> {
    if (closing) return Promise.resolve(fail('closing'))
    if (!withinBudget(request)) return Promise.resolve(fail('limit_exceeded'))
    const pending = captureView(principal, structuredClone(request), purpose).catch(() =>
      fail('unavailable'),
    )
    active.add(pending)
    void pending.then(() => active.delete(pending))
    return pending
  }
  return {
    async read(principal, request) {
      const result = await run(principal, request, 'values')
      return result.kind === 'captured'
        ? result.basis
        : result.kind === 'rejected'
          ? result
          : fail('unavailable')
    },
    access: {
      async authorize(principal, request) {
        if (!equal(request.scope, options.domain.scope)) return fail('forbidden')
        const result = await run(
          principal,
          {
            deploymentRef: options.deploymentRef,
            mode: 'management',
            targets: [request.target],
            selectionRef: null,
          },
          'authority',
        )
        if (result.kind === 'rejected') return result
        if (
          result.kind !== 'authority' ||
          !result.targets.some(target => equal(target, request.target))
        )
          return fail('forbidden')
        return {
          kind: 'authorized',
          scope: request.scope,
          target: request.target,
          principalRef: result.principalRef,
        }
      },
    },
    close() {
      return (closing ??= Promise.allSettled(active).then(() => undefined))
    },
  }
}
