import assert from 'node:assert/strict'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  RuntimeContextOperations,
  RuntimeContextAuthority,
  ScopeBindingSource,
  ScopeRef,
} from '../index.js'
import { setup, scope, openScope, type Setup } from './fixtures.js'
import { createTestAuthorityPorts, type TestAuthorityPorts } from './ports.js'

/** The authority ports a subject must use for every check. The suite controls them. */
export type RuntimeContextPorts<P> = Readonly<{
  authority: RuntimeContextAuthority<P>
  bindings: ScopeBindingSource
}>

export type RuntimeContextFixture<P = unknown> = Readonly<{
  /** A fresh subject that uses exactly the given ports. */
  subject(ports: RuntimeContextPorts<P>): Promise<RuntimeContextOperations<P>>
  tenant: TenantId
  otherTenant: TenantId
  principal: P
  /** Retained change count of the fresh subject; required only for the retention case. */
  retention?: number
  /** Recovery material capacity of the fresh subject; required only for the capacity case. */
  replayCapacity?: number
  close?(subject: RuntimeContextOperations<P>): Promise<void>
}>

/** A fresh subject wired to fresh scripted ports. */
export async function start<P>(
  fixture: RuntimeContextFixture<P>,
): Promise<{ subject: RuntimeContextOperations<P>; ports: TestAuthorityPorts<P> }> {
  const ports = createTestAuthorityPorts<P>()
  const subject = await fixture.subject({ authority: ports.authority, bindings: ports.bindings })
  return { subject, ports }
}

/** A fresh subject with the standard setup of one scope, one producer and one bound reader. */
export async function started<P>(fixture: RuntimeContextFixture<P>): Promise<Setup<P>> {
  const { subject, ports } = await start(fixture)
  return setup(subject, ports, fixture.tenant, fixture.principal)
}

/** Registers the suite block in a second open scope of the same tenant. */
export async function addScope<P>(s: Setup<P>, ref: string, required = false): Promise<ScopeRef> {
  const other = scope(ref)
  await openScope(s.subject, s.ports, s.principal, other, s.tenant)
  const added = await s.subject.applyCommit(s.principal, {
    kind: 'registration',
    commit: { commit: ref },
    change: {
      kind: 'add',
      creating: true,
      scope: other,
      tenant: s.tenant,
      key: 'suite.value',
      basedOn: 0,
      required,
      bindings: [],
      parameters: undefined,
    },
  })
  assert.equal(added.kind, 'applied')
  return other
}

