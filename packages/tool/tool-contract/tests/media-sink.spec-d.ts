import type { ContentReference, MediaFacts } from '@omne-harness/content-block'
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { ConsumerRef } from '@omne-harness/tool-contract'
import type {
  ToolMediaProduct,
  ToolMediaSink,
  ToolMediaStore,
  ToolPrimitiveFailure,
} from '@omne-harness/tool-contract/provider'
import { expectTypeOf, it } from 'vitest'

it('lets an author hand over a media type and bytes, and nothing that names a holder', () => {
  expectTypeOf<Parameters<ToolMediaSink['put']>>().toEqualTypeOf<
    [Readonly<{ mediaType: string; bytes: Uint8Array }>]
  >()
  expectTypeOf<ReturnType<ToolMediaSink['put']>>().toEqualTypeOf<
    Promise<Outcome<ToolMediaProduct, ToolPrimitiveFailure>>
  >()
  expectTypeOf<ToolMediaProduct>().toEqualTypeOf<
    Readonly<{ ref: ContentReference; facts: MediaFacts }>
  >()
})

it('gives the provider the identity and the holder the host filled in', () => {
  type Principal = { readonly tag: 'principal' }
  expectTypeOf<Parameters<ToolMediaStore<Principal>['put']>[0]>().toEqualTypeOf<
    Access<Principal> & Readonly<{ holder: ConsumerRef; mediaType: string; bytes: Uint8Array }>
  >()
  expectTypeOf<ReturnType<ToolMediaStore<Principal>['put']>>().toEqualTypeOf<
    Promise<Outcome<ToolMediaProduct, ToolPrimitiveFailure>>
  >()
})
