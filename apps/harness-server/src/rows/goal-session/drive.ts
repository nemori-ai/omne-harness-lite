import type { SessionCalls } from '@omne-harness/goal-session'
import type { SessionConditionsInput } from '@omne-harness/session-adapters/cordis'

type DefaultModes = SessionConditionsInput['defaultModes']
type Drives = Parameters<SessionCalls['drives']>[0]
type Opened = NonNullable<
  Extract<Awaited<ReturnType<SessionCalls['opened']>>, { value: unknown }>['value']
>
export type RoundEntry = Readonly<{ id: string; kind: string; payload: unknown }>

const UNAVAILABLE = { kind: 'unavailable' } as const
const RUN_STARTED = 'run.started'
/** What a round is opened by, and what tells where a round began: read newest first. */
export const ROUND_KINDS = [RUN_STARTED, 'message.user', 'message.system_reminder']

/** Whether a session drives itself, in the order its conditions read it: the last change of the mode,
 * what its creation named, the default of its definition. `defaults` undefined: no table of definitions is here. */
export async function drivesItself(
  { work, tenant, session }: Drives,
  defaults: DefaultModes | undefined,
): ReturnType<SessionCalls['drives']> {
  const changed = (work.changes ?? []).findLast(change => change.kind === 'collaboration-mode')
  if (changed?.kind === 'collaboration-mode')
    return { kind: 'read', value: changed.value === 'auto-drive' }
  const { modes } = work.creation
  if (modes.kind === 'explicit')
    return { kind: 'read', value: modes.value.collaboration === 'auto-drive' }
  if (defaults === undefined) return UNAVAILABLE
  const { definition } = work
  const resolved = await defaults({ tenant, session, definition, source: modes.source })
  if ('failure' in resolved) return UNAVAILABLE
  return { kind: 'read', value: resolved.ok.modes.collaboration === 'auto-drive' }
}

type Block = Readonly<{ kind?: unknown; text?: unknown; visibility?: { toModel?: unknown } }>
function wordsOf(payload: unknown): string {
  const message = (payload as { message?: { blocks?: readonly Block[] } } | null)?.message
  return (message?.blocks ?? [])
    .filter(block => block.kind === 'text' && block.visibility?.toModel !== false)
    .flatMap(block => (typeof block.text === 'string' ? [block.text] : []))
    .join('\n')
}

type Said = Block & Readonly<{ origin?: unknown; visibility?: { toHuman?: unknown } }>
function ownWordsOf(payload: unknown): string {
  const message = (payload as { message?: { blocks?: readonly Said[] } } | null)?.message
  return (message?.blocks ?? [])
    .filter(block => block.kind === 'text' && block.origin === undefined)
    .filter(block => block.visibility?.toHuman !== false)
    .flatMap(block => (typeof block.text === 'string' ? [block.text] : []))
    .join('\n')
    .trim()
}

/** Where the latest system reminder that begins with this line stands among these entries, newest first. */
export const reminderIn =
  (line: string) =>
  (entries: readonly RoundEntry[]): string | 'more' => {
    const begins = (text: string) => text === line || text.startsWith(`${line}\n`)
    const found = entries.find(
      entry => entry.kind === 'message.system_reminder' && begins(wordsOf(entry.payload)),
    )
    return found?.id ?? 'more'
  }

export function askedIn(
  entries: readonly RoundEntry[],
): Readonly<{ at: string; text: string }> | 'more' {
  for (const entry of entries) {
    const text = entry.kind === 'message.user' ? ownWordsOf(entry.payload) : ''
    if (text !== '') return { at: entry.id, text }
  }
  return 'more'
}

/** The input that opened the latest round among these entries, newest first: the nearest message before
 * the round began. `more`: these entries do not reach back that far. */
export function openedIn(entries: readonly RoundEntry[]): Opened | 'more' {
  const began = entries.findIndex(entry => entry.kind === RUN_STARTED)
  const input =
    began === -1 ? undefined : entries.slice(began + 1).find(e => e.kind !== RUN_STARTED)
  return input === undefined ? 'more' : { since: input.id, text: wordsOf(input.payload) }
}
