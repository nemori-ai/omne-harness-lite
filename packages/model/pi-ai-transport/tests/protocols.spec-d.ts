import type { ModelKind } from '@omne-harness/model-contract'
import { PROTOCOLS, type ProviderEndpoint } from '@omne-harness/pi-ai-transport'
import { expectTypeOf, it } from 'vitest'

it('the table of interfaces has one row for every interface, and no other row', () => {
  expectTypeOf<keyof typeof PROTOCOLS>().toEqualTypeOf<ProviderEndpoint>()
})

it('every interface belongs to one model kind and has one framing', () => {
  expectTypeOf<(typeof PROTOCOLS)[ProviderEndpoint]['kind']>().toExtend<ModelKind>()
  expectTypeOf<(typeof PROTOCOLS)['decisions']>().toEqualTypeOf<{
    readonly kind: 'decisions'
    readonly framing: 'whole'
  }>()
  expectTypeOf<(typeof PROTOCOLS)['chat-completions']['kind']>().toEqualTypeOf<'llm'>()
})
