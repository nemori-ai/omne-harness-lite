// The demonstration of session observation on the release tree (#1248). Not in the release.
// Usage, from apps/harness-server after `pnpm run build` of the members and of apps/cli:
//   node tests/session/observation-demo.ts --state     state frames (block 1)
//   node tests/session/observation-demo.ts --content   content frames through a turn with a tool (block 2)
// It starts the release tree in this process (real SQLite, real identity, the local HTTPS Model
// gateway of the release-tree scenarios), registers and logs in one person through the `omne` CLI,
// takes `sessionObservation` from the tree and calls `open` as that person. Every frame is printed
// with the milliseconds since the frame before it. The refresh policy is a short one, passed in
// here: interval 1000 ms, backoff 2, at most 4 attempts.
import { writeJsonText } from '@omne-harness/json-text'
import type { SessionId } from '@omne-harness/session-contract'
import type { SessionObservationFrame } from '@omne-harness/session-observation'
import {
  sessionObservationKey,
  type SessionObservationService,
} from '@omne-harness/session-observation/cordis'
import { onReleaseTree, pollUntil, type ReleaseTree } from '../support/release-tree.ts'
import { emptySession, heldToolTurn, openObservation, sendInput } from './observation-support.ts'
import {
  anotherPerson,
  heldAnswer,
  loginAccess,
  type LoginAccess,
} from '../model/public-stream-support.ts'

const POLICY = process.env['DEMO_INTERVAL']
  ? { interval: Number(process.env['DEMO_INTERVAL']) }
  : { interval: 1000, backoff: 2, maxAttempts: 4 }
const print = (line: string) => process.stdout.write(`${line}\n`)

function show(frame: SessionObservationFrame): string {
  switch (frame.kind) {
    case 'state':
      return `state run=${String(frame.run)} revision=${frame.revision} phase=${String(frame.phase)} target=${frame.target === null ? 'null' : frame.target.projection}`
    case 'gap':
      return `gap ${frame.reason}`
    case 'snapshot':
    case 'delta':
      return `${frame.kind} ${writeJsonText(frame.value).slice(0, 160)}`
    default:
      return frame.kind
  }
}

function open(tree: ReleaseTree, access: LoginAccess, session: string, signal: AbortSignal) {
  const service = tree.scope.get(sessionObservationKey) as
    | SessionObservationService<unknown>
    | undefined
  if (service === undefined) throw new Error('sessionObservation is not on the tree')
  return service.open({ access: { ...access, session: session as SessionId }, signal })
}

/** Block 1: the run number, revisions that follow the commits, the backoff and its end, denial. */
async function stateFrames(): Promise<void> {
  const held = heldAnswer('Hello', ', there.')
  await onReleaseTree({ script: held.script, observationPolicy: POLICY }, async tree => {
    const access = await loginAccess(tree)
    print(`policy: ${JSON.stringify(POLICY)}`)
    const session = await tree.startSession('say hello')
    print(`session ${session}: input sent; the gateway holds the answer after its first piece`)
    await pollUntil(
      'the held answer',
      () => Promise.resolve(held.held()),
      n => n > 0,
    )
    const opened = await open(tree, access, session, new AbortController().signal)
    print(`open -> ${opened.kind}`)
    if (opened.kind !== 'opened') return
    let last = performance.now()
    let released = false
    for (;;) {
      const step = await opened.frames.next()
      const now = performance.now()
      const gap = Math.round(now - last)
      last = now
      if (step.done === true) {
        print(`+${String(gap)} ms  end: ${String(step.value)}`)
        break
      }
      print(`+${String(gap)} ms  ${show(step.value)}`)
      if (!released) {
        released = true
        print('(the gateway lets the rest of the answer go)')
        held.release()
      }
    }
    const other = await loginAccess(tree, await anotherPerson(tree, 'frank'))
    const signal = new AbortController().signal
    print(`another tenant opens this session -> ${(await open(tree, other, session, signal)).kind}`)
    print(
      `another tenant opens an absent one -> ${(await open(tree, other, 'sess_absent', signal)).kind}`,
    )
  })
}

/**
 * Block 2: a turn with one tool call. Both Model calls hold their answer after the first piece; the
 * script lets each go once its snapshot is printed. The interval is a minute, so every state frame
 * after the first comes from a commit notice.
 */
async function contentFrames(): Promise<void> {
  const turn = heldToolTurn()
  const options = {
    script: turn.script,
    permission: 'bypass-permissions',
    observationPolicy: { interval: 60_000 },
  }
  await onReleaseTree(options, async tree => {
    const access = await loginAccess(tree)
    const session = await emptySession(tree)
    const controller = new AbortController()
    const opened = await openObservation(tree, access, session, controller.signal)
    print(`session ${session}: open -> ${opened.kind}; refresh interval 60000 ms`)
    if (opened.kind !== 'opened') return
    let last = performance.now()
    let snapshots = 0
    let sent = false
    for (;;) {
      const step = await opened.frames.next()
      const now = performance.now()
      const gap = Math.round(now - last)
      last = now
      if (step.done === true) {
        print(`+${String(gap)} ms  end: ${String(step.value)}`)
        break
      }
      print(`+${String(gap)} ms  ${show(step.value)}`)
      if (!sent) {
        sent = true
        print('(input sent: "call a tool, then answer")')
        await sendInput(tree, session, 'call a tool, then answer')
      }
      if (step.value.kind === 'snapshot') {
        snapshots += 1
        print(`(the gateway lets Model call ${String(snapshots)} go)`)
        turn.release()
      }
      if (step.value.kind === 'state' && step.value.run === null && snapshots > 0) {
        controller.abort()
        print('(the observer stops)')
      }
    }
  })
}

if (process.argv.includes('--state')) await stateFrames()
else if (process.argv.includes('--content')) await contentFrames()
else print('usage: node tests/session/observation-demo.ts --state | --content')
