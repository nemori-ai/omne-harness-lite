import type { PrincipalIssuer, SystemPrincipal } from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { AGENT_HOST_COMPONENT } from '../rows/authorization/grants.ts'
import type { EntryEnv, EntryObjectModule } from '../types.ts'

export const AGENT_HOST_PRINCIPAL_KEY = 'agentHostPrincipal'

export function issueEntrySystemPrincipal(env: EntryEnv, component: string): SystemPrincipal {
  const issuer: PrincipalIssuer | undefined = env
    .readTrusted(principalIssuerKey)
    .get(principalIssuerKey)
  if (issuer === undefined)
    throw new Error(
      `entry principal "${component}": the trusted ${principalIssuerKey} is not installed yet; list its module before this one`,
    )
  const issued = issuer.issueSystem({ component })
  if ('failure' in issued)
    throw new Error(
      `entry principal "${component}": the authority refused it (${issued.failure.field}: ${issued.failure.reason})`,
    )
  return issued.ok
}

export const agentHostPrincipal: EntryObjectModule = {
  name: AGENT_HOST_PRINCIPAL_KEY,
  implementation: 'real',
  install(scope, env) {
    scope.provide(AGENT_HOST_PRINCIPAL_KEY, issueEntrySystemPrincipal(env, AGENT_HOST_COMPONENT))
  },
}
