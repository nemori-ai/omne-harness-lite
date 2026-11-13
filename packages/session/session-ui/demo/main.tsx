// Development only: the session interface against a fake `session/v1` client that plays a small
// server. Each message starts a run that streams a reply word by word, calls a tool, and commits.
import { createRoot } from 'react-dom/client'
import '../src/view/session-ui.css'
import { SessionWorkspace } from '../src/index.ts'
import { toTree, type Plain } from '../src/model/plain.ts'
import { createFakeClient, type FakeObservation } from '../tests/fixtures/fake-client.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const visibility = { toHuman: true, toModel: true }
const fake = createFakeClient()
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

type Entry = { entryId: string; revision: string; kind: string; payload: Plain }
const log: Entry[] = []
let revision = 1
let runs = 0
let current: { run: string; cancelled: boolean } | null = null

function commit(kind: string, payload: Plain): void {
  revision += 1
  log.push({ entryId: String(log.length + 1), revision: String(revision), kind, payload })
}
function message(role: string, blocks: Plain[]): Plain {
  return { kind: `message.${role}`, message: { id: `msg_${role}${log.length}`, role, blocks } }
}
function live(): FakeObservation | undefined {
  return fake.observations.findLast(observation => !observation.aborted)
}
function state(): void {
  live()?.push({
    kind: 'state',
    run: current?.run ?? null,
    revision: String(revision),
    phase: current === null ? null : 'running',
    target: current === null ? null : { projection: 'model-output-v1' },
  })
}

const REPLY = `好的。下面是一个**流式 Markdown** 的例子：

1. 列表第一项
2. 列表第二项

\`\`\`ts
const greeting = 'hello'
console.log(greeting)
\`\`\`

我先用工具看一下当前目录。`

async function stream(run: { run: string; cancelled: boolean }, text: string): Promise<void> {
  let cursor = 1
  const projection = (value: string, base: boolean) =>
    toTree({
      projection: 'model-output-v1',
      ...(base
        ? { base: { cursor: String(cursor - 1), revision: String(cursor - 1) } }
        : { phase: 'running' }),
      cursor: String(cursor),
      revision: String(cursor),
      blocks: [
        {
          kind: 'sealed',
          index: '0',
          block: { kind: 'thinking', id: 't', visibility, text: '想一想怎么回答……' },
        },
        { kind: 'growing', index: '1', mode: 'append', content: 'text', value },
      ],
    })
  live()?.push({ kind: 'snapshot', projection: 'model-output-v1', value: projection('', false) })
  const words = text.split(/(?<=\s)|(?=\s)/)
  let shown = ''
  for (const word of words) {
    if (run.cancelled) return
    await wait(45)
    shown += word
    cursor += 1
    live()?.push({ kind: 'delta', projection: 'model-output-v1', value: projection(shown, true) })
  }
}

async function playRun(text: string): Promise<void> {
  runs += 1
  const run = { run: `run_${runs}`, cancelled: false }
  current = run
  commit('run.started', {})
  state()
  await wait(200)
  if (text.includes('断')) {
    live()?.end({ kind: 'uncertain' })
    await wait(2500)
  }
  await stream(run, REPLY)
  const finish = (outcome: string) => {
    commit('run.terminal', { terminal: { outcome } })
    current = null
    state()
  }
  if (run.cancelled) return finish('cancelled')
  const ask = text.includes('问')
  const call = ask
    ? {
        kind: 'tool_call',
        id: 'c1',
        visibility,
        callId: `call_${runs}`,
        name: 'Ask',
        arguments: {
          command: 'ask',
          params: {
            questions: [
              {
                title: '要部署到哪个环境？',
                description: '部署之后会对外可见。',
                options: [
                  { label: '预发（推荐）', description: '先在预发验证，不影响用户。' },
                  { label: '生产', description: '直接上线，用户马上看到。' },
                ],
              },
            ],
          },
        },
      }
    : {
        kind: 'tool_call',
        id: 'c1',
        visibility,
        callId: `call_${runs}`,
        name: 'Shell',
        arguments: { command: 'exec', params: { cmd: 'ls' } },
      }
  commit(
    'message.assistant',
    message('assistant', [{ kind: 'text', id: 'a', visibility, text: REPLY }, call]),
  )
  state()
  if (ask) {
    while (!run.cancelled) await wait(200)
    return finish('cancelled')
  }
  await wait(600)
  commit(
    'message.tool',
    message('tool', [
      { kind: 'tool_result', id: 'r', visibility, callId: `call_${runs}` },
      { kind: 'text', id: 'rt', visibility, text: 'README.md\nsrc\ntests' },
    ]),
  )
  state()
  await wait(300)
  commit(
    'message.assistant',
    message('assistant', [
      { kind: 'text', id: 'b', visibility, text: '目录里有 `README.md`、`src` 与 `tests`。' },
    ]),
  )
  finish('completed')
}

async function serve(
  operation: Parameters<typeof fake.next>[0],
  answer: (body: never) => unknown,
): Promise<never> {
  for (;;) {
    const call = await fake.next(operation)
    await wait(150)
    call.answer(await answer(call.body as never))
  }
}

void serve('create-session', () => ({
  outcome: 'succeeded',
  body: { session: 'ses_demo', recovered: false },
}))
void serve('read-history', () => ({
  outcome: 'succeeded',
  body: {
    entries: [...log].reverse().map(entry => ({ ...entry, payload: toTree(entry.payload) })),
    next: null,
    exhausted: true,
    scannedThrough: String(log.length),
    upper: String(revision),
  },
}))
void serve(
  'send-input',
  (body: { message: { entries: { key: string; value: { value?: string } }[] } }) => {
    const id = body.message.entries.find(entry => entry.key === 'id')?.value.value ?? 'msg_x'
    const blocks = body.message.entries.find(entry => entry.key === 'blocks')?.value as unknown
    const text =
      JSON.stringify(blocks).match(
        /"key":"text","value":\{"kind":"string","value":"((?:[^"\\]|\\.)*)"/,
      )?.[1] ?? ''
    const plain = JSON.parse(`"${text}"`) as string
    commit('message.user', {
      kind: 'message.user',
      message: { id, role: 'user', blocks: [{ kind: 'text', id: 'u', visibility, text: plain }] },
    })
    if (current === null) void playRun(plain)
    else state()
    return { outcome: 'succeeded', body: { recovered: false } }
  },
)
void serve('query-send-input', () => ({ outcome: 'succeeded', body: {} }))
void serve('cancel-run', (body: { controlId: string; run: string }) => {
  if (current !== null) current.cancelled = true
  return {
    outcome: 'succeeded',
    body: { kind: 'requested', controlId: body.controlId, run: body.run },
  }
})

// A reopened observation starts with a state frame, as the server's does.
void (async () => {
  let seen = 0
  for (;;) {
    await wait(100)
    if (fake.observations.length > seen) {
      seen = fake.observations.length
      state()
    }
  }
})()

const root = document.getElementById('root')
if (root !== null)
  createRoot(root).render(<SessionWorkspace client={fake.client} tenant={TENANT} />)

// `?play=<text>` walks the scene without hands (for a headless screenshot): new session, one message.
const params = new URLSearchParams(location.search)
const theme = params.get('theme')
if (theme !== null) document.documentElement.dataset['theme'] = theme
const play = params.get('play')
if (play !== null)
  void (async () => {
    await wait(300)
    document.querySelector<HTMLButtonElement>('.omne-session-bar button')?.click()
    await wait(800)
    const input = document.querySelector<HTMLTextAreaElement>('.omne-input')
    if (input === null) return
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(input, play)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(100)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })()
