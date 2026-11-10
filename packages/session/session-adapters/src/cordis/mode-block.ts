import type { NeedBinding, SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract'
import { sessionModesBlock } from '@omne-harness/session-contract'
import {
  sessionInquirySchema,
  sessionModesPublicationSchema,
  type SessionInquiryView,
  type SessionModesPublication,
} from '../mode-publication-schema.ts'

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'session.modes': SessionModesPublication
  }
}

export const sessionModesProducer = Object.freeze({
  producer: '@omne-harness/session-adapters/session.modes',
})

export const sessionModesDescriptor = Object.freeze({
  key: 'session.modes',
  schema: sessionModesPublicationSchema,
  consumers: sessionModesBlock.consumers,
  required: true,
  disclosure: 'eligibility-checked',
  carriesPrevious: false,
  volatility: sessionModesBlock.volatility,
  kind: sessionModesBlock.kind,
  recovery: sessionModesBlock.recovery,
} satisfies SuppliedBlockDescriptor<'session.modes', SessionModesPublication>)

export const sessionInquiryBinding = Object.freeze({
  key: 'session.modes',
  need: Object.freeze({
    name: 'session.permission-inquiry',
    shape: sessionInquirySchema,
    consumer: 'coordinator',
    purpose: 'Inquiry handling with the exact published Session permission basis',
    necessity: 'required',
  }),
  integrator: 'coordinator',
  translate: (value: unknown): SessionInquiryView => {
    const publication = sessionModesPublicationSchema.parse(value)
    return Object.freeze({ inquiry: publication.inquiry, basis: publication.basis })
  },
} satisfies NeedBinding<'session.modes', SessionInquiryView>)
