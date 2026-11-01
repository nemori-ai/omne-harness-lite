// E2's read of the reply admission facts (Agent SPEC "回复准入的已核实前缀"): the one rule that
// chooses the lower bound, and the read of one fixed range `(from, through]` that checks every
// page before it moves the verified prefix on. The coordinator owns the in-process prefix and
// the page loop; this module owns no state. Sequences are compared as exact integers.
import {
  decodeReplyAdmissionSequence,
  type DurableEvidence,
  type Failure,
  type ReplyAdmissionFrom,
  type ReplyAdmissionGapReason,
  type ReplyAdmissionPage,
  type ReplyAdmissionPageCursor,
  type ReplyAdmissionPrefix,
  type ReplyAdmissionRead,
  type Reply,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonical } from '../canonical.ts'

/** The owner of a failure of the read: the Journal port that answered the page. */
const READ_OWNER = 'agentJournal'

/** The most facts E2 takes in one page; the provider may answer fewer. */
export const REPLY_ADMISSION_PAGE_LIMIT = 100

function exact(sequence: string): bigint | undefined {
  const decoded = decodeReplyAdmissionSequence(sequence)
  return 'failure' in decoded ? undefined : BigInt(decoded.ok)
}

/**
 * The lower bound of the next read (D5 第 5 节 step 2): the larger of the in-process prefix and the
 * verified prefix of the checkpoint, the one that exists, or origin when neither does.
 */
export function lowerBound(
  inProcess: ReplyAdmissionPrefix | null,
  saved: ReplyAdmissionRead,
): ReplyAdmissionFrom {
  const checkpoint = saved.kind === 'verified' ? saved.prefix : null
  if (inProcess === null && checkpoint === null) return { kind: 'origin' }
  if (inProcess === null) return { kind: 'prefix', prefix: checkpoint! }
  if (checkpoint === null) return { kind: 'prefix', prefix: inProcess }
  const own = exact(inProcess.sequence) ?? -1n
  const kept = exact(checkpoint.sequence) ?? -1n
  return { kind: 'prefix', prefix: own >= kept ? inProcess : checkpoint }
}

/**
 * The read position an ordinary commit carries (D5 第 5 节 step 6): the in-process prefix when it
 * is further on than the saved one, otherwise the saved one. The retry of the operation that was
 * last sent carries what that operation carried: the same operation keeps the same semantic input
 * (SPEC:261, 102), and a newer prefix only goes into a new operation.
 */
export function sentPosition(
  last: Readonly<{ operation: string; read: ReplyAdmissionRead }> | null,
  operation: string,
  inProcess: ReplyAdmissionPrefix | null,
  saved: ReplyAdmissionRead,
): ReplyAdmissionRead {
  if (last !== null && last.operation === operation) return last.read
  if (inProcess === null) return saved
  if (
    saved.kind === 'verified' &&
    (exact(saved.prefix.sequence) ?? -1n) >= (exact(inProcess.sequence) ?? -1n)
  )
    return saved
  return { kind: 'verified', prefix: inProcess }
}

/** The end of one range read: the verified target, or the gap the provider answered. */
export type RangeRead =
  | Readonly<{ kind: 'complete'; prefix: ReplyAdmissionPrefix; pages: number; facts: number }>
  | Readonly<{ kind: 'gap'; reason: ReplyAdmissionGapReason; pages: number; facts: number }>

export type RangeRequest = Readonly<{
  from: ReplyAdmissionFrom
  through: DurableEvidence
  target: ReplyAdmissionPrefix
  limit: number
}>

function refused(reason: string): Outcome<never, Failure> {
  return fail({
    kind: 'unavailable',
    owner: READ_OWNER,
    diagnostic: `reply admission page: ${reason}`,
  })
}

/**
 * Reads `(from, through]` page by page (D5 第 5 节 steps 3 to 5) and checks each page: the range
 * is echoed, the page starts where the previous one ended (the first where `from` does), the
 * sequences are consecutive, `end` matches the items, `tail` is complete exactly at the target,
 * a more page carries a fact below the target and a cursor not seen before, and no page holds
 * more than `limit` facts. `verified` receives the end of each page that passed; a failure or a
 * gap never moves it. Each page is one await, which yields between pages.
 */
export async function readRange(
  read: (
    input: Readonly<{
      from: ReplyAdmissionFrom
      through: DurableEvidence
      after: ReplyAdmissionPageCursor | null
      limit: number
    }>,
  ) => Reply<ReplyAdmissionPage>,
  request: RangeRequest,
  verified: (prefix: ReplyAdmissionPrefix) => void,
): Promise<Outcome<RangeRead, Failure>> {
  const target = exact(request.target.sequence)
  if (target === undefined) return refused('the target sequence is not a canonical decimal')
  let start: ReplyAdmissionPrefix | null =
    request.from.kind === 'prefix' ? request.from.prefix : null
  let after: ReplyAdmissionPageCursor | null = null
  const cursors = new Set<string>()
  let pages = 0
  let facts = 0
  for (;;) {
    const answered = await read({
      from: request.from,
      through: request.through,
      after,
      limit: request.limit,
    })
    if ('failure' in answered) return answered
    const page = answered.ok
    pages += 1
    if (page.kind === 'gap') return succeed({ kind: 'gap', reason: page.reason, pages, facts })
    if (canonical(page.through) !== canonical(request.through))
      return refused('the range is not the one requested')
    const first = exact(page.start.sequence)
    const end = exact(page.end.sequence)
    if (first === undefined || end === undefined)
      return refused('a bound is not a canonical decimal')
    if (start === null ? first !== 0n : canonical(page.start) !== canonical(start))
      return refused('the page does not start where the read stands')
    if (page.items.length > request.limit) return refused('more facts than the limit')
    for (const [offset, item] of page.items.entries())
      if (exact(item.sequence) !== first + BigInt(offset + 1))
        return refused('the sequences are not consecutive')
    if (end !== first + BigInt(page.items.length))
      return refused('the end does not follow the items')
    const reached = canonical(page.end) === canonical(request.target)
    if (page.tail.kind === 'complete') {
      if (!reached) return refused('complete before the target')
    } else {
      if (page.items.length === 0) return refused('a more page without a fact')
      if (end >= target) return refused('a more page at or past the target')
      if (cursors.has(page.tail.next)) return refused('the cursor does not move on')
      cursors.add(page.tail.next)
    }
    facts += page.items.length
    verified(page.end)
    start = page.end
    if (page.tail.kind === 'complete')
      return succeed({ kind: 'complete', prefix: page.end, pages, facts })
    after = page.tail.next
  }
}
