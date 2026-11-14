// Development only: the session interface against a fake `session/v1` client that plays a small
// server with several sessions. Each message starts a run that streams a reply word by word, calls a
// tool, and commits. One session is there from the start, as after reloading the page.
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
type Held = {
  log: Entry[]
  revision: number
  title: string | null
  /** Order of the last activity: the list shows the highest first. */
  active: number
  current: { run: string; cancelled: boolean } | null
}
const sessions = new Map<string, Held>()
let activity = 0
let runs = 0

function held(session: string): Held {
  let found = sessions.get(session)
  if (found === undefined) {
    activity += 1
    found = { log: [], revision: 1, title: null, active: activity, current: null }
    sessions.set(session, found)
  }
  return found
}
function touch(session: Held): void {
  activity += 1
  session.active = activity
}
function commit(session: Held, kind: string, payload: Plain): void {
  session.revision += 1
  session.log.push({
    entryId: String(session.log.length + 1),
    revision: String(session.revision),
    kind,
    payload,
  })
}
function message(session: Held, role: string, blocks: Plain[]): Plain {
  return {
    kind: `message.${role}`,
    message: { id: `msg_${role}${session.log.length}`, role, blocks },
  }
}
function live(session: string): FakeObservation | undefined {
  return fake.observations.findLast(
    observation =>
      !observation.aborted && (observation.open as { session: string }).session === session,
  )
}
function state(id: string): void {
  const session = held(id)
  const current = session.current
  live(id)?.push({
    kind: 'state',
    run: current?.run ?? null,
    revision: String(session.revision),
    phase: current === null ? null : 'running',
    target: current === null ? null : { projection: 'model-output-v1' },
  })
}

const earlier = held('ses_demo0')
earlier.title = '昨天的会话'
commit(
  earlier,
  'message.user',
  message(earlier, 'user', [{ kind: 'text', id: 'u', visibility, text: '昨天的会话' }]),
)
commit(
  earlier,
  'message.assistant',
  message(earlier, 'assistant', [{ kind: 'text', id: 'a', visibility, text: '这是昨天的回答。' }]),
)

const REPLY = `好的。下面是一个**流式 Markdown** 的例子：

1. 列表第一项
2. 列表第二项

\`\`\`ts
const greeting = 'hello'
console.log(greeting)
\`\`\`

我先用工具看一下当前目录。`

async function stream(
  id: string,
  run: { run: string; cancelled: boolean },
  text: string,
): Promise<void> {
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
  live(id)?.push({ kind: 'snapshot', projection: 'model-output-v1', value: projection('', false) })
  const words = text.split(/(?<=\s)|(?=\s)/)
  let shown = ''
  for (const word of words) {
    if (run.cancelled) return
    await wait(45)
    shown += word
    cursor += 1
    live(id)?.push({
      kind: 'delta',
      projection: 'model-output-v1',
      value: projection(shown, true),
    })
  }
}

async function playRun(id: string, text: string): Promise<void> {
  const session = held(id)
  runs += 1
  const run = { run: `run_${runs}`, cancelled: false }
  session.current = run
  commit(session, 'run.started', {})
  state(id)
  await wait(200)
  if (text.includes('断')) {
    live(id)?.end({ kind: 'uncertain' })
    await wait(2500)
  }
  await stream(id, run, REPLY)
  const finish = (outcome: string) => {
    commit(session, 'run.terminal', { terminal: { outcome } })
    session.current = null
    touch(session)
    state(id)
  }
  if (run.cancelled) return finish('cancelled')
  const callId = `call_${run.run}`
  const ask = text.includes('问')
  const call = ask
    ? {
        kind: 'tool_call',
        id: 'c1',
        visibility,
        callId,
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
        callId,
        name: 'Shell',
        arguments: { command: 'exec', params: { cmd: 'ls' } },
      }
  commit(
    session,
    'message.assistant',
    message(session, 'assistant', [{ kind: 'text', id: 'a', visibility, text: REPLY }, call]),
  )
  state(id)
  if (ask) {
    while (!run.cancelled) await wait(200)
    return finish('cancelled')
  }
  await wait(600)
  commit(
    session,
    'message.tool',
    message(session, 'tool', [
      { kind: 'tool_result', id: 'r', visibility, callId },
      { kind: 'text', id: 'rt', visibility, text: 'README.md\nsrc\ntests' },
    ]),
  )
  state(id)
  await wait(300)
  commit(
    session,
    'message.assistant',
    message(session, 'assistant', [
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

void serve('create-session', () => {
  const id = `ses_demo${sessions.size}`
  held(id)
  return { outcome: 'succeeded', body: { session: id, recovered: false } }
})
void serve('list-sessions', () => ({
  outcome: 'succeeded',
  body: {
    sessions: [...sessions.entries()]
      .sort(([, a], [, b]) => b.active - a.active)
      .map(([session, { title }]) => ({
        session,
        createdAt: null,
        lastActivityAt: null,
        lifecycle: 'dormant',
        title,
      })),
    next: null,
    completeness: 'complete',
  },
}))
void serve('read-history', (body: { session: string }) => {
  const { log, revision } = held(body.session)
  return {
    outcome: 'succeeded',
    body: {
      entries: [...log].reverse().map(entry => ({ ...entry, payload: toTree(entry.payload) })),
      next: null,
      exhausted: true,
      scannedThrough: String(log.length),
      upper: String(revision),
    },
  }
})
void serve(
  'send-input',
  (body: {
    session: string
    message: { entries: { key: string; value: { value?: string } }[] }
  }) => {
    const session = held(body.session)
    const id = body.message.entries.find(entry => entry.key === 'id')?.value.value ?? 'msg_x'
    const blocks = body.message.entries.find(entry => entry.key === 'blocks')?.value as unknown
    const text =
      JSON.stringify(blocks).match(
        /"key":"text","value":\{"kind":"string","value":"((?:[^"\\]|\\.)*)"/,
      )?.[1] ?? ''
    const plain = JSON.parse(`"${text}"`) as string
    commit(session, 'message.user', {
      kind: 'message.user',
      message: { id, role: 'user', blocks: [{ kind: 'text', id: 'u', visibility, text: plain }] },
    })
    session.title ??= plain.replace(/\s+/g, ' ').slice(0, 80)
    touch(session)
    if (session.current === null) void playRun(body.session, plain)
    else state(body.session)
    return { outcome: 'succeeded', body: { recovered: false } }
  },
)
void serve('query-send-input', () => ({ outcome: 'succeeded', body: {} }))
void serve('cancel-run', (body: { session: string; controlId: string; run: string }) => {
  const current = held(body.session).current
  if (current !== null) current.cancelled = true
  return {
    outcome: 'succeeded',
    body: { kind: 'requested', controlId: body.controlId, run: body.run },
  }
})

// A newly opened observation starts with a state frame, as the server's does.
void (async () => {
  let seen = 0
  for (;;) {
    await wait(100)
    for (const observation of fake.observations.slice(seen))
      state((observation.open as { session: string }).session)
    seen = fake.observations.length
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
    ;[...document.querySelectorAll<HTMLButtonElement>('.omne-session-bar button')]
      .find(button => button.textContent === '新建会话')
      ?.click()
    await wait(800)
    const input = document.querySelector<HTMLTextAreaElement>('.omne-input')
    if (input === null) return
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(input, play)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(100)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })()
