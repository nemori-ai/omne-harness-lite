import {
  isQualification,
  standingPrincipalRef,
  type ActingForTenantPrincipal,
  type PrincipalVerifier,
  type Qualification,
  type StandingBinding,
  type StandingReservations,
  type TenantStandingSource,
} from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  HITL_COMMAND_MAX_BYTES,
  HitlIdentifierSchema,
  type HitlReadFailure,
  type OperationRef,
} from '@omne-harness/human-intervention'
import { canonical, digest, operationKey } from './encoding.ts'
import { IndependentCommandSchema, type IndependentCommand } from './independent-schema.ts'
import { independentControlCommands } from './commands.ts'
import { createHitlSqlOperations, type HitlSqlOperationInspection } from './operations.ts'
import { createHitlSqlTerminals, type HitlSqlTerminalOptions } from './terminals.ts'
import { HitlSqlBindingSchema, type HitlSqlBinding } from './terminal-schema.ts'

export type IdentityHitlCommand = Exclude<IndependentCommand, { kind: 'prepare' }>
export type IdentityHitlOptions = HitlSqlTerminalOptions &
  Readonly<{
    identity: Readonly<{
      verifier: PrincipalVerifier
      standing: TenantStandingSource
      reservations: StandingReservations
    }>
    destination: string
    required: readonly Qualification[]
  }>
export type HitlQualification =
  | Readonly<{
      kind: 'qualified'
      principal: ActingForTenantPrincipal
      actorRef: string
      tenantRef: string
    }>
  | HitlReadFailure

type WriteResult =
  | Extract<HitlSqlOperationInspection, { kind: 'committed' }>['result']
  | Exclude<HitlSqlOperationInspection, { kind: 'committed' | 'not-committed' }>

function operation(input: IdentityHitlCommand): OperationRef {
  return input.kind === 'request' ? input.input.command.operation : input.command.operation
}
function outcome(found: HitlSqlOperationInspection): WriteResult {
  switch (found.kind) {
    case 'committed':
      return found.result
    case 'not-committed':
      return { kind: 'conflict', operationRef: found.operationRef, reason: 'operation-sealed' }
    default:
      return found
  }
}
function tenantReference(principal: ActingForTenantPrincipal, options: IdentityHitlOptions) {
  const encoded = tenantCodec.encode(principal.tenant)
  return encoded.ok &&
    options.domain.scope.kind === 'tenant' &&
    encoded.value === options.domain.scope.tenant
    ? encoded.value
    : undefined
}
function qualification(options: IdentityHitlOptions) {
  return async (principal: ActingForTenantPrincipal): Promise<HitlQualification> => {
    try {
      const verified = await options.identity.verifier.verify(principal)
      if (verified.kind === 'unavailable')
        return { kind: 'unavailable', reason: 'identity-verifier' }
      if (verified.kind !== 'verified' || verified.principal.kind !== 'acting-for-tenant')
        return { kind: 'denied', reason: 'principal' }
      const tenantRef = tenantReference(verified.principal, options)
      if (!tenantRef) return { kind: 'denied', reason: 'tenant' }
      const standing = await options.identity.standing.read({ tenant: verified.principal.tenant })
      if (standing.kind === 'unavailable')
        return { kind: 'unavailable', reason: 'identity-standing' }
      if (
        standing.kind !== 'member' ||
        options.required.some(item => !standing.qualifications.includes(item))
      )
        return { kind: 'denied', reason: 'qualification' }
      return {
        kind: 'qualified',
        principal: verified.principal,
        tenantRef,
        actorRef: standingPrincipalRef(verified.principal),
      }
    } catch {
      return { kind: 'unavailable', reason: 'identity-read' }
    }
  }
}

/** Coordinates Identity standing for named HITL writes. Work and permission guards remain with their owners. */
export function createIdentityQualifiedHitl(input: IdentityHitlOptions) {
  const required = [...new Set(input.required)]
  if (!required.every(isQualification)) throw new TypeError('Unknown Identity qualification')
  const options = { ...input, required, destination: HitlIdentifierSchema.parse(input.destination) }
  const terminals = createHitlSqlTerminals(options)
  const operations = createHitlSqlOperations(options)
  const qualify = qualification(options)
  const active = new Set<Promise<unknown>>()
  let closing = false
  let closed: Promise<void> | undefined
  function track<T>(run: () => Promise<T>): Promise<T> {
    const promise = Promise.resolve().then(run)
    active.add(promise)
    void promise.then(
      () => active.delete(promise),
      () => active.delete(promise),
    )
    return promise
  }
  async function authorize(
    principal: ActingForTenantPrincipal,
    ref: OperationRef,
  ): Promise<HitlQualification> {
    const qualified = await qualify(principal)
    if (qualified.kind !== 'qualified') return qualified
    if (qualified.actorRef !== ref.actorRef || qualified.tenantRef !== ref.tenantRef)
      return { kind: 'denied', reason: 'operation-owner' }
    return qualified
  }
  async function execute(
    principal: ActingForTenantPrincipal,
    command: IdentityHitlCommand,
  ): Promise<WriteResult> {
    const operationRef = operation(command)
    const authorized = await authorize(principal, operationRef)
    if (authorized.kind !== 'qualified') return authorized
    const binding = {
      operationRef,
      inputDigest: digest(command.kind === 'request' ? command.input : command),
    }
    const unknown = { kind: 'unknown', operationRef } as const
    const terminal = await terminals.inspect(binding)
    if (terminal.kind === 'conflict')
      return { kind: 'conflict', operationRef, reason: 'operation-binding' }
    if (terminal.kind === 'unavailable') return unknown
    if (terminal.kind === 'terminal') return outcome(await operations.inspect(binding))
    return reserveAndCommit(command, binding, authorized.principal)
  }
  async function reserveAndCommit(
    command: IdentityHitlCommand,
    binding: HitlSqlBinding,
    principal: ActingForTenantPrincipal,
  ): Promise<WriteResult> {
    const operationRef = binding.operationRef
    const unknown = { kind: 'unknown', operationRef } as const
    const standing: StandingBinding = {
      version: 'standing/1',
      owner: 'human-intervention',
      operationId: operationRef.operationId,
      principalRef: operationRef.actorRef,
      destination: options.destination,
      scopeRef: operationRef.tenantRef,
      targetRef: canonical(operationRef),
      inputDigest: binding.inputDigest,
    }
    const reservation = await options.identity.reservations.reserve({
      principal,
      binding: standing,
      required,
    })
    switch (reservation.kind) {
      case 'denied':
        return { kind: 'denied', reason: 'qualification' }
      case 'blocked':
        return { kind: 'conflict', operationRef, reason: 'qualification-changing' }
      case 'operation-conflict':
        return { kind: 'conflict', operationRef, reason: 'operation-binding' }
      case 'unavailable':
        return unknown
      case 'terminal':
        return outcome(await operations.inspect(binding))
      case 'held': {
        try {
          await options.storage.commit({
            identity: {
              ...options.domain,
              operation: 'hitl.command',
              protocolVersion: '2',
              operationKey: operationKey(operationRef),
            },
            combinationVersion: options.combinationVersion,
            manifestDigest: options.manifestDigest,
            commands: independentControlCommands(command),
          })
        } finally {
          await options.identity.reservations.settle(reservation.reservation.id)
        }
        return outcome(await operations.inspect(binding))
      }
    }
  }
  return {
    qualify(principal: ActingForTenantPrincipal): Promise<HitlQualification> {
      return closing
        ? Promise.resolve({ kind: 'unavailable', reason: 'closing' })
        : track(() => qualify(principal))
    },
    execute(principal: ActingForTenantPrincipal, input: IdentityHitlCommand): Promise<WriteResult> {
      if (closing) return Promise.resolve({ kind: 'unavailable', reason: 'closing' })
      let parsed
      try {
        if (Buffer.byteLength(canonical(input), 'utf8') > HITL_COMMAND_MAX_BYTES)
          return Promise.resolve({
            kind: 'limited',
            resource: 'command-bytes',
            limit: HITL_COMMAND_MAX_BYTES,
          })
        parsed = IndependentCommandSchema.safeParse(input)
      } catch {
        return Promise.resolve({ kind: 'invalid-input', reason: 'command' })
      }
      if (!parsed.success || parsed.data.kind === 'prepare')
        return Promise.resolve({ kind: 'invalid-input', reason: 'command' })
      const command = parsed.data
      return track(() =>
        execute(principal, command).catch((): WriteResult => ({
          kind: 'unknown',
          operationRef: operation(command),
        })),
      )
    },
    inspect(
      principal: ActingForTenantPrincipal,
      input: HitlSqlBinding,
    ): Promise<HitlSqlOperationInspection> {
      if (closing) return Promise.resolve({ kind: 'unavailable', reason: 'closing' })
      const parsed = HitlSqlBindingSchema.safeParse(input)
      if (!parsed.success)
        return Promise.resolve({ kind: 'invalid-input', reason: 'operation-binding' })
      return track(() =>
        authorize(principal, parsed.data.operationRef).then(authorized =>
          authorized.kind === 'qualified' ? operations.inspect(parsed.data) : authorized,
        ),
      )
    },
    close() {
      closing = true
      return (closed ??= Promise.allSettled(active).then(() => undefined))
    },
  }
}
