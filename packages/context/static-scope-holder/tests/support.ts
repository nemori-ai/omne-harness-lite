import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type {
  ConsumerClass,
  ContextBlockKey,
  ContextReader,
  EligibilityId,
  NeedBinding,
  RuntimeContextOperations,
  StaticBlock,
  StaticRegistration,
} from '@omne-harness/runtime-context-contract'
import {
  createMemoryRuntimeContext,
  createTestAuthorityPorts,
  type AuthorityCall,
  type TestAuthorityPorts,
} from '@omne-harness/runtime-context-contract/testing'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import { createStaticScopeHolder, staticScopeTenant } from '@omne-harness/static-scope-holder'

export const KIND = 'tenant'

export function tenantOf(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_00000000000000000000000000',
      account: `acc_${account.padStart(26, '0')}`,
    }),
  )
  if (!parsed.ok) throw new Error('Invalid fixture tenant')
  return parsed.value
}

export const tenantA = tenantOf('1')
export const tenantB = tenantOf('2')

const numberSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'static-scope-holder-tests',
    validate: (value: unknown) =>
      typeof value === 'number' ? { value } : { issues: [{ message: 'Expected number' }] },
  },
}

/** What the blocks of a test supply, by block key and tenant. Absent: the owner has no value. */
export const supplied = new Map<string, number | 'unavailable'>()

export function supplyOf(key: string, tenant: TenantId): string {
  const text = tenantCodec.encode(tenant)
  return `${key}@${text.ok ? text.value : ''}`
}

export function block(
  key: string,
  overrides: Partial<StaticBlock['declaration']> = {},
): StaticBlock {
  return {
    declaration: {
      key: key as ContextBlockKey,
      kind: 'supplied',
      schema: numberSchema,
      consumers: ['coordinator', 'extension'],
      required: true,
      disclosure: 'plain',
      carriesPrevious: false,
      recovery: 'reread',
      ...overrides,
      volatility: 'per-read',
    },
    supply: async ({ tenant }) => {
      const value = supplied.get(supplyOf(key, tenant))
      if (value === undefined) return { kind: 'none' }
      return value === 'unavailable' ? { kind: 'unavailable' } : { kind: 'value', value }
    },
  }
}

export function need(
  name: string,
  key: string,
  overrides: Readonly<{ consumer?: ConsumerClass; translated?: boolean }> = {},
): NeedBinding {
  const head = {
    need: {
      name,
      shape: numberSchema,
      consumer: overrides.consumer ?? 'coordinator',
      purpose: 'a test need',
      necessity: 'optional' as const,
    },
    key: key as ContextBlockKey,
  }
  return overrides.translated
    ? { ...head, translate: value => Number(value) + 1, integrator: 'coordinator' }
    : head
}

export type Mechanism = RuntimeContextOperations<string> & Readonly<{ close(): Promise<void> }>
export type MechanismFactory = (ports: TestAuthorityPorts<string>) => Mechanism

/** The mechanism of this repository and the reference of the contract: the holder uses the contract only. */
export const MECHANISMS: readonly (readonly [string, MechanismFactory])[] = [
  [
    'runtime-context',
    ports => createRuntimeContext<string>({ trust: ports, config: { retention: 64 } }),
  ],
  ['the memory reference of the contract', ports => createMemoryRuntimeContext<string>(ports)],
]

export type World = Readonly<{
  ports: TestAuthorityPorts<string>
  rc: Mechanism
  content: { current: StaticRegistration }
  holder: ReturnType<typeof createStaticScopeHolder<string>>
  another(): ReturnType<typeof createStaticScopeHolder<string>>
}>

/** Trust whose scope bindings come from the reference itself, as the application wires them. */
export function trustOf(): TestAuthorityPorts<string> {
  const ports = createTestAuthorityPorts<string>()
  return {
    ...ports,
    get calls() {
      return ports.calls
    },
    bindings: {
      async lookup(scope) {
        const tenant = staticScopeTenant(KIND, scope)
        return tenant === undefined ? { kind: 'unbound' } : { kind: 'bound', tenant }
      },
    },
  }
}

export function world(
  factory: MechanismFactory,
  initial: StaticRegistration,
  ports: TestAuthorityPorts<string> = trustOf(),
): World {
  const rc = factory(ports)
  const content = { current: initial }
  const make = () =>
    createStaticScopeHolder<string>({
      kind: KIND,
      runtime: rc,
      registration: () => content.current,
    })
  return { ports, rc, content, holder: make(), another: make }
}

export type View = Readonly<{
  values: Readonly<Record<string, unknown>>
  missing: Readonly<Record<string, string>>
}>

export async function readWith(
  rc: Pick<Mechanism, 'bind'>,
  eligibility: EligibilityId,
): Promise<View | string> {
  const bound = await rc.bind(eligibility)
  if (bound.kind !== 'bound') return `bind:${bound.kind}`
  return snapshotOf(bound.reader)
}

async function snapshotOf(reader: ContextReader): Promise<View | string> {
  const snapshot = await reader.snapshot()
  if (snapshot.kind !== 'success') return `snapshot:${snapshot.kind}`
  const values: Record<string, unknown> = {}
  for (const item of snapshot.value.blocks)
    values[item.key] = item.state.kind === 'value' ? item.state.value : item.state.kind
  const missing: Record<string, string> = {}
  for (const item of snapshot.value.missing) missing[item.key] = item.cause
  for (const item of snapshot.value.perRead) {
    if (item.kind === 'value') values[item.key] = item.value
    else if (item.kind === 'none') values[item.key] = 'none'
    else missing[item.key] = item.kind === 'missing' ? item.cause : `unknown:${item.cause}`
  }
  return { values, missing }
}

type HolderCall = Extract<AuthorityCall<string>, { face: 'holder' }>

export function holderCalls(ports: TestAuthorityPorts<string>, kind: string): HolderCall[] {
  return ports.calls.filter(
    (call): call is HolderCall => call.face === 'holder' && call.action.kind === kind,
  )
}

/** How many registration commits the holder asked for after its recovery. */
export function commits(ports: TestAuthorityPorts<string>): number {
  return holderCalls(ports, 'commit').length
}

export function recoveries(ports: TestAuthorityPorts<string>): number {
  return holderCalls(ports, 'finish-replay').length
}
