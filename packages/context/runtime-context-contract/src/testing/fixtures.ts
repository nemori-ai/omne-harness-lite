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
} from '../index.js'
import { decodeScopeRef } from '../index.js'
import type { TenantId } from '@omne-harness/legal-identity'
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
export async function setup<P>(
  subject: RuntimeContextOperations<P>,
  tenant: TenantId,
  principal: P,
  descriptor: SuppliedBlockDescriptor<'suite.value', unknown> & {
    volatility: 'stable'
  } = declaration(),
  scopeRef: ScopeRef = scope('suite'),
): Promise<{
  subject: RuntimeContextOperations<P>
  scope: ScopeRef
  handle: ProducerHandle<'suite.value'>
  reader: ContextReader
  eligibility: Eligibility<P>
  material: EligibilityMaterial<P>
}> {
  const p = await subject.registerProducer({
    key: 'suite.value',
    producer: { producer: 'suite' },
    declaration: descriptor,
    scoped: true,
  })
  assert.equal(p.kind, 'registered')
  assert.ok(p.kind === 'registered')
  const commit = await subject.applyCommit({
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
      bindings: [
        {
          key: 'suite.value',
          need: {
            name: 'value',
            shape: numberSchema,
            consumer: 'model',
            purpose: 'conformance',
            necessity: 'required',
          },
        },
      ],
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
  const issued = await subject.issueEligibility(material)
  assert.ok(issued.kind === 'issued')
  const bound = await subject.bind(issued.eligibility.id)
  assert.ok(bound.kind === 'bound')
  return {
    subject,
    scope: scopeRef,
    handle: p.handle,
    reader: bound.reader,
    eligibility: issued.eligibility,
    material,
  }
}
