// A fixed, deterministic Session log of representative entries, for the size measure and the codec
// bench. The shapes follow a real session of the harness: each turn routes an input, starts a Run
// and an attempt, and makes model calls whose tool calls are bound, executed and answered; the
// texts and tool outputs are of the sizes seen there (one to several KiB). The payload of each
// entry is a json-text value tree, as session-contract writes it.

/** The json-text tree of a plain value. A number keeps the text JavaScript gives it. */
export function tree(value: unknown): unknown {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tree) }
  return {
    kind: 'object',
    entries: Object.entries(value as object).map(([key, member]) => ({ key, value: tree(member) })),
  }
}

const SCHEMA = {
  owner: '@omne-harness/session-contract',
  name: 'session-log',
  revision: '1',
  digest: 'sha256:5f1c0e8a9b3d4c2e7f6a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e',
}

/** A deterministic text of about `length` characters. */
function prose(seed: number, length: number): string {
  const words = [
    'the',
    'session',
    'reads',
    'file',
    'tool',
    'result',
    'model',
    'returns',
    'a',
    'list',
    'of',
    'changes',
    'in',
    'packages/session',
    'with',
    '"quoted"',
    'text\n',
    '中文',
    'and',
    'paths',
  ]
  const out: string[] = []
  let size = 0
  for (let at = seed; size < length; at += 7) {
    const word = words[at % words.length] as string
    out.push(word)
    size += word.length + 1
  }
  return out.join(' ')
}

type Draft = Readonly<{ kind: string; data: unknown }>

function turn(n: number): Draft[] {
  const run = `run-${n}`
  const execution = `exe-${n}`
  const input = `in-${n}`
  const drafts: Draft[] = [
    {
      kind: 'intake.routed',
      data: { input, route: 'ordinary', channel: 'cli', at: 1_700_000_000 + n },
    },
    {
      kind: 'run.started',
      data: { run, execution, first: input, cause: { kind: 'input', input } },
    },
    { kind: 'run.attempt-started', data: { run, attempt: `att-${n}`, ordinal: '1' } },
    {
      kind: 'message.user',
      data: { role: 'user', input, content: [{ type: 'text', text: prose(n, 600) }] },
    },
  ]
  for (let call = 0; call < 3; call += 1) {
    const callId = `call-${n}-${call}`
    drafts.push(
      {
        kind: 'message.assistant',
        data: {
          role: 'assistant',
          model: { provider: 'deepseek', name: 'deepseek-chat', revision: '2026-10' },
          usage: { input: 12_000 + n * 31 + call, output: 400 + call, cached: 8_192, cost: 0.0125 },
          content: [
            { type: 'text', text: prose(n + call, 1_200) },
            {
              type: 'tool-call',
              id: callId,
              name: 'read_file',
              arguments: { path: `packages/session/src/file-${call}.ts`, offset: 0, limit: 400 },
            },
          ],
          finish: 'tool-calls',
        },
      },
      {
        kind: 'call.bound',
        data: {
          call: callId,
          tool: { owner: '@omne-harness/tool', name: 'read_file', revision: '3' },
          run,
          execution,
          grant: {
            owner: 'authorization',
            record: `grant/${callId}`,
            revision: '1',
            digest: 'sha256:00',
          },
        },
      },
      {
        kind: 'call.execution-fact',
        data: {
          call: callId,
          run,
          execution,
          fact: {
            kind: 'completed',
            started: 1_700_000_100 + n,
            ended: 1_700_000_102 + n,
            exit: 0,
          },
          output: { digest: `sha256:${'ab'.repeat(32)}`, bytes: 4_096 + call },
        },
      },
      {
        kind: 'message.tool',
        data: {
          role: 'tool',
          call: callId,
          content: [
            { type: 'text', text: prose(n * 3 + call, 3_000) },
            {
              type: 'json',
              value: {
                lines: Array.from({ length: 20 }, (_, line) => ({
                  line: line + 1,
                  text: prose(line + call, 60),
                  marks: [line % 3 === 0, null],
                })),
                truncated: false,
              },
            },
          ],
        },
      },
    )
  }
  drafts.push(
    {
      kind: 'history.annotated',
      data: { targets: [String(n * 18 + 4)], run, execution: { id: execution, through: '12' } },
    },
    { kind: 'run.terminal', data: { run, execution, outcome: 'completed' } },
  )
  return drafts
}

/** The entries of the scenario: `session.created`, then `turns` turns of 18 entries each. */
export function scenarioEntries(turns: number): Record<string, unknown>[] {
  const drafts: Draft[] = [
    {
      kind: 'session.created',
      data: {
        creation: { title: 'bench', initialModelSelection: { name: 'deepseek-chat', basis: null } },
        workspace: 'ws-1',
      },
    },
  ]
  for (let n = 1; n <= turns; n += 1) drafts.push(...turn(n))
  let revision = 0
  return drafts.map((draft, index) => {
    if (draft.kind === 'session.created' || draft.kind === 'intake.routed') revision += 1
    const id = String(index + 1)
    return {
      id,
      revision: String(revision),
      kind: draft.kind,
      schema: SCHEMA,
      payload: tree(draft.data),
      origin: {
        owner: '@omne-harness/session',
        via: draft.kind.startsWith('call.') ? 'tool' : null,
        source: {
          owner: '@omne-harness/session-storage-sql',
          record: `t/s/${revision}`,
          revision: String(revision),
          digest: `sha256:${'cd'.repeat(32)}`,
        },
      },
    }
  })
}
