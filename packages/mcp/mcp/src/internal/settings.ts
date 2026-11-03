// The setting values an operation that connects needs (SPEC S4), checked in the order target,
// credential, connect-timeout, env; only the first defect is reported. A missing credential is
// reported as K1 says. The body is parsed here once for the connection table.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  parseEndpointBody,
  type ConnectionFailure,
  type ConnectionTarget,
  type CredentialBinding,
  type EndpointDefinition,
  type Millis,
  type Refusal,
} from '@omne-harness/mcp-contract'
import type { AdoptedEndpoint, ProcessSetting } from '@omne-harness/mcp-contract/provider'

export type PreparedSettings = Readonly<{
  definition: EndpointDefinition
  /** The credential binding; undefined when `auth` is `none`. */
  binding: CredentialBinding | undefined
  /** The connection target; undefined for stdio. */
  target: ConnectionTarget | undefined
  /** The connection bound: the setting, or the request's `connectBound` when the setting is absent. */
  bound: Millis
  /** The non-secret values of the `setting` variables, in body order. */
  values: readonly ProcessSetting[]
  /** The names of the `credential` variables, in body order. */
  credentialVariables: readonly string[]
}>

export type SettingsRefusal =
  | Refusal
  | Extract<ConnectionFailure, { kind: 'credential-unavailable' }>

const UNKNOWN: Refusal = { kind: 'unknown' }

export function prepareSettings(
  adopted: AdoptedEndpoint,
  connectBound: Millis | undefined,
): Outcome<PreparedSettings, SettingsRefusal> {
  const parsed = parseEndpointBody(adopted.body, adopted.ref.name)
  if ('failure' in parsed) return fail(UNKNOWN)
  const definition = parsed.ok
  const { settings } = adopted
  let target: ConnectionTarget | undefined
  if (definition.transport.kind === 'streamable-http') {
    if (settings.target.kind === 'absent') return fail({ kind: 'config-missing', item: 'target' })
    if (settings.target.kind === 'invalid') return fail({ kind: 'config-invalid', item: 'target' })
    target = settings.target.value
  }
  let binding: CredentialBinding | undefined
  if (definition.auth !== 'none') {
    if (settings.credential.kind === 'invalid')
      return fail({ kind: 'config-invalid', item: 'credential' })
    if (settings.credential.kind === 'absent')
      return fail({ kind: 'credential-unavailable', cause: 'missing' })
    binding = settings.credential.value
  }
  if (settings.connectTimeout.kind === 'invalid')
    return fail({ kind: 'config-invalid', item: 'connect-timeout' })
  const bound =
    settings.connectTimeout.kind === 'value' ? settings.connectTimeout.value : connectBound
  if (bound === undefined) return fail({ kind: 'config-missing', item: 'connect-timeout' })
  const values: ProcessSetting[] = []
  const credentialVariables: string[] = []
  if (definition.transport.kind === 'stdio')
    for (const variable of definition.transport.launch.env) {
      if (variable.source === 'credential') {
        credentialVariables.push(variable.name)
        continue
      }
      const value = adopted.processEnv.find(setting => setting.name === variable.name)
      if (value === undefined) return fail({ kind: 'config-missing', item: `env.${variable.name}` })
      values.push(value)
    }
  return succeed({ definition, binding, target, bound, values, credentialVariables })
}
