// The assembly of the e2e journey: `createMcp` on the requirement ports and the local transport
// factory. Four ports are the contract's in-memory doubles; the output validator answers
// `conforms` to every pair.
import { createMcp } from '@omne-harness/mcp'
import type {
  ConnectionTarget,
  EndpointRef,
  McpConfig,
  McpPorts,
  McpServices,
  OutputValidator,
  SettingValue,
} from '@omne-harness/mcp-contract'
import {
  createMemoryAdoptionView,
  createMemoryCatalogStore,
  createMemoryCredentialUse,
  createMemoryUseEligibility,
  jsonOf,
  millisOf,
} from '@omne-harness/mcp-contract/testing'
import {
  access,
  accountCodec,
  organizationCodec,
  tenant,
  type Access,
} from '@omne-harness/legal-identity'
import { createLocalTransportFactory } from '@omne-harness/mcp-host-local'

export type Principal = Readonly<{ id: string }>

const organization = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const account = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!organization.ok || !account.ok) throw new TypeError('bad tenant sample')

export const ALICE: Access<Principal> = access(
  { id: 'alice' },
  tenant(organization.value, account.value),
)

const CONFIG: McpConfig<Principal> = {
  principalKey: principal => principal.id,
  maxListingPages: 5,
  maxActions: 100,
  instructionsByteLimit: 4096,
}

export type Assembly = Readonly<{
  services: McpServices<Principal, string>
  /** Adopts one endpoint at the target for alice and grants her the use eligibility. */
  adopt(ref: EndpointRef, target: ConnectionTarget): void
}>

const CONNECT_BOUND_MS = 30_000

export function assemble(): Assembly {
  const adoption = createMemoryAdoptionView<Principal, string>({ scopeKey: scope => scope })
  const eligibility = createMemoryUseEligibility<Principal>({ principalKey: CONFIG.principalKey })
  const checkOutput: OutputValidator = () => ({ kind: 'conforms' })
  const ports: McpPorts<Principal, string> = {
    adoption,
    eligibility,
    credentials: createMemoryCredentialUse<Principal>(),
    store: createMemoryCatalogStore(),
    transports: createLocalTransportFactory({
      clientInfo: { name: 'omne-harness-e2e', version: '0' },
    }),
    checkOutput,
  }
  const absent: SettingValue<never> = { kind: 'absent' }
  return {
    services: createMcp(ports, CONFIG),
    adopt(ref, target) {
      adoption.adopt({
        tenant: ALICE.tenant,
        scope: 'e2e',
        ref,
        body: jsonOf({ name: ref.name, transport: 'streamable-http', auth: 'none' }),
        settings: {
          target: { kind: 'value', value: target },
          credential: absent,
          connectTimeout: { kind: 'value', value: millisOf(CONNECT_BOUND_MS) },
        },
      })
      eligibility.grant(ALICE, ref)
    },
  }
}
