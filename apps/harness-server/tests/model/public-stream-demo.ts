// The demonstration of the public Model stream on the release tree (#1214). Not in the release.
// Usage, from apps/harness-server after `pnpm run build` of the member and of apps/cli:
//   node tests/model/public-stream-demo.ts               the demonstration
//   node tests/model/public-stream-demo.ts --measure 5   the demonstration and the two numbers, 5 times
//   node tests/model/public-stream-demo.ts --notices     the demonstration with the commit notices
// With `--notices` (#1230) every commit notice on the root of the tree is printed as it arrives,
// `notice #<revision> <entry kinds>`, between the other lines. After the demonstration a second
// session calls one tool and then answers, so the assistant and the tool messages are committed
// too; at the end each session puts the number of its revisions in the log beside the number of
// its notices.
// It starts the release tree in this process (real SQLite, real identity, the local HTTPS Model
// gateway of the release-tree scenarios), registers and logs in one person through the `omne` CLI,
// sends one input, reads the reference of the main Model call from the session log, takes the
// current stream as that person and prints every frame. The gateway holds the answer after its first
// piece until the snapshot is printed. Then another person (another tenant) asks for the same
// reference and for one that names no call; both answers are printed.
//
// The two numbers, each measured in a session of its own, on one monotonic clock of this process:
// - registration lag: from the first `inspect` of the call that answers found, to the first read of
//   the session log that has its `call.bound`. The call is named before the log has it by reading
//   the Model storage (`md_call`) read only; both sides are polled about every millisecond.
// - first frame: from the `observe` call to its first frame.
import { setTimeout as sleep } from 'node:timers/promises'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../support/release-tree.ts'
import { bodyOf } from '../r9/support.ts'
import {
  recordNotices,
  settledLog,
  type NoticeRecorder,
} from '../session/commit-notices-support.ts'
import {
  absentReference,
  anotherPerson,
  heldAnswer,
  loginAccess,
  modelRuntime,
  newestMainCall,
  publicStream,
  storedCalls,
  type LoginAccess,
} from './public-stream-support.ts'

const measure = (() => {
  const at = process.argv.indexOf('--measure')
  if (at < 0) return 0
  const count = Number(process.argv[at + 1])
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('--measure takes a positive count')
  return count
})()
const notices = process.argv.includes('--notices')

const print = (line: string) => process.stdout.write(`${line}\n`)
const now = () => performance.now()

/** The last part of a stream cursor: its position in the stream. */
function position(cursor: unknown): string {
  try {
    const parts = JSON.parse(String(cursor)) as unknown[]
    return String(parts[parts.length - 1])
  } catch {
    return String(cursor)
  }
}

/** The call phase a snapshot or delta value carries. */
function phaseOf(value: unknown): string {
  const record = value as { state?: { phase?: string }; value?: { state?: { phase?: string } } }
  return String(record.state?.phase ?? record.value?.state?.phase)
}

/** The texts of the text blocks in a value, in order. */
function texts(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(texts)
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  if (typeof record['text'] === 'string') return [record['text']]
  if (typeof record['value'] === 'string' && record['kind'] === 'text') return [record['value']]
  return Object.values(record).flatMap(texts)
}

/** Reads until `done` holds, `pauseMs` apart, for at most a minute. */
async function until<T>(
  read: () => Promise<T> | T,
  done: (value: T) => boolean,
  what: string,
  pauseMs = 1,
) {
  const end = now() + 60_000
  for (;;) {
    const value = await read()
    if (done(value)) return value
    if (now() > end) throw new Error(`${what} did not happen`)
    await sleep(pauseMs)
  }
}

function services(tree: ReleaseTree) {
  const { references, observation } = publicStream(tree.scope)
  if (references === undefined || observation === undefined)
    throw new Error('the public Model stream is not installed')
  return { references, observation }
}

async function createSession(tree: ReleaseTree): Promise<string> {
  const created = await tree.cli(['create-session', '--definition', 'coding'])
  if (created.status !== 0) throw new Error(created.stderr)
  return String(bodyOf(created)['session'])
}

async function sendInput(tree: ReleaseTree, session: string, text: string) {
  const sent = await tree.cli(['send-input', '--session', session, '--text', text])
  if (sent.status !== 0) throw new Error(sent.stderr)
}

async function currentOf(tree: ReleaseTree, access: LoginAccess, reference: never) {
  const answer = await until(
    () => services(tree).references.current({ access, reference }),
    value => 'ok' in value && value.ok.current !== null,
    'a current stream',
  )
  if (!('ok' in answer) || answer.ok.current === null) throw new Error('unreachable')
  return answer.ok
}

async function demonstrate(
  tree: ReleaseTree,
  gateway: ReturnType<typeof heldAnswer>,
): Promise<string> {
  const access = await loginAccess(tree)
  print(`logged in: tenant ${JSON.stringify(access.tenant)}`)
  const session = await createSession(tree)
  await sendInput(tree, session, 'say hello')
  print(`session ${session}: input sent`)
  const reference = await until(
    () => newestMainCall(tree.scope, access, session),
    found => found !== null,
    'the main call registration',
  )
  if (reference === null) throw new Error('unreachable')
  print(`main call from the session log: ${reference}`)
  const selection = await currentOf(tree, access, reference as never)
  print(`current: phase ${selection.state.phase}, stream ${String(selection.current?.ref)}`)
  const stop = new AbortController()
  let index = 0
  const deadline = setTimeout(() => stop.abort(), 15_000)
  for await (const frame of services(tree).observation.observe({
    ref: selection.current!.ref,
    access,
    signal: stop.signal,
  })) {
    index += 1
    const detail =
      frame.kind === 'snapshot' || frame.kind === 'delta'
        ? `#${position(frame.cursor)} phase ${phaseOf(frame.value)} text ${JSON.stringify(texts(frame.value).join(''))}`
        : JSON.stringify(frame)
    print(`frame ${String(index)}: ${frame.kind} ${detail}`)
    if (frame.kind === 'snapshot')
      // Once the Model request is held at the gateway, its first piece has some time to arrive;
      // then the gateway sends the rest.
      void until(
        () => gateway.held(),
        held => held > 0,
        'the request at the gateway',
      ).then(async () => {
        await sleep(300)
        print('  (the gateway now sends the rest of the answer)')
        gateway.release()
      })
    if (frame.kind === 'ended' || frame.kind === 'gap') break
  }
  clearTimeout(deadline)
  const other = await loginAccess(tree, await anotherPerson(tree, 'grace'))
  print(`another person: tenant ${JSON.stringify(other.tenant)}`)
  const forReal = await services(tree).references.current({ access: other, reference })
  const forAbsent = await services(tree).references.current({
    access: other,
    reference: absentReference(other.tenant),
  })
  print(`  the main call's reference: ${JSON.stringify(forReal)}`)
  print(`  a reference to no call:    ${JSON.stringify(forAbsent)}`)
  print(`  the same answer: ${String(JSON.stringify(forReal) === JSON.stringify(forAbsent))}`)
  return session
}

/** The input of the session that calls one tool; the gateway answers it with the tool script. */
const TOOL_INPUT = 'call a tool, then answer'
const ECHO = JSON.stringify({ command: 'execute', params: { script: 'echo notices' } })
const toolScript = toolCallsThenText(() => [{ id: 'call_echo', tool: 'Shell', arguments: ECHO }])

/** Each session: its revisions in the log beside its notices, once its turn has ended. */
async function noticeSummary(tree: ReleaseTree, recorder: NoticeRecorder, sessions: string[]) {
  print('== commit notices against the session log')
  for (const session of sessions) {
    const revisions = (await settledLog(tree.storageRoot, session)).map(batch => batch.revision)
    const told = recorder
      .notices()
      .filter(notice => notice.session === session)
      .map(notice => notice.revision)
    const once = revisions.every(revision => told.filter(item => item === revision).length === 1)
    const matched = once && told.length === revisions.length
    print(
      `session ${session}: ${String(revisions.length)} revisions, ${String(told.length)} notices, one for each revision: ${String(matched)}`,
    )
  }
}

type Sample = Readonly<{ registrationLagMs: number; firstFrameMs: number }>

async function measureOnce(
  tree: ReleaseTree,
  gateway: ReturnType<typeof heldAnswer>,
  access: LoginAccess,
): Promise<Sample> {
  const runtime = modelRuntime(tree.scope)
  const session = await createSession(tree)
  const known = new Set(storedCalls(tree.storageRoot, access.tenant).map(row => row.call))
  const found = (async () => {
    const row = await until(
      () => storedCalls(tree.storageRoot, access.tenant).find(entry => !known.has(entry.call)),
      entry => entry !== undefined,
      'the new Model call in storage',
    )
    if (row === undefined) throw new Error('unreachable')
    await until(
      () => runtime.calls.inspect({ ...access, reference: row.reference }),
      answer => 'ok' in answer && answer.ok.kind === 'found',
      'inspect found',
    )
    return { at: now(), reference: row.reference }
  })()
  const logged = (async () => {
    const reference = await until(
      () => newestMainCall(tree.scope, access, session),
      value => value !== null,
      'the call registration in the session log',
    )
    return { at: now(), reference }
  })()
  await sendInput(tree, session, 'say hello')
  const [model, log] = await Promise.all([found, logged])
  if (model.reference !== log.reference) throw new Error('the two sides named different calls')
  const selection = await currentOf(tree, access, log.reference as never)
  const stop = new AbortController()
  const asked = now()
  let first = Number.NaN
  for await (const _frame of services(tree).observation.observe({
    ref: selection.current!.ref,
    access,
    signal: stop.signal,
  })) {
    first = now()
    break
  }
  stop.abort()
  gateway.release()
  await until(
    () => runtime.calls.inspect({ ...access, reference: log.reference! }),
    answer => 'ok' in answer && answer.ok.kind === 'found' && answer.ok.state.phase === 'settled',
    'the call to settle',
  )
  return { registrationLagMs: log.at - model.at, firstFrameMs: first - asked }
}

function summary(values: readonly number[]): string {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length / 2
  const median =
    sorted.length % 2 === 1
      ? sorted[Math.floor(middle)]!
      : (sorted[middle - 1]! + sorted[middle]!) / 2
  return `median ${median.toFixed(1)} ms, max ${sorted[sorted.length - 1]!.toFixed(1)} ms; each ${sorted.map(v => v.toFixed(1)).join(', ')}`
}

const gateway = heldAnswer('Hello', ' world')
const script: typeof gateway.script = request =>
  notices && request.body.includes(TOOL_INPUT) ? toolScript(request) : gateway.script(request)
const permission = notices ? { permission: 'bypass-permissions' } : {}
await onReleaseTree({ script, ...permission }, async tree => {
  const recorder = notices
    ? recordNotices(tree.scope, notice =>
        print(`notice #${notice.revision} ${notice.kinds.join(',')}`),
      )
    : undefined
  print('== the public Model stream, as the logged-in person')
  const session = await demonstrate(tree, gateway)
  if (recorder !== undefined) {
    print('== a session that calls one tool, then answers')
    const withTool = await tree.startSession(TOOL_INPUT)
    print(`session ${withTool}: input sent`)
    await noticeSummary(tree, recorder, [session, withTool])
    recorder.stop()
  }
  if (measure === 0) return
  print(`== the two numbers, ${String(measure)} sessions`)
  const access = await loginAccess(tree)
  const samples: Sample[] = []
  for (let round = 1; round <= measure; round += 1) {
    const sample = await measureOnce(tree, gateway, access)
    samples.push(sample)
    print(
      `round ${String(round)}: registration lag ${sample.registrationLagMs.toFixed(1)} ms, first frame ${sample.firstFrameMs.toFixed(1)} ms`,
    )
  }
  print(`registration lag: ${summary(samples.map(s => s.registrationLagMs))}`)
  print(`first frame:      ${summary(samples.map(s => s.firstFrameMs))}`)
})
process.exit(0)
