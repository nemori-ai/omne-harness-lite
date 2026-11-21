import type { DispatchRecord, MaterializedMedium } from '@omne-harness/model-contract'
import type { SessionDiagnosticGap, SessionModelCallDiagnostic } from '../view-types.ts'
import { blockKey, type BlockAnswer } from './blocks.ts'
import type { RequestBlockChoice, SourceAnswer } from './sources.ts'

type Read = SessionModelCallDiagnostic['reads'][number]
type Reference = MaterializedMedium['reference']
type Reads = Readonly<{ value: readonly Read[]; gaps: readonly SessionDiagnosticGap[] }>
export type ReadAnswers = Readonly<{
  attempts: SourceAnswer<unknown> | null
  dispatches: SourceAnswer<readonly DispatchRecord[]> | null
  choices: SourceAnswer<readonly RequestBlockChoice[]> | null
}>

const sameReference = (left: Reference, right: Reference): boolean =>
  left.storage === right.storage && left.key === right.key && left.digest === right.digest

/** The original blocks of a medium: only they need their reference from the history. */
export const originalMedia = (choices: readonly RequestBlockChoice[]): RequestBlockChoice[] =>
  choices.filter(choice => choice.choice === 'original' && choice.mediaType !== null)

// The media the last completed dispatch, or else the last dispatch, encoded; null when unknown.
function encodedMedia(answers: ReadAnswers): readonly MaterializedMedium[] | null {
  const { attempts, dispatches } = answers
  if (attempts?.kind === 'gap' || dispatches?.kind === 'gap') return null
  if (dispatches === null) return []
  return lastSent(dispatches.value)?.materialization?.receipt.media ?? []
}

const lastSent = (records: readonly DispatchRecord[]): DispatchRecord | undefined =>
  records.findLast(record => record.terminal?.kind === 'completed') ?? records.at(-1)

function readOf(reference: Reference, media: readonly MaterializedMedium[]): Read['read'] {
  const sent = media.find(medium => sameReference(medium.reference, reference))
  if (sent === undefined) return 'original'
  const same = sent.mediaType === reference.mediaType && sent.bytes === reference.bytes
  return same ? 'original' : 'fitted'
}

const NONE: Reads = { value: [], gaps: [] }
type Missing = Readonly<{ reason: SessionDiagnosticGap['reason'] }>

// The reference of each original medium in the history; a block found without one is no medium.
function referencesOf(
  originals: readonly RequestBlockChoice[],
  blocks: BlockAnswer | null,
): Map<string, Reference> | Missing {
  if (blocks === null || blocks.kind === 'gap')
    return { reason: blocks === null ? 'not-found' : blocks.reason }
  const references = new Map<string, Reference>()
  for (const choice of originals) {
    const key = blockKey(choice.message, choice.block)
    const found = blocks.value.get(key)
    if (found === undefined) return { reason: 'not-found' }
    if (found !== null) references.set(key, found)
  }
  return references
}

export function readsOf(
  reference: string,
  answers: ReadAnswers,
  blocks: BlockAnswer | null,
): Reads {
  const { choices } = answers
  if (choices === null) return NONE
  const gapped = (source: 'agent' | 'session', reason: SessionDiagnosticGap['reason']): Reads => ({
    value: [],
    gaps: [{ source, subject: reference, reason }],
  })
  if (choices.kind === 'gap') return gapped('agent', choices.reason)
  const originals = originalMedia(choices.value)
  const references =
    originals.length === 0 ? new Map<string, Reference>() : referencesOf(originals, blocks)
  if ('reason' in references) return gapped('session', references.reason)
  const media = encodedMedia(answers)
  if (media === null && references.size > 0) return NONE
  const value = choices.value.flatMap(each => readsOfChoice(each, references, media ?? []))
  return { value, gaps: [] }
}

function readsOfChoice(
  { message, block, choice }: RequestBlockChoice,
  references: ReadonlyMap<string, Reference>,
  media: readonly MaterializedMedium[],
): Read[] {
  if (choice !== 'original') return [{ message, block, read: choice }]
  const found = references.get(blockKey(message, block))
  return found === undefined ? [] : [{ message, block, read: readOf(found, media) }]
}
