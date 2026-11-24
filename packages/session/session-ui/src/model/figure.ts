import type {
  FigureDoing,
  FigureMoment,
  FigureMomentKind,
  FigureReport,
} from '@omne-harness/shell-contract'
import { terminalOf, type Content, type HistoryEntry } from './content.ts'
import { isRecord, listOf, textOf, type Plain } from './plain.ts'
import type { State } from './session-machine.ts'

/** What the session does now, from facts the model holds, mapped as the source's assistant/activity.ts. */
export function figureDoing(state: State, background: boolean): FigureDoing {
  if (state.kind !== 'open' || state.run.kind === 'idle') return background ? 'background' : 'idle'
  if (toolRunning(state.content.entries)) return 'looking'
  return wordsWritten(state.content) ? 'writing' : 'thinking'
}

const blocksOf = (entry: HistoryEntry): readonly Plain[] => {
  const message = isRecord(entry.payload) ? entry.payload['message'] : undefined
  return isRecord(message) ? listOf(message['blocks']) : []
}

const kindOf = (block: Plain): string | undefined =>
  isRecord(block) ? textOf(block['kind']) : undefined

const saysWords = (block: Plain): boolean =>
  kindOf(block) === 'text' && isRecord(block) && (textOf(block['text']) ?? '') !== ''

/** A call of this turn the log has no result for yet, walking back to where the turn began. */
function toolRunning(entries: readonly HistoryEntry[]): boolean {
  const answered = new Set<string>()
  for (let at = entries.length - 1; at >= 0; at -= 1) {
    const entry = entries[at]!
    if (entry.kind === 'run.terminal' || entry.kind === 'run.started') return false
    for (const block of blocksOf(entry)) {
      const call = isRecord(block) ? textOf(block['callId']) : undefined
      if (call === undefined) continue
      if (entry.kind === 'message.tool' && kindOf(block) === 'tool_result') answered.add(call)
      if (
        entry.kind === 'message.assistant' &&
        kindOf(block) === 'tool_call' &&
        !answered.has(call)
      )
        return true
    }
  }
  return false
}

/** Words arriving in the live reply, or its words last in the log until the next fact (as the source). */
function wordsWritten(content: Content): boolean {
  if (content.live !== null)
    return content.live.blocks.some(block =>
      block.kind === 'growing'
        ? block.content === 'text' && block.value !== ''
        : saysWords(block.block),
    )
  const last = content.entries.at(-1)
  return last?.kind === 'message.assistant' && blocksOf(last).some(saysWords)
}

const TERMINAL_MOMENT: Readonly<Record<string, FigureMomentKind>> = {
  completed: 'landed',
  failed: 'could-not',
  cancelled: 'could-not',
}

function momentOf(entry: HistoryEntry): FigureMomentKind | undefined {
  if (entry.kind === 'message.user') return 'received'
  const outcome = terminalOf(entry)?.outcome
  return outcome === null || outcome === undefined ? undefined : TERMINAL_MOMENT[outcome]
}

/** The latest one-off fact new to the log of the same session since its first history read. */
export function arrivedMoment(before: State, after: State): FigureMomentKind | undefined {
  if (before.kind !== 'open' || after.kind !== 'open' || before.session !== after.session)
    return undefined
  if (before.content.readThrough === null || before.content.entries === after.content.entries)
    return undefined
  const known = new Set(before.content.entries.map(entry => entry.entryId))
  let latest: FigureMomentKind | undefined
  for (const entry of after.content.entries)
    if (!known.has(entry.entryId)) latest = momentOf(entry) ?? latest
  return latest
}

/** Reports once per change; its serial outlives views; the latest fact rides along under its serial. */
export class SessionFigure {
  readonly #send: (report: FigureReport) => void
  #serial = 0
  #moment: FigureMoment | undefined
  #before: State | null = null
  #sent: FigureReport | null = null

  constructor(send: (report: FigureReport) => void) {
    this.#send = send
  }

  follow(state: State, background: boolean): void {
    const kind = this.#before === null ? undefined : arrivedMoment(this.#before, state)
    this.#before = state
    if (kind !== undefined) this.#moment = { kind, serial: (this.#serial += 1) }
    this.#report(figureDoing(state, background))
  }

  /** No session is followed any more (no tenant, no view): nothing is known to be under way. */
  leave(): void {
    this.#before = null
    this.#report('idle')
  }

  #report(doing: FigureDoing): void {
    const sent = this.#sent
    if (sent !== null && sent.doing === doing && sent.moment === this.#moment) return
    const report: FigureReport =
      this.#moment === undefined ? { doing } : { doing, moment: this.#moment }
    this.#sent = report
    this.#send(report)
  }
}
