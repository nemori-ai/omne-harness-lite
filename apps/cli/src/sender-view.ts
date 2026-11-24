import type { TenantId } from '@omne-harness/public-contract'
import { lookupOf, recognize, type SenderView, viewOf } from '@omne-harness/slash-command-contract'
import {
  slashCommandProtocol,
  type SlashCommandCatalog,
} from '@omne-harness/slash-command-protocol'
import type { Link } from './link.ts'

const NOTHING_NAMED: SenderView = { command: null, references: [] }

/** What the words name against the list of the session now; null when the list cannot be read. */
export async function seenOf(
  link: Link,
  target: Readonly<{ tenant: TenantId; session: string }>,
  text: string,
  messageId: string,
): Promise<SenderView | null> {
  if (!text.includes('/')) return NOTHING_NAMED
  const read = await link.call(slashCommandProtocol, 'read-catalog', target, messageId)
  if (read?.kind !== 'response' || read.outcome !== 'succeeded') return null
  return viewOf(recognize(text, lookupOf(read.body as SlashCommandCatalog)))
}
