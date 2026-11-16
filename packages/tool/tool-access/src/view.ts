import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { ResultPage, ToolState, ToolTerminal } from '@omne-harness/tool-contract'
import type { ToolCallResultPage, ToolCallView } from '@omne-harness/tool-protocol'

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
