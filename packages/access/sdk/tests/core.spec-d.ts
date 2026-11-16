import { expectTypeOf, test } from 'vitest'
import { createClient, type Transport } from '@omne-harness/sdk/core'
import { notesProtocol } from './support/notes-protocol.ts'

declare const transport: Transport
const notes = createClient(notesProtocol, transport)

test('a body of the wrong shape does not compile', () => {
  // @ts-expect-error noteId is text
  void notes['read-note']({ noteId: 7 })
  // @ts-expect-error title is missing
  void notes['save-note']({ noteId: 'n-1' })
  // @ts-expect-error not an operation of the contract
  void notes['delete-note']({ noteId: 'n-1' })
})

test('the answer is the contract outcomes and the two local ones', async () => {
  const answer = await notes['read-note']({ noteId: 'n-1' })
  expectTypeOf(answer.outcome).toEqualTypeOf<
    | 'succeeded'
    | 'not-found'
    | 'denied'
    | 'protocol-rejected'
    | 'basis-unavailable'
    | 'unavailable'
    | 'uncertain'
  >()
  if (answer.outcome === 'succeeded')
    expectTypeOf(answer.body).toEqualTypeOf<{ readonly noteId: string; readonly title: string }>()
})

test('frames and end reasons come from the observation contract', () => {
  const frames = notes.observe['watch-note'](
    { noteId: 'n-1' },
    { signal: new AbortController().signal },
  )
  type Frame = Awaited<ReturnType<typeof frames.next>>
  expectTypeOf<Extract<Frame, { done?: false }>['value']>().toEqualTypeOf<{
    readonly noteId: string
    readonly title: string
  }>()
  type End = Extract<Extract<Frame, { done: true }>['value'], { kind: 'ended' }>['reason']
  expectTypeOf<End>().toEqualTypeOf<'note-deleted' | 'denied' | 'unavailable'>()
})
