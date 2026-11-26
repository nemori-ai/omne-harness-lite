import type {
  AwayPage,
  ChangeAnswer,
  Item,
  LookAnswer,
  PlaceAnswer,
  ReadAnswer,
  RequestInvalid,
} from '@omne-harness/canvas-contract'
import { canvasOf, itemOf } from './projection.ts'

/** These carry no body: a refusal to one tenant reads the same as a refusal to any other. */
export const DENIED = Object.freeze({ outcome: 'denied' as const })
export const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
export const UNKNOWN = Object.freeze({ outcome: 'unknown' as const })
const NO_CHANGE = Object.freeze({ outcome: 'no-change' as const, body: Object.freeze({}) })

/** What the canvas answers, or what the handler answers in its place when the canvas threw. */
type Read<A> = A | typeof UNAVAILABLE
type Write<A> = A | typeof UNKNOWN

const notFitting = (answer: RequestInvalid) =>
  ({ outcome: 'invalid', body: { reason: answer.where, path: [...answer.path] } }) as const

export function readOf<T, D>(answer: Read<ReadAnswer<T>>, done: (value: T) => D) {
  if ('outcome' in answer) return answer
  switch (answer.kind) {
    case 'done':
      return { outcome: 'succeeded' as const, body: done(answer.value) }
    case 'denied':
      return DENIED
    case 'basis-unavailable':
      return UNAVAILABLE
  }
}

export function lookOf(answer: Read<LookAnswer>) {
  if ('kind' in answer && answer.kind === 'invalid')
    return { outcome: 'invalid' as const, body: { reason: answer.where } }
  return readOf(answer, canvasOf)
}

export function awayOf(answer: Read<RequestInvalid | ReadAnswer<AwayPage>>) {
  if ('kind' in answer && answer.kind === 'invalid') return notFitting(answer)
  return readOf(answer, page => ({ items: page.items.map(itemOf), next: page.next }))
}

/** `basis-unavailable` drops the two who declared a kind twice: the client finds them in `kinds`. */
export function placeOf(answer: Write<PlaceAnswer>) {
  if ('outcome' in answer) return answer
  switch (answer.kind) {
    case 'done':
      return succeeded(answer.value.revision, answer.value.item)
    case 'no-change':
      return { outcome: 'no-change' as const, body: { item: itemOf(answer.item) } }
    case 'conflict':
      return { outcome: 'conflict' as const, body: { reason: answer.reason } }
    case 'invalid':
      return notFitting(answer)
    case 'denied':
      return DENIED
    case 'basis-unavailable':
      return UNAVAILABLE
    case 'unknown':
      return UNKNOWN
  }
}

const succeeded = (revision: number, item: Item) =>
  ({ outcome: 'succeeded', body: { revision, item: itemOf(item) } }) as const

export function changeOf(answer: Write<ChangeAnswer>) {
  if ('outcome' in answer) return answer
  switch (answer.kind) {
    case 'done':
      return { outcome: 'succeeded' as const, body: { revision: answer.value.revision } }
    case 'no-change':
      return NO_CHANGE
    case 'not-found':
      return { outcome: 'not-found' as const, body: { entry: answer.entry } }
    case 'conflict': {
      const { reason, entry } = answer
      return {
        outcome: 'conflict' as const,
        body: entry === undefined ? { reason } : { reason, entry },
      }
    }
    case 'invalid':
      return notFitting(answer)
    case 'denied':
      return DENIED
    case 'basis-unavailable':
      return UNAVAILABLE
    case 'unknown':
      return UNKNOWN
  }
}
