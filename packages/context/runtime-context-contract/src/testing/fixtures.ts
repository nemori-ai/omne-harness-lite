import assert from 'node:assert/strict'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  ScopeRef,
  SuppliedBlockDescriptor,
  RuntimeContextOperations,
  ProducerHandle,
  ContextReader,
  Eligibility,
  EligibilityMaterial,
  ReplayRef,
} from '../index.js'
import { decodeScopeRef } from '../index.js'
import type { TenantId } from '@omne-harness/legal-identity'
import type { TestAuthorityPorts } from './ports.js'

export const numberSchema: StandardSchemaV1<unknown, number> = {
  '~standard': {
    version: 1,
    vendor: 'runtime-context-conformance',
    validate: value =>
      typeof value === 'number' ? { value } : { issues: [{ message: 'Expected number' }] },
  },
}
export function scope(ref: string, parent?: ScopeRef): ScopeRef {
  const decoded = decodeScopeRef(parent ? { ref, parent } : { ref })
  assert.ok('ok' in decoded)
  return decoded.ok
}
export function declaration(
  overrides: Partial<SuppliedBlockDescriptor<'suite.value', unknown>> & {
    volatility: 'per-request'
  },
): SuppliedBlockDescriptor<'suite.value', unknown> & { volatility: 'per-request' }
export function declaration(
  overrides?: Partial<SuppliedBlockDescriptor<'suite.value', unknown>> & { volatility?: 'stable' },
): SuppliedBlockDescriptor<'suite.value', unknown> & { volatility: 'stable' }
export function declaration(
  overrides: Partial<SuppliedBlockDescriptor<'suite.value', unknown>> = {},
): SuppliedBlockDescriptor<'suite.value', unknown> {
  return {
    key: 'suite.value',
    kind: 'supplied',
    schema: numberSchema,
    consumers: ['model', 'tool'],
    required: true,
    disclosure: 'plain',
    carriesPrevious: true,
    volatility: 'stable',
    recovery: 'reread',
    ...overrides,
  }
}

/** Binds the scope to the tenant in the trusted table and completes an empty replay, so the fence opens (RC-09). */
export async function openScope<P>(
  subject: RuntimeContextOperations<P>,
  ports: TestAuthorityPorts<P>,
  principal: P,
  target: ScopeRef,
  tenant: TenantId,
): Promise<ReplayRef> {
  ports.bind(target, tenant)
  const begun = await subject.beginReplay(principal, {
    scope: target,
    tenant,
    through: null,
    supersedes: null,
  })
  assert.ok(begun.kind === 'replaying', `beginReplay: ${begun.kind}`)
  const ready = await subject.finishReplay(principal, {
    replay: begun.replay,
    material: { registrations: [], checkpoints: [], end: null },
  })
  assert.ok(ready.kind === 'ready', `finishReplay: ${ready.kind}`)
  return begun.replay
}

export function requiredBinding() {
  return {
    key: 'suite.value',
    need: {
      name: 'value',
      shape: numberSchema,
      consumer: 'model',
      purpose: 'conformance',
      necessity: 'required',
    },
  } as const
}

export type Setup<P> = Readonly<{
  subject: RuntimeContextOperations<P>
  ports: TestAuthorityPorts<P>
  principal: P
  tenant: TenantId
  scope: ScopeRef
  handle: ProducerHandle<'suite.value'>
  reader: ContextReader
  eligibility: Eligibility<P>
  material: EligibilityMaterial<P>
}>

export async function setup<P>(
  subject: RuntimeContextOperations<P>,
  ports: TestAuthorityPorts<P>,
  tenant: TenantId,
  principal: P,
  descriptor: SuppliedBlockDescriptor<'suite.value', unknown> & {
    volatility: 'stable'
  } = declaration(),
  scopeRef: ScopeRef = scope('suite'),
): Promise<Setup<P>> {
  await openScope(subject, ports, principal, scopeRef, tenant)
  const p = await subject.registerProducer(principal, {
    key: 'suite.value',
    tenant,
    producer: { producer: 'suite' },
    declaration: descriptor,
    scoped: true,
  })
  assert.ok(p.kind === 'registered', `registerProducer: ${p.kind}`)
  const commit = await subject.applyCommit(principal, {
    kind: 'registration',
    commit: { commit: 'registration' },
    change: {
      kind: 'add',
      creating: true,
      scope: scopeRef,
      tenant,
      key: 'suite.value',
      basedOn: 0,
      required: true,
      parameters: undefined,
      bindings: [requiredBinding()],
    },
  })
  assert.equal(commit.kind, 'applied')
  const material: EligibilityMaterial<P> = {
    supersedes: null,
    scope: scopeRef,
    consumer: 'model',
    principal,
    tenant,
    keys: ['suite.value'],
    bindings: [],
    registrationRevision: 1,
  }
  const issued = await subject.issueEligibility(principal, material)
  assert.ok(issued.kind === 'issued', `issueEligibility: ${issued.kind}`)
  const bound = await subject.bind(issued.eligibility.id)
  assert.ok(bound.kind === 'bound', `bind: ${bound.kind}`)
  return {
    subject,
    ports,
    principal,
    tenant,
    scope: scopeRef,
    handle: p.handle,
    reader: bound.reader,
    eligibility: issued.eligibility,
    material,
  }
}

/** Reads the one stable value the reader sees, or undefined. */
export async function snapshotValue(reader: ContextReader): Promise<unknown> {
  const r = await reader.snapshot()
  assert.ok(r.kind === 'success', `snapshot: ${r.kind}`)
  const block = r.value.blocks[0]
  return block?.state.kind === 'value' ? block.state.value : undefined
}
