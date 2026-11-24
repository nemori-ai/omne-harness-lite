import { expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import type {
  CredentialBinding,
  ConnectionTarget,
  EndpointHolding,
} from '@omne-harness/mcp-contract'
import { mcpCredentialUseConformance, runConformanceCase } from '@omne-harness/mcp-contract/testing'
import { parseSecretText, type SecretBindingKey } from '@omne-harness/settings'
import {
  credentialBinding,
  credentialKey,
  createCredentialUse,
} from '../../../src/rows/mcp/credential.ts'

function tenantOf(last: string): TenantId {
  const organization = organizationCodec.parse(`org_0123456789abcdefghjkmnpqr${last}`)
  const account = accountCodec.parse(`acc_0123456789abcdefghjkmnpqr${last}`)
  if (!organization.ok || !account.ok) throw new TypeError('bad tenant sample')
  return tenant(organization.value, account.value)
}

const home = tenantOf('s')
const away = tenantOf('t')
const SECRET = 'sk-test-credential-value'
const holding = 'held-docs' as EndpointHolding
const bound = (name: string, of: string = holding) => {
  const binding = credentialBinding(of, name)
  if (binding === undefined) throw new TypeError('no binding')
  return binding
}

function custodyOf(answers: ReadonlyMap<string, 'missing' | 'denied' | 'unavailable' | string>) {
  return {
    use(key: SecretBindingKey) {
      const answer = answers.get(JSON.stringify(key)) ?? 'missing'
      if (answer === 'missing' || answer === 'denied' || answer === 'unavailable') return answer
      const secret = parseSecretText(answer)
      if (!secret.ok) throw new TypeError('bad secret sample')
      return { kind: 'secret', value: secret.value } as const
    },
  }
}

it('the credential port of the release passes the conformance suite of the contract', async () => {
  const answers = new Map<string, string>([
    [JSON.stringify(credentialKey(home, 'docs')), SECRET],
    [JSON.stringify(credentialKey(home, 'refused')), 'denied'],
    [JSON.stringify(credentialKey(home, 'locked')), 'unavailable'],
  ])
  const port = createCredentialUse(() => custodyOf(answers))
  const fixture = {
    port,
    access: { principal: null, tenant: home },
    holding,
    binding: bound('docs'),
    secret: SECRET,
    target: 'https://peer.example/mcp' as ConnectionTarget,
    missing: bound('absent'),
    otherTenant: { principal: null, tenant: away },
    otherHolding: 'held-other' as EndpointHolding,
    rejected: bound('refused'),
    unreadable: bound('locked'),
  }
  const verdicts: Record<string, string> = {}
  for (const conformance of mcpCredentialUseConformance<null>()) {
    const verdict = await runConformanceCase(conformance, fixture)
    verdicts[conformance.clause] = verdict.kind === 'passed' ? 'passed' : JSON.stringify(verdict)
  }
  expect(verdicts).toEqual({
    CU1: 'passed',
    CU2: 'passed',
    CU3: 'passed',
    CU4: 'passed',
    CU5: 'passed',
    CU6: 'passed',
    CU7: 'passed',
  })
})

it('answers unknown while the custody is away, and a binding it cannot read is missing', async () => {
  const away = createCredentialUse(() => undefined)
  const purpose = {
    kind: 'http-authorization',
    target: 'https://peer.example/mcp' as ConnectionTarget,
  } as const
  const access = { principal: null, tenant: home }
  expect(await away.acquire(access, holding, purpose, bound('docs'))).toEqual({
    failure: 'unknown',
  })
  const port = createCredentialUse(() => custodyOf(new Map()))
  const strange = 'not a binding' as CredentialBinding
  expect(await port.acquire(access, holding, purpose, strange)).toEqual({ failure: 'missing' })
})
