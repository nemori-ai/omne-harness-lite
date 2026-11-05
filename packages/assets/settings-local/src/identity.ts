import {
  isQualification,
  isStandingReservation,
  standingPrincipalRef,
  type ActingForTenantPrincipal,
  type PrincipalVerifier,
  type Qualification,
  type StandingBinding,
  type StandingDestinationResolver,
  type StandingReservation,
  type StandingReservations,
  type TenantStandingSource,
} from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  SettingsChangeSchema,
  SettingsReferenceSchema,
  SettingsTargetSchema,
  type SettingsChange,
  type SettingsCommitResult,
  type SettingsOperationResult,
} from '@omne-harness/settings'
import { canonical, commandDigest, equal, withinBudget } from './encoding.ts'
import { createSettingsSqlBackend } from './provider.ts'
import { rejected } from './results.ts'
import { domainSchema, type OperationBinding } from './schema.ts'
import { createSettingsSqlTerminals, type SettingsSqlTerminalOptions } from './terminals.ts'
import type { SettingsSqlAccess, SettingsSqlBackend, SettingsSqlOptions } from './types.ts'

export type IdentityQualifiedSettingsOptions = Readonly<{
  backend: SettingsSqlOptions<ActingForTenantPrincipal>
  identity: Readonly<{
    verifier: PrincipalVerifier
    standing: TenantStandingSource
    reservations: StandingReservations
  }>
  destination: string
  required: readonly Qualification[]
}>

/** Install with Identity's resolver holder, never with a Settings client. */
export function createSettingsStandingDestination(
  input: SettingsSqlTerminalOptions & Readonly<{ destination: string }>,
): StandingDestinationResolver {
  const domain = domainSchema.parse(input.domain)
  const destination = SettingsReferenceSchema.parse(input.destination)
  const terminals = createSettingsSqlTerminals({ ...input, domain })
  return {
    async seal(reservation: StandingReservation) {
      const unavailable = {
        kind: 'unavailable' as const,
        diagnostic: 'settings-destination-unavailable',
      }
      if (!isStandingReservation(reservation)) return unavailable
      const binding = reservation.binding
      if (
        binding.owner !== 'settings' ||
        binding.destination !== destination ||
        domain.scope.kind !== 'tenant' ||
        domain.scope.tenant !== binding.scopeRef
      )
        return unavailable
      let target
      try {
        target = SettingsTargetSchema.parse(JSON.parse(binding.targetRef))
      } catch {
        return unavailable
      }
      if (target.scopeRef !== binding.scopeRef || canonical(target) !== binding.targetRef)
        return unavailable
      const result = await terminals.seal({
        domain,
        principalRef: binding.principalRef,
        target,
        operationId: binding.operationId,
        commandDigest: binding.inputDigest,
      })
      return result.kind === 'terminal'
        ? { kind: 'terminal', reservation, outcome: result.terminal.state }
        : unavailable
    },
  }
}

function identityAccess(
  options: IdentityQualifiedSettingsOptions,
): SettingsSqlAccess<ActingForTenantPrincipal> {
  return {
    async authorize(principal, request) {
      const verified = await options.identity.verifier.verify(principal)
      if (verified.kind === 'unavailable') return rejected('unavailable')
      if (verified.kind !== 'verified' || verified.principal.kind !== 'acting-for-tenant')
        return rejected('forbidden')
      const encoded = tenantCodec.encode(verified.principal.tenant)
      if (
        !encoded.ok ||
        request.scope.kind !== 'tenant' ||
        request.scope.tenant !== encoded.value ||
        request.target.scopeRef !== encoded.value
      )
        return rejected('forbidden')
      const standing = await options.identity.standing.read({ tenant: verified.principal.tenant })
      if (standing.kind === 'unavailable') return rejected('unavailable')
      if (
        standing.kind !== 'member' ||
        options.required.some(q => !standing.qualifications.includes(q))
      )
        return rejected('forbidden')
      const access = await options.backend.access.authorize(verified.principal, request)
      if (access.kind === 'rejected') return access
      return access.principalRef === standingPrincipalRef(verified.principal) &&
        equal(access.scope, request.scope) &&
        equal(access.target, request.target)
        ? access
        : rejected('forbidden')
    },
  }
}

export function createIdentityQualifiedSettings(
  input: IdentityQualifiedSettingsOptions,
): SettingsSqlBackend<ActingForTenantPrincipal> {
  const required = [...new Set(input.required)]
  if (!required.every(isQualification)) throw new TypeError('Unknown Identity qualification')
  const options = {
    ...input,
    required,
    destination: SettingsReferenceSchema.parse(input.destination),
  }
  if (options.backend.domain.scope.kind !== 'tenant')
    throw new TypeError('Identity-qualified Settings requires a tenant domain')
  const access = identityAccess(options)
  const backend = createSettingsSqlBackend({ ...options.backend, access })
  const terminals = createSettingsSqlTerminals(options.backend)
  const active = new Set<Promise<SettingsCommitResult>>()
  let closed: Promise<void> | undefined
  async function change(
    principal: ActingForTenantPrincipal,
    input: SettingsChange,
  ): Promise<SettingsCommitResult> {
    const command = input
    const authorized = await access.authorize(principal, {
      scope: options.backend.domain.scope,
      target: command.target,
      action: 'commit',
    })
    if (authorized.kind === 'rejected') return authorized
    const binding: OperationBinding = {
      domain: options.backend.domain,
      principalRef: authorized.principalRef,
      target: command.target,
      operationId: command.operationId,
      commandDigest: commandDigest(command),
    }
    const terminal = await terminals.inspect(binding)
    if (terminal.kind === 'conflict') return rejected('operation_conflict')
    const unknown = { kind: 'unknown' as const, operationId: command.operationId }
    if (terminal.kind === 'unavailable') return unknown
    async function recover(): Promise<SettingsCommitResult> {
      const found: SettingsOperationResult = await backend.getOperation(principal, {
        target: command.target,
        operationId: command.operationId,
      })
      return found.kind === 'not_found' ? unknown : found
    }
    if (terminal.kind === 'terminal') return recover()
    const standingBinding: StandingBinding = {
      version: 'standing/1',
      owner: 'settings',
      operationId: command.operationId,
      principalRef: binding.principalRef,
      destination: options.destination,
      scopeRef: command.target.scopeRef,
      targetRef: canonical(command.target),
      inputDigest: binding.commandDigest,
    }
    const reservation = await options.identity.reservations.reserve({
      principal,
      binding: standingBinding,
      required,
    })
    switch (reservation.kind) {
      case 'denied':
        return rejected('forbidden')
      case 'operation-conflict':
        return rejected('operation_conflict')
      case 'blocked':
        return rejected('basis_changed')
      case 'unavailable':
        return unknown
      case 'terminal':
        return recover()
      case 'held': {
        const result = await backend.commit(principal, command)
        const settled = await options.identity.reservations.settle(reservation.reservation.id)
        if (result.kind === 'committed') return result
        return settled.kind === 'terminal' ? recover() : unknown
      }
    }
  }
  return {
    getOperation: (context, request) =>
      closed ? Promise.resolve(rejected('closing')) : backend.getOperation(context, request),
    readChanges: (context, request) =>
      closed ? Promise.resolve(rejected('closing')) : backend.readChanges(context, request),
    readState: (context, target) =>
      closed ? Promise.resolve(rejected('closing')) : backend.readState(context, target),
    commit(principal, command) {
      if (closed) return Promise.resolve(rejected('closing'))
      if (!withinBudget(command)) return Promise.resolve(rejected('limit_exceeded'))
      const parsed = SettingsChangeSchema.safeParse(command)
      if (!parsed.success) return Promise.resolve(rejected('invalid_input'))
      const promise = change(principal, parsed.data).catch((): SettingsCommitResult => ({
        kind: 'unknown',
        operationId: parsed.data.operationId,
      }))
      active.add(promise)
      void promise.then(() => active.delete(promise))
      return promise
    },
    close() {
      return (closed ??= Promise.allSettled(active).then(() => backend.close()))
    },
  }
}
