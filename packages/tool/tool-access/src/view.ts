import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { ResultPage, ToolState, ToolTerminal } from '@omne-harness/tool-contract'
import type { ProgramPosition } from '@omne-harness/tool-contract/provider'
import type { ToolCallChild, ToolCallResultPage, ToolCallView } from '@omne-harness/tool-protocol'

function terminalDetail(terminal: ToolTerminal): string | null {
  switch (terminal.kind) {
    case 'completed':
      return null
    case 'failed':
      return `${terminal.cause}: ${terminal.diagnostic}`
    case 'unavailable':
    case 'no-response':
      return terminal.reason
    case 'interrupted':
      return terminal.cause.kind
  }
}

export function terminalView(terminal: ToolTerminal): ToolCallView['terminal'] & object {
  return { kind: terminal.kind, detail: terminalDetail(terminal) }
}

/** What a client may read of a call: its phase, relation, end, effect and control progress. */
export function callView(state: ToolState): ToolCallView {
  const settled = state.phase === 'settled'
  return {
    phase: state.phase,
    relation: state.relation,
    result: settled ? state.result : null,
    terminal: settled ? terminalView(state.terminal) : null,
    effect: state.effect.kind,
    controls: state.controls.map(control => ({
      operation: control.operation,
      intent: control.intent.kind,
      progress: control.progress.kind,
    })),
  }
}

/** Plain data (content blocks, process blocks) as the JSON tree the `json` rule carries. */
export function jsonOf(value: unknown): JsonValue {
  if (value === null || value === undefined) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(jsonOf) }
  return {
    kind: 'object',
    entries: Object.entries(value as Record<string, unknown>)
      .filter(([, member]) => member !== undefined)
      .map(([key, member]) => ({ key, value: jsonOf(member) })),
  }
}

/** A page of a result: what a person reads of it, so only the blocks meant for people. */
export function resultView(page: ResultPage<ContentBlock>): ToolCallResultPage {
  return {
    result: page.result,
    terminal: terminalView(page.terminal),
    effect: page.effect.kind,
    content: jsonOf(page.value.content.filter(block => block.visibility.toHuman)),
    next: page.next,
  }
}

type ChildState = ToolCallChild['state']

const TERMINALS: Readonly<Record<ToolTerminal['kind'], ChildState>> = {
  completed: 'completed',
  failed: 'failed',
  unavailable: 'failed',
  interrupted: 'stopped',
  'no-response': 'unknown',
}
const EXCLUSIONS: Readonly<
  Record<Extract<ProgramPosition, { state: 'excluded' }>['exclusion']['kind'], ChildState>
> = { denied: 'denied', 'not-accepted': 'failed', unavailable: 'failed', closed: 'stopped' }

/** What the call at a handed position is doing: `missing` before its admission landed, `unread` when it cannot be read. */
export type ChildProgress = ToolState | 'missing' | 'unread'

function handedState(
  position: Extract<ProgramPosition, { state: 'handed' }>,
  progress: ChildProgress,
): ChildState {
  if (position.background) return 'background'
  if (position.stop === 'unknown' || progress === 'unread') return 'unknown'
  if (progress === 'missing') return 'queued'
  switch (progress.phase) {
    case 'accepted':
    case 'preparing':
    case 'queued':
      return 'queued'
    case 'starting':
    case 'running':
      return 'running'
    case 'suspended':
      return 'waiting'
    case 'settled':
      return TERMINALS[progress.terminal.kind]
  }
}

/** One word for a position: a registered one is still in its admission, which is where a person is asked. */
export function childState(position: ProgramPosition, progress: ChildProgress): ChildState {
  switch (position.state) {
    case 'registered':
      return 'waiting'
    case 'handed':
      return handedState(position, progress)
    case 'excluded':
      return EXCLUSIONS[position.exclusion.kind]
    case 'retained':
      return TERMINALS[position.terminal.kind]
  }
}
