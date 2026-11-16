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

export type PreparedCredential =
  | Readonly<{ auth: 'none' }>
  | Readonly<{ auth: 'static' | 'oauth'; binding: CredentialBinding }>

export type PreparedSettings = Readonly<{
  definition: EndpointDefinition
  credential: PreparedCredential
  account: PeerAccount
  target: ConnectionTarget
  bound: Millis
}>

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

function targetOf(adopted: AdoptedOnly): Outcome<ConnectionTarget, ConfigRefusal> {
  const { target } = adopted.settings
  if (target.kind === 'absent') return fail({ kind: 'config-missing', item: 'target' })
  if (target.kind === 'invalid') return fail({ kind: 'config-invalid', item: 'target' })
  return succeed(target.value)
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

export function prepareSettings(
  adopted: AdoptedOnly,
  connectBound: Millis | undefined,
): Outcome<PreparedSettings, SettingsFailure> {
  const target = targetOf(adopted)
  if ('failure' in target) return target
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
    target: target.ok,
    bound: bound.ok,
  })
}

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
