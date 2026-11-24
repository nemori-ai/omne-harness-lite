import {
  admissionActionOf,
  admissionPassageOf,
  nestedActionOf,
  nestedPositionOf,
  type Action,
  type ActionBatch,
  type ActionId,
  type Authority,
  type CardRoundId,
  type Failure,
  type NestedActionVerdict,
  type Passage,
  type Waiting,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { freshChain, humanWaits } from './admission-chain.ts'
import {
  closed,
  defect,
  judged,
  presented,
  read,
  type NestedRequest,
  type NestedTurn,
  type NestedTurnInput,
} from './nested-steps.ts'
import { needOf } from './passages.ts'
import { slotOf } from './tools.ts'

export type { NestedRequest } from './nested-steps.ts'

const GONE = 'the tool call that made this action is no longer waiting'

const isNested = (passage: Passage): boolean => {
  const action = admissionActionOf(passage.id)
  return action !== null && nestedPositionOf(action) !== null
}
export const nestedChains = (passages: readonly Passage[]): readonly Passage[] =>
  passages.filter(isNested)

const concluded = (chain: Passage | null) =>
  chain !== null && (chain.progress.kind === 'resolved' || chain.progress.kind === 'applied')
    ? chain.progress.conclusion
    : null

/** AG-31: the one conclusion of a position, read from its chain; null while it has none. */
export function nestedVerdict(chain: Passage | null): NestedActionVerdict | null {
  const output = concluded(chain)?.output
  if (output === undefined) return null
  return output.kind === 'veto' ? { kind: 'denied', reason: output.reason } : { kind: 'allowed' }
}

/** AG-32: a nested action is judged only while its parent was sent and has no result yet. */
export function parentWaits(batch: ActionBatch, parent: ActionId): boolean {
  return (
    batch.actions.some(action => action.id === parent) &&
    slotOf(batch, parent)?.kind === 'dispatched'
  )
}

function actionOf(id: ActionId, effectiveArguments: string, chain: Passage | null): Action {
  const passage = admissionPassageOf(id)
  if ('failure' in passage) throw new TypeError('a nested action names no passage')
  const base = { id, original: { callId: id }, effectiveArguments, call: null }
  const last = chain?.progress.kind === 'asked' ? chain.progress.rounds.at(-1) : undefined
  return last?.progress.kind === 'presented'
    ? {
        ...base,
        judgment: {
          kind: 'waiting',
          passage: passage.ok,
          cards: last.progress.cards.map(card => card.card),
        },
      }
    : { ...base, judgment: { kind: 'pending', passage: passage.ok } }
}

export function nestedWaits(passages: readonly Passage[]): Extract<Waiting, { kind: 'human' }>[] {
  return nestedChains(passages).flatMap(chain => {
    const id = admissionActionOf(chain.id)
    if (id === null || concluded(chain) !== null) return []
    return humanWaits(passages, [actionOf(id, '', chain)])
  })
}

type Moved = Readonly<{ passages: readonly Passage[]; opened?: CardRoundId }>

async function advance<P>(
  input: NestedTurnInput<P>,
  passages: readonly Passage[],
  request: NestedRequest,
  id: ActionId,
): Promise<Outcome<Moved, Failure>> {
  const passage = admissionPassageOf(id)
  if ('failure' in passage) return fail(defect('passage'))
  const known = passages.find(item => item.id === passage.ok) ?? null
  if (nestedVerdict(known) !== null) return succeed({ passages })
  const action = actionOf(id, request.target.arguments, known)
  const open = known !== null && known.progress.kind === 'asked'
  const ended = !parentWaits(input.batch, request.parent)
  if (ended || request.withdrawn()) {
    if (!open || known === null) return succeed({ passages })
    const next = await closed(input, passages, action, known, ended ? 'parent-ended' : 'withdrawn')
    return 'failure' in next ? next : succeed({ passages: next.ok })
  }
  const chain = known ?? freshChain(action, passage.ok)
  const need = needOf(chain)
  if (need === 'judge') {
    const next = await judged(input, passages, action, chain, request)
    if ('failure' in next) return next
    if (next.ok !== 'unanswerable') return succeed(next.ok)
    request.answer({ kind: 'unanswerable', diagnostic: 'the admission cannot answer now' })
    return succeed({ passages })
  }
  const next =
    need === 'present'
      ? await presented(input, passages, action, chain)
      : need === 'read'
        ? await read(input, passages, action)
        : need === 'closed'
          ? await closed(input, passages, action, chain, 'card-closed')
          : succeed(passages)
  return 'failure' in next ? next : succeed({ passages: next.ok })
}

async function orphans<P>(
  input: NestedTurnInput<P>,
  saved: readonly Passage[],
): Promise<Outcome<readonly Passage[], Failure>> {
  let passages = saved
  for (const chain of nestedChains(saved)) {
    const id = admissionActionOf(chain.id)
    const place = id === null ? null : nestedPositionOf(id)
    if (id === null || place === null || chain.progress.kind !== 'asked') continue
    if (parentWaits(input.batch, place.parent)) continue
    const next = await closed(input, passages, actionOf(id, '', chain), chain, 'parent-ended')
    if ('failure' in next) return next
    passages = next.ok
  }
  return succeed(passages)
}

/** AG-32: a position whose parent is not a waiting call of this batch is refused where the run waits. */
export function refuseStrayNested(
  requests: readonly NestedRequest[],
  batch: ActionBatch | null,
): void {
  for (const request of requests)
    if (batch === null || !parentWaits(batch, request.parent))
      request.answer({ kind: 'denied', reason: GONE })
}

/** One pass: a position with a committed conclusion is answered from it, any other takes one step. */
export async function nestedTurn<P>(
  input: NestedTurnInput<P>,
): Promise<Outcome<NestedTurn, Failure>> {
  const cleared = await orphans(input, input.passages)
  if ('failure' in cleared) return cleared
  let passages = cleared.ok
  const opened: CardRoundId[] = []
  for (const request of input.requests) {
    const id = nestedActionOf(request.parent, request.ordinal)
    if ('failure' in id) {
      request.answer({ kind: 'denied', reason: 'the position cannot be named' })
      continue
    }
    const passage = admissionPassageOf(id.ok)
    const committed =
      'ok' in passage ? input.passages.find(item => item.id === passage.ok) : undefined
    const verdict = nestedVerdict(committed ?? null)
    if (verdict !== null) {
      request.answer(
        request.withdrawn()
          ? { kind: 'unanswerable', diagnostic: 'the position was withdrawn' }
          : verdict,
      )
      continue
    }
    if (committed === undefined && !parentWaits(input.batch, request.parent)) {
      request.answer({ kind: 'denied', reason: GONE })
      continue
    }
    const next = await advance(input, passages, request, id.ok)
    if ('failure' in next) return next
    passages = next.ok.passages
    if (next.ok.opened !== undefined) opened.push(next.ok.opened)
  }
  return succeed({ passages, opened })
}

type Place<P> = Omit<NestedTurnInput<P>, 'authority' | 'batch' | 'passages' | 'requests'> &
  Readonly<{ unsentRounds: Set<CardRoundId> }>
type Asked = Readonly<{ pending(): readonly NestedRequest[] }> | undefined

const CANCELLED: NestedActionVerdict = { kind: 'denied', reason: 'the run was cancelled' }

/** What the Loop does with the positions programs ask about: one pass, the strays, and a cancelled run. */
export function nestedDrive<P>(place: Place<P>, asked: Asked, authority: () => Authority) {
  const pending = () => asked?.pending() ?? []
  return {
    async pass(
      batch: ActionBatch,
      saved: readonly Passage[],
    ): Promise<Outcome<readonly Passage[] | null, Failure>> {
      const requests = pending()
      if (requests.length === 0 && nestedChains(saved).length === 0) return succeed(null)
      const turn = { ...place, authority: authority(), batch, passages: saved, requests }
      const turned = await nestedTurn(turn)
      if ('failure' in turned) return turned
      for (const round of turned.ok.opened) place.unsentRounds.add(round)
      return succeed(turned.ok.passages === saved ? null : turned.ok.passages)
    },
    refuseStray: (batch: ActionBatch | null) => refuseStrayNested(pending(), batch),
    cancelled() {
      for (const request of pending()) request.answer(CANCELLED)
    },
  }
}
