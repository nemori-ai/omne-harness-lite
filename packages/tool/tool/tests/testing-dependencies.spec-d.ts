import { expectTypeOf, it } from 'vitest'
import type { ContentBlock, TextContentBlock } from '@omne-harness/content-block'
import type { ToolDependencies } from '@omne-harness/tool'
import {
  createTestToolDependencies,
  type TestToolDependenciesInput,
  type TestToolDependencies,
} from '@omne-harness/tool/testing'
import type { MemoryEnvironment } from '@omne-harness/tool-contract/testing'

it('requires caller-owned identity, authorization and unresolved ports, with fixed block and environment types', () => {
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
    const { instance, guards, instances, catalog, children, ...rest } = input
    // @ts-expect-error Identity cannot be omitted.
    createTestToolDependencies({ ...rest, guards, instances, catalog, children })
    // @ts-expect-error Authorization cannot be omitted.
    createTestToolDependencies({ ...rest, instance, instances, catalog, children })
    // @ts-expect-error Host, catalog and child ports cannot be omitted.
    createTestToolDependencies({ ...rest, instance, guards })
  }
  expectTypeOf(required).toBeFunction()
  // @ts-expect-error Testing types are available only through ./testing.
  type RootAssembly = import('@omne-harness/tool').TestToolDependencies<P>
  expectTypeOf<RootAssembly>().toBeAny()
})
