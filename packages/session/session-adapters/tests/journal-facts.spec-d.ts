// The type-level guard of F5 (R2-D292 12.3): a value that carries a message, a produced result, a
// tool request, a fixed model request or a journal entry anywhere inside it is `never` under
// `NoContent`, so a fact body built from one does not type-check. The `@ts-expect-error` lines are
// the negative control: remove the guard and this file fails the type test.
import { expectTypeOf, it } from 'vitest'
import type { AgentJournalEntry, ProducedResult } from '@omne-harness/agent-contract'
import type { Message } from '@omne-harness/message'
import type { FixedModelRequest } from '@omne-harness/model-contract'
import type { ToolInvokeRequest } from '@omne-harness/tool-contract'
import type { FactBody, NoContent, Ref } from '../src/journal/index.ts'

type Evidence = { owner: string; record: string; revision: string; digest: string }

it('admits identities, evidence, small values and references', () => {
  expectTypeOf<NoContent<{ step: string; evidence: Evidence }>>().toEqualTypeOf<{
    step: string
    evidence: Evidence
  }>()
  expectTypeOf<NoContent<{ content: Ref<Message> }>>().toEqualTypeOf<{ content: Ref<Message> }>()
  expectTypeOf<NoContent<{ custody: Ref<AgentJournalEntry> }>>().toEqualTypeOf<{
    custody: Ref<AgentJournalEntry>
  }>()
  expectTypeOf<NoContent<FactBody>>().toEqualTypeOf<FactBody>()
})

it('refuses the content types of other owners at any depth', () => {
  expectTypeOf<NoContent<{ message: Message }>>().toBeNever()
  expectTypeOf<NoContent<{ result: ProducedResult }>>().toBeNever()
  expectTypeOf<NoContent<{ request: ToolInvokeRequest }>>().toBeNever()
  expectTypeOf<NoContent<{ request: FixedModelRequest }>>().toBeNever()
  expectTypeOf<NoContent<{ entry: AgentJournalEntry }>>().toBeNever()
  expectTypeOf<NoContent<{ nested: { deep: readonly Message[] } }>>().toBeNever()
})

declare function append<F>(fact: NoContent<F>): void
declare const message: Message
declare const result: ProducedResult
declare const request: ToolInvokeRequest
declare const fixed: FixedModelRequest

it('negative control: a fact built with content does not type-check', () => {
  append({ kind: 'input.accepted', message: { digest: 'd', size: 1 } as Ref<Message> })
  // @ts-expect-error a message is content, not a fact member
  append({ kind: 'input.accepted', message })
  // @ts-expect-error a produced result is the producer's, a fact names its call and version
  append({ kind: 'result.received', result })
  // @ts-expect-error a tool request lives in a custody block
  append({ kind: 'call.intended', request })
  // @ts-expect-error a fixed model request lives with the Model until accepted
  append({ kind: 'request.adopted', record: fixed })
})
