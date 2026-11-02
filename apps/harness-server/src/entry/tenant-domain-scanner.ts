import type { SystemPrincipal } from '@omne-harness/identity'
import { TENANT_DOMAIN_SCANNER_COMPONENT } from '../rows/authorization/grants.ts'
import type { EntryEnv } from '../types.ts'
import { issueEntrySystemPrincipal } from './agent-host-principal.ts'

/** Issue only the deployment tenant scanner; no issuer or service key leaves this factory. */
export function issueTenantDomainScanner(env: EntryEnv): SystemPrincipal {
  return issueEntrySystemPrincipal(env, TENANT_DOMAIN_SCANNER_COMPONENT)
}
