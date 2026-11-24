import type { Message } from '@omne-harness/message'
import type { InputId, SessionAccess, SessionOperationId } from './identity.ts'
import type { InputSourceName } from './input-sources.ts'

/** What the sender was shown of its own words: the command at the head, if any, and the names it referenced. */
export type SenderView = Readonly<{ command: string | null; references: readonly string[] }>

/** One utterance of a member to resolve: its words as brought, what the sender saw of them, and whose they are. */
export type Utterance<P> = Readonly<{
  original: Message
  seen: SenderView | null
  source: InputSourceName
  request: Readonly<{ input: InputId; operation: SessionOperationId }>
  access: SessionAccess<P>
}>

/** An input carries on with its effective content; an operation is done by Session itself; a refusal is not queued. */
export type Resolution =
  | Readonly<{ kind: 'input'; effective: Message }>
  | Readonly<{ kind: 'operation'; name: string; operation: string; args: string }>
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type UtteranceResolver<P> = Readonly<{
  name: string
  resolve(utterance: Utterance<P>): Promise<Resolution>
}>

export type UtteranceResolverRegistry<P> = Readonly<{
  register(resolver: UtteranceResolver<P>): () => void
  current(): UtteranceResolver<P> | null
}>

export function createUtteranceResolverRegistry<P>(): UtteranceResolverRegistry<P> {
  let registered: UtteranceResolver<P> | null = null
  return Object.freeze({
    register(resolver: UtteranceResolver<P>) {
      if (typeof resolver?.resolve !== 'function') throw new TypeError('a resolver resolves')
      if (registered !== null)
        throw new Error(`a resolver is already registered: ${registered.name}`)
      registered = resolver
      return () => {
        if (registered === resolver) registered = null
      }
    },
    current: () => registered,
  })
}
