// The batches that the entries channel, the log channel and the Agent journal commit tell since
// #1230 (every commit sends a notice): revisions 4 to 17 of one turn with one tool call on the
// release tree (apps/harness-server tests/session/commit-notices.spec.ts). None of them holds a
// kind that a subscriber here works on, so a subscriber that does work for one of them reacts to
// a kind it does not need.
export const TOLD_BATCHES: readonly (readonly string[])[] = [
  ['run.batch-taken', 'history.annotated'],
  ['call.bound', 'extension.passage', 'history.annotated'],
  ['call.execution-fact', 'account.linked', 'entries.interpreted'],
  ['call.execution-fact', 'history.annotated'],
  ['message.assistant'],
  ['call.bound', 'extension.passage', 'history.annotated'],
  ['call.execution-fact', 'entries.interpreted'],
  ['call.execution-fact', 'history.annotated'],
  ['message.tool'],
  ['call.bound', 'extension.passage', 'history.annotated'],
  ['call.execution-fact', 'account.linked', 'entries.interpreted'],
  ['call.execution-fact', 'history.annotated'],
  ['message.assistant'],
  ['run.attempt-released', 'run.terminal', 'history.annotated'],
]
