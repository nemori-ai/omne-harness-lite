import type { Message } from '@omne-harness-lite/messages'
import { parseTenantId, tenantIdEquals, isOk } from '@omne-harness-lite/identity-values'
import { StorageDefect } from '@omne-harness-lite/storage'
import { copyJsonValue, type ContentBlock } from '@omne-harness-lite/content-blocks'
import { checkLogPayload, checkSourceToken, type LogEntry } from '@omne-harness-lite/session-log'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { SourceToken } from '@omne-harness-lite/session-log'
import type { LocalSessionIngress } from '@omne-harness-lite/session-runtime-local'

export interface SessionTextMessage {
  readonly position: JsonNumber
  readonly run: string | null
  readonly id: string
  readonly type: Message['type']
  readonly createdAt: string
  readonly blocks: readonly {
    readonly id: string
    readonly kind: 'text' | 'thinking'
    readonly text: string
  }[]
}
export interface SessionTextReaderOptions {
  readonly tenant: SessionScope['tenant']
  readonly ingress: LocalSessionIngress
}
export type SessionTextReading =
  | {
      readonly kind: 'messages'
      readonly source: SourceToken
      readonly messages: readonly SessionTextMessage[]
    }
  | { readonly failure: 'invalidInput' | 'denied' | 'notFound' | 'unavailable' }
/** Trusted host facade. It never exposes raw messages or a live authority to the client. */
export function createSessionTextReader(options: SessionTextReaderOptions): {
  readonly read: (scope: SessionScope) => Promise<SessionTextReading>
} {
  const checked = parseTenantId(options.tenant)
  if (!isOk(checked)) throw new TypeError('invalid text reader tenant')
  const tenant = Object.freeze(checked.ok)
  const { ingress } = options
  return Object.freeze({
    read: async scope => {
      const requested = checkedScope(scope)
      if (!requested) return { failure: 'invalidInput' }
      if (!tenantIdEquals(requested.tenant, tenant)) return { failure: 'denied' }
      const prefix = await ingress.journal.readPrefix(ingress.access, requested.session)
      if ('failure' in prefix) return prefix
      if (
        prefix.source.session !== requested.session ||
        !tenantIdEquals(prefix.source.tenant, tenant)
      )
        throw new StorageDefect('authorized journal returned foreign source')
      const messages = prefix.entries.flatMap(entry => humanMessage(entry))
      return Object.freeze({
        kind: 'messages',
        source: prefix.source,
        messages: Object.freeze(messages),
      })
    },
  })
}
function checkedScope(scope: SessionScope): SessionScope | undefined {
  const copied = copyJsonValue(scope)
  if (
    'failed' in copied ||
    copied.ok === null ||
    typeof copied.ok !== 'object' ||
    Array.isArray(copied.ok)
  )
    return undefined
  if (
    Object.keys(copied.ok).length !== 2 ||
    !Object.hasOwn(copied.ok, 'tenant') ||
    !Object.hasOwn(copied.ok, 'session')
  )
    return undefined
  const token = checkSourceToken({ ...copied.ok, journalGeneration: 'scope-check', tail: 0 })
  if ('failure' in token) return undefined
  return Object.freeze({ tenant: token.ok.tenant, session: token.ok.session })
}
function humanMessage(entry: LogEntry): readonly SessionTextMessage[] {
  const checked = checkLogPayload(entry.payload)
  if ('failure' in checked) throw new StorageDefect('invalid owned message payload')
  if (checked.kind !== 'message') return []
  const message = checked.payload.value
  const blocks = humanText(message.blocks)
  if (blocks.length === 0) return []
  return [
    Object.freeze({
      position: entry.position,
      run: entry.run ?? null,
      id: message.id,
      type: message.type,
      createdAt: message.createdAt,
      blocks,
    }),
  ]
}
function humanText(roots: readonly ContentBlock[]): SessionTextMessage['blocks'] {
  const result: SessionTextMessage['blocks'][number][] = []
  const stack = [...roots].reverse()
  while (stack.length) {
    const block = stack.pop()!
    if (!block.visibility.toHuman) continue
    if (block.kind === 'text' || block.kind === 'thinking')
      result.push(Object.freeze({ id: block.id, kind: block.kind, text: block.text }))
    if (block.kind === 'tool_result')
      for (let at = block.blocks.length - 1; at >= 0; at--) stack.push(block.blocks[at]!)
  }
  return Object.freeze(result)
}
