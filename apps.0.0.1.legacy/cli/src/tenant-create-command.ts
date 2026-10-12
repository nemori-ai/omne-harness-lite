import type { ClientLocalState } from '@omne-harness-lite/client-local-state'
import type {
  GovernanceClientOperations,
  GovernanceUse,
  AdmissionReason,
  Origin,
} from '@omne-harness-lite/governance-client-operations'
import { isOk, parseAccountId, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import { parseOrganizationName } from '@omne-harness-lite/organization-governance'
import { ClientStateOpenFailure } from '@omne-harness-lite/client-local-state-sqlite'
import type { CliCatalog, CapturedCreation } from './catalog.ts'
import type { CreatedTenantPreparation } from './tenant-preparation.ts'
import { prepareTenantAuth, type TenantAuthOutcome } from './tenant-auth.ts'
import {
  readCurrentLogin,
  type RunLoginBinding,
  type SessionPreparationOutcome,
} from './session-preparation.ts'
import { resolveStateHome, StateLayoutFailure } from './state-layout.ts'

export interface TenantCreateCommandInput {
  readonly home: string
  readonly name: string
  readonly creationKey: string
  readonly loginScope: Pick<RunLoginBinding, 'centerId' | 'accountId'>
}
export interface TenantCreateCommandPorts {
  readonly client: GovernanceClientOperations
  readonly catalog: CliCatalog
  readonly source: ClientLocalState
}
export type TenantCreateCommandOutcome =
  | {
      readonly kind: 'blocked'
      readonly reason:
        | AdmissionReason
        | Extract<SessionPreparationOutcome, { kind: 'blocked' }>['reason']
        | 'identity-conflict'
    }
  | { readonly kind: 'unconfirmed' | 'pending'; readonly request: CapturedCreation }
  | {
      readonly kind: 'unresolved'
      readonly request: CapturedCreation
      readonly result: Extract<CreatedTenantPreparation, { kind: 'unresolved' }>
    }
  | {
      readonly kind: 'created'
      readonly request: CapturedCreation
      readonly result: Extract<CreatedTenantPreparation, { kind: 'created' }>
      readonly auth: TenantCreateAuth
    }
type TenantCreateAuth =
  | TenantAuthOutcome
  | {
      readonly kind: 'not-prepared'
      readonly reason: Extract<SessionPreparationOutcome, { kind: 'blocked' }>['reason']
    }
  | {
      readonly kind: 'failed'
      readonly reason: StateLayoutFailure['reason'] | ClientStateOpenFailure['reason']
    }

/** The process supplies one original creation key. This flow owns only the use it opens. */
export async function runTenantCreateCommand(
  input: TenantCreateCommandInput,
  ports: TenantCreateCommandPorts,
): Promise<TenantCreateCommandOutcome> {
  const captured = commandInput(input)
  if (captured === undefined) return { kind: 'blocked', reason: 'invalid-input' }
  const opened = await ports.client.openUse()
  if (opened.kind === 'blocked') return opened
  let failed = false,
    originalFailure: unknown
  try {
    return await createWithUse(captured, ports, opened.use, opened.origin)
  } catch (error) {
    failed = true
    originalFailure = error
    throw error
  } finally {
    try {
      await opened.use.close()
    } catch (error) {
      if (failed)
        throw new AggregateError([originalFailure, error], 'tenant creation and use close failed')
      throw error
    }
  }
}
function commandInput(input: TenantCreateCommandInput): TenantCreateCommandInput | undefined {
  const name = parseOrganizationName(input.name),
    key = parseOpaqueIdentifier(input.creationKey, 'CreationKey')
  const account = parseAccountId(input.loginScope?.accountId)
  if (
    !isOk(name) ||
    !isOk(key) ||
    !isOk(account) ||
    !isGovernanceCenterId(input.loginScope?.centerId)
  )
    return undefined
  try {
    return {
      home: resolveStateHome({ explicitHome: input.home, osHome: input.home }),
      name: name.ok,
      creationKey: key.ok,
      loginScope: { centerId: input.loginScope.centerId, accountId: account.ok },
    }
  } catch (error) {
    if (error instanceof StateLayoutFailure) return undefined
    throw error
  }
}
function fixedLoginMatches(origin: Origin, login: RunLoginBinding): boolean {
  return (
    origin.centerId === login.centerId &&
    origin.loginStateHandle === login.loginStateHandle &&
    (origin.accountId === null || origin.accountId === login.accountId)
  )
}
function belongsToScope(input: TenantCreateCommandInput, login: RunLoginBinding): boolean {
  return (
    input.loginScope.centerId === login.centerId && input.loginScope.accountId === login.accountId
  )
}
async function createWithUse(
  input: TenantCreateCommandInput,
  ports: TenantCreateCommandPorts,
  use: GovernanceUse,
  origin: Origin,
): Promise<TenantCreateCommandOutcome> {
  const observed = await readCurrentLogin(use)
  if (observed.kind === 'blocked') return observed
  if (!fixedLoginMatches(origin, observed.login) || !belongsToScope(input, observed.login))
    return { kind: 'blocked', reason: 'identity-mismatch' }
  const request: CapturedCreation = {
    login: observed.login,
    name: input.name,
    creationKey: input.creationKey,
  }
  const captured = await ports.catalog.captureCreation(request)
  if (captured === 'conflict') return { kind: 'blocked', reason: 'identity-conflict' }
  if (captured === 'unconfirmed') return { kind: 'unconfirmed', request }
  const executed = await ports.catalog.executeCreation(request, use)
  if (executed.kind === 'unconfirmed') return { kind: 'unconfirmed', request }
  const result = executed.record.result
  if (result === null) return { kind: 'pending', request }
  if (result.kind === 'unresolved') return { kind: 'unresolved', request, result }
  if (result.kind === 'invalid-input') return { kind: 'blocked', reason: 'invalid-input' }
  return {
    kind: 'created',
    request,
    result,
    auth: await createdAuth(input.home, ports.source, request, result),
  }
}
async function createdAuth(
  home: string,
  source: ClientLocalState,
  request: CapturedCreation,
  result: Extract<CreatedTenantPreparation, { kind: 'created' }>,
): Promise<TenantCreateAuth> {
  if (result.preparation.kind === 'blocked')
    return { kind: 'not-prepared', reason: result.preparation.reason }
  try {
    return await prepareTenantAuth(
      home,
      source,
      result.preparation.identity,
      request.creationKey,
      'empty-only',
    )
  } catch (error) {
    if (error instanceof StateLayoutFailure || error instanceof ClientStateOpenFailure)
      return { kind: 'failed', reason: error.reason }
    throw error
  }
}
