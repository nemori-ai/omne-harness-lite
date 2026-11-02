// The doubles take the caller's access, never a bare tenant, and keep the coordinator's contract.
import { expectTypeOf, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Access } from '@omne-harness/tool-contract'
import type { ToolBindingScope } from '@omne-harness/tool-contract/provider'
import type { ToolGenerations } from '@omne-harness/tool-cordis-contract/cordis'
import type {
  AdoptionPointInput,
  ScriptedAdoptionPoint,
  ScriptedToolGenerations,
} from '@omne-harness/tool-cordis-contract/testing'

type Point = ScriptedAdoptionPoint<string, unknown, unknown>

it('the adoption point takes the access as its first argument and no tenant in its input', () => {
  expectTypeOf<Parameters<Point['plan']>[0]>().toEqualTypeOf<Access<string>>()
  expectTypeOf<keyof AdoptionPointInput>().toEqualTypeOf<'recorded' | 'capabilities'>()
  const point = {} as Point
  const access = {} as Access<string>
  // @ts-expect-error a bare tenant is not an access
  void point.plan({ tenant: access.tenant }, { recorded: [], capabilities: [] })
  // @ts-expect-error the input carries no tenant
  void point.plan(access, { recorded: [], capabilities: [], tenant: access.tenant })
})

it('the scripted coordinator is the coordinator contract and ensureLoaded takes the access', () => {
  type Scripted = ScriptedToolGenerations<string, unknown, ContentBlock>
  expectTypeOf<Scripted['generations']>().toEqualTypeOf<
    ToolGenerations<string, unknown, ContentBlock>
  >()
  type Input = Parameters<Scripted['generations']['ensureLoaded']>[0]
  expectTypeOf<keyof Input>().toEqualTypeOf<'authority' | 'access'>()
  expectTypeOf<Input['access']>().toEqualTypeOf<ToolBindingScope<string>>()
})
