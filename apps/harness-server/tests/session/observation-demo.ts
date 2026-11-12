// The demonstration of session observation on the release tree (#1248). Not in the release.
// Usage, from apps/harness-server after `pnpm run build` of the members and of apps/cli:
//   node tests/session/observation-demo.ts --state     state frames (block 1)
//   node tests/session/observation-demo.ts --content   content frames through a turn with a tool (block 2)
//   node tests/session/observation-demo.ts --abort     Ctrl-C midway; the process ends by itself (block 3)
// It starts the release tree in this process (real SQLite, real identity, the local HTTPS Model
// gateway of the release-tree scenarios), registers and logs in one person through the `omne` CLI,
// takes `sessionObservation` from the tree and calls `open` as that person. Every frame is printed
// with the milliseconds since the frame before it. The refresh policy is passed in here: for
// `--state` interval 1000 ms, backoff 2, at most 4 attempts; for `--content` interval 4000 ms,
// backoff 1; for `--abort` the default.
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
 * script lets each go once its snapshot is printed. A Model call that is accepted but has no stream
 * yet makes no session commit, so its stream is found at the next interval; the other state frames
 * come from commit notices, well inside the interval.
 */
const CONTENT_POLICY = { interval: 4000, backoff: 1 }

async function contentFrames(): Promise<void> {
  const turn = heldToolTurn()
  const options = {
    script: turn.script,
    permission: 'bypass-permissions',
    observationPolicy: CONTENT_POLICY,
  }
  await onReleaseTree(options, async tree => {
    const access = await loginAccess(tree)
    const session = await emptySession(tree)
    const controller = new AbortController()
    const opened = await openObservation(tree, access, session, controller.signal)
    print(`session ${session}: open -> ${opened.kind}; policy ${JSON.stringify(CONTENT_POLICY)}`)
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
        await pollUntil(
          `Model call ${String(snapshots)} held`,
          () => Promise.resolve(turn.held()),
          n => n > 0,
        )
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

/**
 * Block 3: Ctrl-C stops an observation midway. The handler only aborts the observer's signal; the
 * script never calls `process.exit`. When nothing of the observation is left (no wait, no
 * subscription, no notice listener), the process ends by itself, and on its way out prints how long
 * after the abort that was. With `DEMO_CTRL_C_AFTER=<ms>` the script sends itself the same event,
 * for a run without a keyboard.
 */
async function abortMidway(): Promise<void> {
  const turn = heldToolTurn()
  const options = { script: turn.script, permission: 'bypass-permissions' }
  await onReleaseTree(options, async tree => {
    const access = await loginAccess(tree)
    const session = await emptySession(tree)
    const controller = new AbortController()
    const opened = await openObservation(tree, access, session, controller.signal)
    if (opened.kind !== 'opened') return
    await sendInput(tree, session, 'call a tool, then answer')
    let abortedAt = 0
    const onCtrlC = (): void => {
      process.off('SIGINT', onCtrlC)
      abortedAt = performance.now()
      print('(Ctrl-C: the observer aborts its signal; the script does not call process.exit)')
      controller.abort()
    }
    process.on('SIGINT', onCtrlC)
    process.on('exit', () => {
      print(
        `the process ends by itself ${String(Math.round(performance.now() - abortedAt))} ms after the abort`,
      )
    })
    const after = Number(process.env['DEMO_CTRL_C_AFTER'] ?? 0)
    for (;;) {
      const step = await opened.frames.next()
      if (step.done === true) {
        print(`frames end: ${String(step.value)}`)
        break
      }
      print(`frame ${show(step.value)}`)
      if (step.value.kind === 'snapshot' && abortedAt === 0) {
        print('(the Model call is held; press Ctrl-C to stop the observation)')
        if (after > 0) setTimeout(() => process.emit('SIGINT'), after).unref()
      }
    }
    // The observation is gone; let the held Model call go so the turn can end and the tree close.
    turn.release()
    await pollUntil(
      'the turn ends',
      () => Promise.resolve(turn.held()),
      n => n > 0,
    ).catch(() => undefined)
    turn.release()
  })
}

if (process.argv.includes('--state')) await stateFrames()
else if (process.argv.includes('--content')) await contentFrames()
else if (process.argv.includes('--abort')) await abortMidway()
else print('usage: node tests/session/observation-demo.ts --state | --content | --abort')
