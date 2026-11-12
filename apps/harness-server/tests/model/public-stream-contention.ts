// Does taking the current stream often slow the Model call down? (#1214) Not in the release.
// Usage, from apps/harness-server after `pnpm run build` of the member and of apps/cli:
//   node tests/model/public-stream-contention.ts 5 [readers] [pauseMs]   (defaults: 1 reader, 1 ms)
// Each round holds the answer of the main call at the gateway, then lets it go and times the call
// from the release to `settled` on the monotonic clock of this process (polling `inspect` every
// 5 ms). Rounds alternate: quiet (nobody takes the current stream) and contended (`readers` readers
// each take the current stream of the same call, `pauseMs` apart, from before the release until it
// settles).
import { setTimeout as sleep } from 'node:timers/promises'
import { onReleaseTree, type ReleaseTree } from '../support/release-tree.ts'
import {
  heldAnswer,
  loginAccess,
  modelRuntime,
  newestMainCall,
  publicStream,
  type LoginAccess,
} from './public-stream-support.ts'

const rounds = Number(process.argv[2] ?? '5')
if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error('give a positive round count')
const readers = Number(process.argv[3] ?? '1')
const pauseMs = Number(process.argv[4] ?? '1')
const print = (line: string) => process.stdout.write(`${line}\n`)
const now = () => performance.now()

async function until<T>(read: () => Promise<T> | T, done: (value: T) => boolean, pauseMs: number) {
  const end = now() + 60_000
  for (;;) {
    const value = await read()
    if (done(value)) return value
    if (now() > end) throw new Error('timed out')
    await sleep(pauseMs)
  }
}

async function round(
  tree: ReleaseTree,
  gateway: ReturnType<typeof heldAnswer>,
  access: LoginAccess,
  contended: boolean,
): Promise<Readonly<{ ms: number; reads: number }>> {
  const session = await tree.startSession('say hello')
  const reference = await until(
    () => newestMainCall(tree.scope, access, session),
    r => r !== null,
    2,
  )
  if (reference === null) throw new Error('unreachable')
  await until(
    () => gateway.held(),
    held => held > 0,
    2,
  )
  const { references } = publicStream(tree.scope)
  if (references === undefined) throw new Error('no public stream')
  const runtime = modelRuntime(tree.scope)
  let reading = contended
  let reads = 0
  const reader = async () => {
    while (reading) {
      await references.current({ access, reference })
      reads += 1
      if (pauseMs > 0) await sleep(pauseMs)
      else await new Promise(resolve => setImmediate(resolve))
    }
  }
  const readersDone = Promise.all(Array.from({ length: readers }, () => reader()))
  await sleep(50)
  const released = now()
  gateway.release()
  await until(
    () => runtime.calls.inspect({ ...access, reference }),
    answer => 'ok' in answer && answer.ok.kind === 'found' && answer.ok.state.phase === 'settled',
    5,
  )
  const ms = now() - released
  reading = false
  await readersDone
  return { ms, reads }
}

function summary(values: readonly number[]): string {
  const sorted = [...values].sort((a, b) => a - b)
  const median = sorted[Math.floor((sorted.length - 1) / 2)]!
  return `median ${median.toFixed(1)} ms, max ${sorted[sorted.length - 1]!.toFixed(1)} ms; each ${values.map(v => v.toFixed(1)).join(', ')}`
}

const gateway = heldAnswer('Hello', ' world')
await onReleaseTree({ script: gateway.script }, async tree => {
  const access = await loginAccess(tree)
  const quiet: number[] = []
  const contended: number[] = []
  for (let index = 0; index < rounds * 2; index += 1) {
    const busy = index % 2 === 1
    const result = await round(tree, gateway, access, busy)
    ;(busy ? contended : quiet).push(result.ms)
    print(
      `round ${String(index + 1)} ${busy ? 'contended' : 'quiet    '}: release to settled ${result.ms.toFixed(1)} ms${busy ? `, ${String(result.reads)} current reads` : ''}`,
    )
  }
  print(`quiet:     ${summary(quiet)}`)
  print(`contended: ${summary(contended)}`)
})
process.exit(0)
