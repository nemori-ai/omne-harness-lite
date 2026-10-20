import { expectTypeOf, it } from 'vitest'
import type { ContentBlock, TextContentBlock } from '@omne-harness/content-block'
import type { ToolDependencies, ToolInvokeAuthority } from '@omne-harness/tool'
import {
  createTestToolDependencies,
  createTestInvocationSource,
  type TestToolDependenciesInput,
  type TestToolDependencies,
} from '@omne-harness/tool/testing'
import type { MemoryEnvironment } from '@omne-harness/tool-contract/testing'

it('requires caller-owned authorization, trusted construction ports and unresolved ports, with fixed block and environment types', () => {
  type P = { subject: string }
  expectTypeOf(createTestToolDependencies<P>).parameters.toEqualTypeOf<
    [TestToolDependenciesInput<P>]
  >()
  expectTypeOf(createTestToolDependencies<P>).returns.toEqualTypeOf<TestToolDependencies<P>>()
  expectTypeOf<TestToolDependencies<P>['dependencies']>().toEqualTypeOf<
    ToolDependencies<P, ContentBlock, MemoryEnvironment>
  >()
  expectTypeOf<TestToolDependencies<P>['dependencies']>().not.toExtend<
    ToolDependencies<P, TextContentBlock, MemoryEnvironment>
  >()
  // A type-only check: these values are never evaluated.
  const required = (input: TestToolDependenciesInput<P>): void => {
    const { guards, instances, catalog, children, operationIdentities, sourceIssuer, ...rest } =
      input
    // @ts-expect-error The trusted construction ports cannot be omitted.
    createTestToolDependencies({ ...rest, guards })
    // @ts-expect-error Authorization cannot be omitted.
    createTestToolDependencies({
      ...rest,
      instances,
      catalog,
      children,
      operationIdentities,
      sourceIssuer,
    })
    // @ts-expect-error Host, catalog and child ports cannot be omitted.
    createTestToolDependencies({
      ...rest,
      guards,
      operationIdentities,
      sourceIssuer,
    })
  }
  expectTypeOf(required).toBeFunction()
  // @ts-expect-error Testing types are available only through ./testing.
  type RootAssembly = import('@omne-harness/tool').TestToolDependencies<P>
  expectTypeOf<RootAssembly>().toBeAny()
})

it('test sources require the credential owner to supply semantic snapshots', () => {
  type P = { subject: string }
  const construct = (authority: ToolInvokeAuthority<P>) => {
    // @ts-expect-error P has no generic authentication-preserving copy operation.
    createTestInvocationSource({ authority })
    return createTestInvocationSource({
      authority,
      snapshotPrincipal: principal => ({ ...principal }),
    })
  }
  expectTypeOf(construct).toBeFunction()
})
