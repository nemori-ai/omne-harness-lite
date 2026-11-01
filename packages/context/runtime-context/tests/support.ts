import { tenantCodec } from '@omne-harness/legal-identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ConsumerClass,
  ContextBlockKey,
  ContextReader,
  Eligibility,
  ProducerHandle,
  ProducerRegistration,
  ScopeRef,
  SuppliedBlockDescriptor,
  SupplyCallback,
} from '@omne-harness/runtime-context-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import type { TestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import type {
  RuntimeContextConfig,
  RuntimeContextDiagnostic,
  RuntimeContextMechanism,
} from '@omne-harness/runtime-context'

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

export function scope(ref: string): ScopeRef {
  const decoded = decodeScopeRef({ ref })
  if (!('ok' in decoded)) throw new Error('Invalid fixture scope')
  return decoded.ok
}

export const numberSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'runtime-context-tests',
    validate: (value: unknown) =>
      typeof value === 'number' ? { value } : { issues: [{ message: 'Expected number' }] },
  },
}

export function supplied<K extends ContextBlockKey>(
  key: K,
  overrides: Partial<Omit<SuppliedBlockDescriptor<K, unknown>, 'volatility' | 'key' | 'kind'>> = {},
): SuppliedBlockDescriptor<K, unknown> & { volatility: 'stable' } {
  return {
    key,
    kind: 'supplied',
    schema: numberSchema,
    consumers: ['model', 'tool'],
    required: false,
    disclosure: 'plain',
    carriesPrevious: true,
    volatility: 'stable',
    recovery: 'reread',
    ...overrides,
  }
}

/** A promise with its resolver, to hold one port answer while the test interleaves. */
export function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}

export type Harness = Readonly<{
  rc: RuntimeContextMechanism<string>
  ports: TestAuthorityPorts<string>
  diagnostics: RuntimeContextDiagnostic[]
  changes: [ScopeRef, number][]
}>

export function harness(config: RuntimeContextConfig = {}): Harness {
  const ports = createTestAuthorityPorts<string>()
  const diagnostics: RuntimeContextDiagnostic[] = []
  const changes: [ScopeRef, number][] = []
  const rc = createRuntimeContext<string>({
    trust: { authority: ports.authority, bindings: ports.bindings },
    config,
    onChange: (target, revision) => {
      changes.push([target, revision])
    },
    diagnose: event => {
      diagnostics.push(event)
    },
  })
  return { rc, ports, diagnostics, changes }
}

/** Binds the scope to the tenant and completes an empty replay so the fence opens. */
export async function open(h: Harness, target: ScopeRef, tenant: TenantId): Promise<void> {
  h.ports.bind(target, tenant)
  const begun = await h.rc.beginReplay('holder', {
    scope: target,
    tenant,
    through: null,
    supersedes: null,
  })
  if (begun.kind !== 'replaying') throw new Error(`beginReplay: ${begun.kind}`)
  const ready = await h.rc.finishReplay('holder', {
    replay: begun.replay,
    material: { registrations: [], checkpoints: [], end: null },
  })
  if (ready.kind !== 'ready') throw new Error(`finishReplay: ${ready.kind}`)
}

export async function register(
  h: Harness,
  target: ScopeRef,
  tenant: TenantId,
  key: ContextBlockKey,
  basedOn = 0,
  extra: { parameters?: unknown; required?: boolean } = {},
): Promise<void> {
  const applied = await h.rc.applyCommit('holder', {
    kind: 'registration',
    commit: { commit: `${target.ref}:${key}:${basedOn}` },
    change: {
      kind: 'add',
      creating: basedOn === 0,
      scope: target,
      tenant,
      key,
      basedOn,
      required: extra.required ?? false,
      bindings: [],
      parameters: extra.parameters,
    },
  })
  if (applied.kind !== 'applied') throw new Error(`applyCommit: ${JSON.stringify(applied)}`)
}

/** The declaration object passes through unchanged, so a test controls when the catalog entry changes. */
function isStable(
  declaration: SuppliedBlockDescriptor<ContextBlockKey, unknown>,
): declaration is SuppliedBlockDescriptor<ContextBlockKey, unknown> & {
  volatility: 'stable' | 'per-step'
} {
  return declaration.volatility === 'stable' || declaration.volatility === 'per-step'
}

export async function producer(
  h: Harness,
  tenant: TenantId,
  key: ContextBlockKey,
  options: {
    declaration?: SuppliedBlockDescriptor<ContextBlockKey, unknown>
    supply?: SupplyCallback<unknown, string>
    name?: string
  } = {},
): Promise<ProducerHandle> {
  const declaration = options.declaration ?? supplied(key)
  const head = { key, tenant, producer: { producer: options.name ?? 'producer' } }
  const { supply } = options
  const registration: ProducerRegistration<ContextBlockKey, string> = !isStable(declaration)
    ? {
        ...head,
        declaration: { ...declaration, volatility: 'per-request' },
        scoped: false,
        supply: supply ?? (async () => ({ kind: 'none' })),
      }
    : supply
      ? { ...head, declaration, scoped: false, supply }
      : { ...head, declaration, scoped: true }
  const result = await h.rc.registerProducer('producer', registration)
  if (result.kind !== 'registered') throw new Error(`registerProducer: ${JSON.stringify(result)}`)
  return result.handle
}

export async function issue(
  h: Harness,
  target: ScopeRef,
  tenant: TenantId,
  keys: ContextBlockKey[],
  consumer: ConsumerClass = 'model',
): Promise<Eligibility<string>> {
  const issued = await h.rc.issueEligibility('holder', {
    supersedes: null,
    scope: target,
    consumer,
    principal: 'reader',
    tenant,
    keys,
    bindings: [],
    registrationRevision: 0,
  })
  if (issued.kind !== 'issued') throw new Error(`issueEligibility: ${JSON.stringify(issued)}`)
  return issued.eligibility
}

export async function reader(h: Harness, eligibility: Eligibility<string>): Promise<ContextReader> {
  const bound = await h.rc.bind(eligibility.id)
  if (bound.kind !== 'bound') throw new Error(`bind: ${JSON.stringify(bound)}`)
  return bound.reader
}

/** The state of the first block of a successful snapshot, or the failed result itself. */
export async function firstBlock(r: ContextReader): Promise<unknown> {
  const s = await r.snapshot()
  if (s.kind !== 'success') return s
  const block = s.value.blocks[0]
  if (block) return block.state
  return { missing: s.value.missing.map(item => item.cause) }
}

export function cacheCount(h: Harness, result: 'hit' | 'miss' | 'evicted'): number {
  return h.diagnostics.filter(d => d.kind === 'read-cache' && d.result === result).length
}
