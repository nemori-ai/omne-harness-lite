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
  type StdioLaunch,
} from '@omne-harness/mcp-contract'
import type { ProcessSetting } from '@omne-harness/mcp-contract/provider'
import type { AdoptedOnly } from './gate.ts'

export type ConfigRefusal = Extract<Refusal, { kind: 'config-missing' | 'config-invalid' }>

export type PreparedCredential =
  | Readonly<{ auth: 'none' }>
  | Readonly<{ auth: 'static' | 'oauth'; binding: CredentialBinding }>

export type PreparedTransport =
  | Readonly<{
      kind: 'stdio'
      launch: StdioLaunch
      values: readonly ProcessSetting[]
      credentialVariables: readonly string[]
    }>
  | Readonly<{ kind: 'streamable-http'; target: ConnectionTarget }>

export type PreparedSettings = Readonly<{
  definition: EndpointDefinition
  credential: PreparedCredential
  account: PeerAccount
  transport: PreparedTransport
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

function transportOf(adopted: AdoptedOnly): Outcome<PreparedTransport, ConfigRefusal> {
  const { transport } = adopted.definition
  if (transport.kind === 'streamable-http') {
    const { target } = adopted.settings
    if (target.kind === 'absent') return fail({ kind: 'config-missing', item: 'target' })
    if (target.kind === 'invalid') return fail({ kind: 'config-invalid', item: 'target' })
    return succeed({ kind: 'streamable-http', target: target.value })
  }
  const values: ProcessSetting[] = []
  const credentialVariables: string[] = []
  for (const variable of transport.launch.env) {
    if (variable.source === 'credential') {
      credentialVariables.push(variable.name)
      continue
    }
    const value = adopted.processEnv.find(setting => setting.name === variable.name)
    if (value === undefined) return fail({ kind: 'config-missing', item: `env.${variable.name}` })
    values.push(value)
  }
  return succeed({ kind: 'stdio', launch: transport.launch, values, credentialVariables })
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
  const transport = transportOf(adopted)
  if ('failure' in transport) {
    if (transport.failure.item === 'target') return transport
  }
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
  if ('failure' in transport) return transport
  return succeed({
    definition: adopted.definition,
    credential: credential.ok,
    account: account.ok,
    transport: transport.ok,
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
