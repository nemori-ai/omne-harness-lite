import { writeJsonText } from '@omne-harness/json-text'
import { tenantCodec } from '@omne-harness/legal-identity'
import { judgeMessage } from '@omne-harness/message'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionAccess, SessionHistory } from '@omne-harness/session-contract'
import type { ModelReminderFailure } from './model-reminders.ts'
import type { WorkspaceGuidanceScope } from '../workspace-guidance.ts'
import { emptyGuidanceIndex, extendGuidanceIndex } from './guidance-window.ts'

export type GuidanceOrigins = Readonly<{
  blocks: ReadonlySet<string>
  scopes: readonly WorkspaceGuidanceScope[]
}>

export type OriginalHistory<P> = Pick<SessionHistory<P>, 'begin' | 'next'>

/** Only the exceptional recovery path reads original author records. Raw user and tool text is irrelevant here. */
export async function readGuidanceOriginals<P>(
  history: OriginalHistory<P>,
  access: SessionAccess<P>,
  partition: string,
  before?: string,
): Promise<Outcome<GuidanceOrigins, ModelReminderFailure>> {
  const unavailable = (diagnostic: string) => fail({ kind: 'unavailable' as const, diagnostic })
  let page = await history.begin({
    ...access,
    inherited: true,
    kinds: ['session.created', 'message.system_reminder'],
    from: null,
    direction: 'forward',
    pageBytes: 1_048_576,
  })
  const blocks = new Set<string>()
  let creation = false
  const scopes = new Map<string, WorkspaceGuidanceScope>()
  const tenant = tenantCodec.encode(access.tenant)
  const seen = new Set<string>()
  for (;;) {
    if ('failure' in page)
      return page.failure.kind === 'denied'
        ? fail({ kind: 'denied' })
        : unavailable('the original guidance records are unreadable')
    for (const entry of page.ok.entries) {
      if (before !== undefined && BigInt(entry.id) >= BigInt(before)) break
      const value = JSON.parse(writeJsonText(entry.payload))
      if (!value || typeof value !== 'object')
        return unavailable('invalid original guidance log entry')
      if (entry.kind === 'session.created') {
        if (value.creation?.fork) {
          const prefix = await history.begin({
            ...access,
            kinds: ['message.compaction'],
            inherited: true,
            from: null,
            direction: 'forward',
            pageBytes: 1,
          })
          if ('failure' in prefix || prefix.ok.from !== undefined)
            return unavailable(
              'the session cannot verify the original inputs of an inherited summary',
            )
        }
        if (!value.creation || (!value.creation.fork && BigInt(entry.id) !== 1n))
          return unavailable('the original scope of this session cannot be verified')
        creation = true
      } else if (entry.kind === 'message.system_reminder') {
        const judged = judgeMessage(value.message)
        if (!('ok' in judged) || judged.ok.role !== 'system_reminder')
          return unavailable('an original reminder is unreadable')
        const ref =
          value.source?.owner === 'runtime-context' && typeof value.source.record === 'string'
            ? /^(.*)\/view\/[^/]+\/at\/[0-9]+$/u.exec(value.source.record)?.[1]
            : undefined
        const author = ref && tenant.ok ? JSON.stringify([tenant.value, ref]) : partition
        const index = extendGuidanceIndex(emptyGuidanceIndex(), [judged.ok], author)
        for (const scope of index.scopes) scopes.set(JSON.stringify(scope), scope)
        for (const block of judged.ok.blocks) {
          if (
            block.kind !== 'text' ||
            !block.visibility.toModel ||
            !block.id.startsWith('blk_guidance_')
          )
            continue
          if (index.sourceScopes.has(block.id) || index.manifest === block.id) {
            blocks.add(block.id)
            continue
          }
          return unavailable('the original guidance author cannot be verified')
        }
      }
    }
    if (
      page.ok.exhausted ||
      (before !== undefined && page.ok.entries.some(row => BigInt(row.id) >= BigInt(before)))
    )
      break
    if (page.ok.next === null || seen.has(page.ok.next))
      return unavailable('the original guidance history is incomplete')
    seen.add(page.ok.next)
    page = await history.next({ ...access, cursor: page.ok.next })
  }
  return creation
    ? succeed({ scopes: [...scopes.values()], blocks })
    : unavailable('the session origin for the original guidance is unavailable')
}
