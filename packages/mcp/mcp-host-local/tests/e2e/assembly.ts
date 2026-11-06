// The assembly of the e2e journey: `createMcp` on the five requirement ports and the local
// transport factory. Four ports are the contract's in-memory doubles; the landing starts real
// processes; the output validator answers `conforms` to every pair.
import { createMcp } from '@omne-harness/mcp'
import type {
  ConnectionTarget,
  EndpointRef,
  McpConfig,
  McpPorts,
  McpServices,
  OutputValidator,
  SettingValue,
  StdioLaunch,
} from '@omne-harness/mcp-contract'
import type { ProcessHandle, ProcessLanding } from '@omne-harness/mcp-contract/provider'
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
import { spawnHandle } from '../fixtures/process.ts'
import { spawnCommand } from './command.ts'

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

/** The landing of the journey: a Node program runs through `spawnHandle`, any other program through `spawnCommand`. */
const landing: ProcessLanding<Principal> = {
  async start(_access, launch) {
    const handle: ProcessHandle =
      launch.command === process.execPath
        ? spawnHandle(launch.args).handle
        : spawnCommand(launch.command, launch.args)
    return { ok: handle }
  },
}

export type Assembly = Readonly<{
  services: McpServices<Principal, string>
  /** Adopts one endpoint for alice and grants her the use eligibility. */
  adopt(ref: EndpointRef, endpoint: Adoption): void
}>

export type Adoption =
  | Readonly<{ transport: 'stdio'; launch: Pick<StdioLaunch, 'command' | 'args'> }>
  | Readonly<{ transport: 'streamable-http'; target: ConnectionTarget }>

const CONNECT_BOUND_MS = 30_000
const PROBE_TIMEOUT_MS = 10_000

export function assemble(): Assembly {
  const adoption = createMemoryAdoptionView<Principal, string>({ scopeKey: scope => scope })
  const eligibility = createMemoryUseEligibility<Principal>({ principalKey: CONFIG.principalKey })
  const checkOutput: OutputValidator = () => ({ kind: 'conforms' })
  const ports: McpPorts<Principal, string> = {
    adoption,
    eligibility,
    credentials: createMemoryCredentialUse<Principal>(),
    landing,
    store: createMemoryCatalogStore(),
    transports: createLocalTransportFactory({
      clientInfo: { name: 'omne-harness-e2e', version: '0' },
      probeTimeoutMs: PROBE_TIMEOUT_MS,
    }),
    checkOutput,
  }
  const absent: SettingValue<never> = { kind: 'absent' }
  return {
    services: createMcp(ports, CONFIG),
    adopt(ref, endpoint) {
      const body =
        endpoint.transport === 'stdio'
          ? {
              name: ref.name,
              transport: 'stdio',
              auth: 'none',
              launch: { ...endpoint.launch, env: [], facilities: [] },
            }
          : { name: ref.name, transport: 'streamable-http', auth: 'none' }
      adoption.adopt({
        tenant: ALICE.tenant,
        scope: 'e2e',
        ref,
        body: jsonOf(body),
        settings: {
          target:
            endpoint.transport === 'streamable-http'
              ? { kind: 'value', value: endpoint.target }
              : absent,
          credential: absent,
          connectTimeout: { kind: 'value', value: millisOf(CONNECT_BOUND_MS) },
        },
      })
      eligibility.grant(ALICE, ref)
    },
  }
}
