// The setting values an operation needs (SPEC S4), checked in the order target, credential,
// connect-timeout; only the first defect is reported. A missing credential is reported as
// K1 says: `credential-unavailable` for an operation that connects, `config-missing` for one
// that does not. The body comes parsed from the gate.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  peerAccountOf,
  type ConnectionFailure,
  type ConnectionTarget,
  type CredentialBinding,
  type EndpointDefinition,
  type Millis,
  type PeerAccount,
  type Refusal,
} from '@omne-harness/mcp-contract'
import type { AdoptedOnly } from './gate.ts'

export type ConfigRefusal = Extract<Refusal, { kind: 'config-missing' | 'config-invalid' }>

/** The credential of a connection: none, or the binding to acquire a handle for. */
export type PreparedCredential =
  | Readonly<{ auth: 'none' }>
  | Readonly<{ auth: 'static' | 'oauth'; binding: CredentialBinding }>

/** What the transport is opened on: the address of the endpoint. */
export type PreparedTransport = Readonly<{ kind: 'streamable-http'; target: ConnectionTarget }>

export type PreparedSettings = Readonly<{
  definition: EndpointDefinition
  credential: PreparedCredential
  /** The peer account, from `peerAccountOf` (K1). */
  account: PeerAccount
  transport: PreparedTransport
  /** The connection bound: the setting, or the request's `connectBound` when the setting is absent. */
  bound: Millis
}>

/** A missing credential is a connection failure (K1); the other defects are refusals. */
export type SettingsFailure =
  | ConfigRefusal
  | Extract<ConnectionFailure, { kind: 'credential-unavailable' }>

function credentialOf(
  adopted: AdoptedOnly,
): Outcome<PreparedCredential, ConfigRefusal | 'missing'> {
  const { auth } = adopted.definition
  if (auth === 'none') return succeed({ auth })
  const { credential } = adopted.settings
  if (credential.kind === 'invalid') return fail({ kind: 'config-invalid', item: 'credential' })
  if (credential.kind === 'absent') return fail('missing')
  return succeed({ auth, binding: credential.value })
}

function transportOf(adopted: AdoptedOnly): Outcome<PreparedTransport, ConfigRefusal> {
  const { target } = adopted.settings
  if (target.kind === 'absent') return fail({ kind: 'config-missing', item: 'target' })
  if (target.kind === 'invalid') return fail({ kind: 'config-invalid', item: 'target' })
  return succeed({ kind: 'streamable-http', target: target.value })
}

function boundOf(
  adopted: AdoptedOnly,
  connectBound: Millis | undefined,
): Outcome<Millis, ConfigRefusal> {
  const { connectTimeout } = adopted.settings
  if (connectTimeout.kind === 'invalid')
    return fail({ kind: 'config-invalid', item: 'connect-timeout' })
  const bound = connectTimeout.kind === 'value' ? connectTimeout.value : connectBound
  if (bound === undefined) return fail({ kind: 'config-missing', item: 'connect-timeout' })
  return succeed(bound)
}

/** The settings of an operation that connects (S4, first row), in the contract's order. */
export function prepareSettings(
  adopted: AdoptedOnly,
  connectBound: Millis | undefined,
): Outcome<PreparedSettings, SettingsFailure> {
  const transport = transportOf(adopted)
  if ('failure' in transport) return transport
  const credential = credentialOf(adopted)
  if ('failure' in credential)
    return credential.failure === 'missing'
      ? fail({ kind: 'credential-unavailable', cause: 'missing' })
      : fail(credential.failure)
  const account = peerAccountOf(
    adopted.definition.auth,
    credential.ok.auth === 'none' ? undefined : credential.ok.binding,
  )
  if ('failure' in account) return fail({ kind: 'credential-unavailable', cause: 'missing' })
  const bound = boundOf(adopted, connectBound)
  if ('failure' in bound) return bound
  return succeed({
    definition: adopted.definition,
    credential: credential.ok,
    account: account.ok,
    transport: transport.ok,
    bound: bound.ok,
  })
}

/**
 * The peer account for an operation that does not connect (`current`, `peer`; S4 second row):
 * only the credential setting is needed, and a missing one is `config-missing` (K1).
 */
export function readAccountOf(adopted: AdoptedOnly): Outcome<PeerAccount, ConfigRefusal> {
  const credential = credentialOf(adopted)
  if ('failure' in credential)
    return credential.failure === 'missing'
      ? fail({ kind: 'config-missing', item: 'credential' })
      : fail(credential.failure)
  const account = peerAccountOf(
    adopted.definition.auth,
    credential.ok.auth === 'none' ? undefined : credential.ok.binding,
  )
  return 'failure' in account ? fail({ kind: 'config-missing', item: 'credential' }) : account
}
