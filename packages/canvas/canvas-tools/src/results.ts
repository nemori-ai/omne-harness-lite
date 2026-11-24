import type {
  BasisUnavailable,
  ChangeAnswer,
  ConflictReason,
  Entry,
  InvalidWhere,
  PlaceAnswer,
  ReadAnswer,
  RequestInvalid,
  RequestInvalidWhere,
} from '@omne-harness/canvas-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolPrimitiveFailure } from '@omne-harness/tool-contract/provider'
import type { CanvasCommandName } from './protocol.ts'

export type Answer = Outcome<string, ToolPrimitiveFailure>

/* A failure reason starts with the name of the canvas/v1 outcome, then the reason and the entry, then what to do. */

const operationOf = (command: CanvasCommandName) => `Canvas.${command}`

const completed = (command: CanvasCommandName, value: unknown): Answer =>
  succeed(`done Canvas ${command}\n${JSON.stringify(value)}`)

const unchanged = (command: CanvasCommandName, value: unknown): Answer =>
  succeed(`no-change Canvas ${command}\n${JSON.stringify(value)}`)

const WHERE: Readonly<Record<RequestInvalidWhere, string>> = {
  canvas: 'the canvas is not one: this tool works on the canvas of the tenant',
  request:
    'a value of the command does not fit; help with the name of the command gives its fields',
  spot: 'the spot is off the sheet; look gives the width and the height of the sheet',
  size: 'the size is out of bounds; leave it out and the drawing takes its own size',
  repeated: 'an item or a pile is named twice in one batch; name each once',
  batch: 'the batch is longer than the canvas takes; split it',
}

function notFitting(
  where: InvalidWhere | RequestInvalidWhere,
  path: RequestInvalid['path'],
): Answer {
  const at = path.length === 0 ? '' : ` at ${path.join('.')}`
  return fail({ kind: 'invalid', reason: `invalid ${where}${at}: ${WHERE[where]}` })
}

export const denied = (): Answer =>
  fail({
    kind: 'unsupported',
    reason:
      'denied: this call may not act on the canvas of this tenant. Do not try another route; tell the user.',
  })

export const unavailable = (command: CanvasCommandName, why: string): Answer =>
  fail({
    kind: 'unavailable',
    operation: operationOf(command),
    reason: `basis-unavailable: ${why}`,
  })

const NOW_UNAVAILABLE = 'the canvas cannot answer now; nothing was changed. Try again later.'

/** A kind declared twice: the domain names the two, and so does the tool. */
function basisUnavailable(command: CanvasCommandName, answer: BasisUnavailable): Answer {
  if (answer.conflict === undefined) return unavailable(command, NOW_UNAVAILABLE)
  const { name, by } = answer.conflict
  return unavailable(
    command,
    `the kind ${name} is declared twice, by ${by.join(' and ')}; neither counts until one is withdrawn. Nothing was changed; kinds lists it as a conflict.`,
  )
}

export const unknown = (command: CanvasCommandName): Answer =>
  fail({
    kind: 'unknown',
    operation: operationOf(command),
    reason:
      'unknown: it is not known whether this took effect. Look at the canvas, or send the same command again: what took effect answers no-change and is not done twice.',
  })

const entryText = (entry: Entry | undefined) =>
  entry === undefined ? '' : 'item' in entry ? ` item ${entry.item}` : ` pile ${entry.pile}`

const NOTHING_DONE = 'Nothing in the batch was done.'

const CONFLICTS: Readonly<Record<ConflictReason, string>> = {
  locked: 'it is locked. A person has to unlock it: ask the user to.',
  taken: 'it is taken off the canvas; place its reference to put it back.',
  'in-pile': 'it is in a pile; take it out first: arrange it with pile null.',
  'kind-undeclared': 'this kind is not declared now; kinds lists the kinds there are.',
  full: 'the canvas holds as many items as it may; take some off first.',
  'not-admitted':
    'the owner of this kind did not accept this reference; kinds says how its ref is written.',
}

function conflict(reason: ConflictReason, entry: Entry | undefined): Answer {
  const tail = entry === undefined ? '' : ` ${NOTHING_DONE}`
  return fail({
    kind: 'conflict',
    reason: `conflict ${reason}${entryText(entry)}: ${CONFLICTS[reason]}${tail}`,
  })
}

function notFound(entry: Entry): Answer {
  const what = 'item' in entry ? 'item' : 'pile'
  return fail({
    kind: 'invalid',
    reason: `not-found${entryText(entry)}: there is no such ${what} on this canvas; look lists them. ${NOTHING_DONE}`,
  })
}

export function readAnswer<T>(
  command: CanvasCommandName,
  answer: ReadAnswer<T> | RequestInvalid | Readonly<{ kind: 'invalid'; where: InvalidWhere }>,
  done: (value: T) => unknown,
): Answer {
  switch (answer.kind) {
    case 'done':
      return completed(command, done(answer.value))
    case 'invalid':
      return notFitting(answer.where, 'path' in answer ? answer.path : [])
    case 'denied':
      return denied()
    case 'basis-unavailable':
      return unavailable(command, NOW_UNAVAILABLE)
  }
}

export function placeAnswer(answer: PlaceAnswer): Answer {
  switch (answer.kind) {
    case 'done':
      return completed('place', answer.value)
    case 'no-change':
      return unchanged('place', { item: answer.item })
    case 'conflict':
      return conflict(answer.reason, undefined)
    case 'invalid':
      return notFitting(answer.where, answer.path)
    case 'denied':
      return denied()
    case 'basis-unavailable':
      return basisUnavailable('place', answer)
    case 'unknown':
      return unknown('place')
  }
}

export function changeAnswer(command: CanvasCommandName, answer: ChangeAnswer): Answer {
  switch (answer.kind) {
    case 'done':
      return completed(command, answer.value)
    case 'no-change':
      return unchanged(command, {})
    case 'not-found':
      return notFound(answer.entry)
    case 'conflict':
      return conflict(answer.reason, answer.entry)
    case 'invalid':
      return notFitting(answer.where, answer.path)
    case 'denied':
      return denied()
    case 'basis-unavailable':
      return basisUnavailable(command, answer)
    case 'unknown':
      return unknown(command)
  }
}

/** A read that throws has no basis. */
export async function reading(command: CanvasCommandName, call: () => Promise<Answer>) {
  try {
    return await call()
  } catch {
    return unavailable(command, NOW_UNAVAILABLE)
  }
}

/** A write that throws has an unknown result. */
export async function writing(command: CanvasCommandName, call: () => Promise<Answer>) {
  try {
    return await call()
  } catch {
    return unknown(command)
  }
}
