import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  historyOf,
  toolCallFacts,
  toolCalls,
  type Entry,
  type ReleaseTree,
} from '../../tests/support/release-tree.ts'

export { likeARealModel } from '../../tests/support/release-tree.ts'

export const LIMIT_MS = 120_000

/** A one-shot Shell execute that runs in the background until the file `name` exists. */
export function waitingCommand(name: string): string {
  return JSON.stringify({
    command: 'execute',
    intent: 'test call',
    params: {
      script: `while [ ! -f ${name} ]; do sleep 0.1; done; echo ${name}-done`,
      run_in_background: true,
    },
  })
}

/** A one-shot Shell execute in the foreground that runs until the file `name` exists. */
export function foregroundCommand(name: string): string {
  return JSON.stringify({
    command: 'execute',
    intent: `wait for ${name}`,
    params: { script: `while [ ! -f ${name} ]; do sleep 0.1; done; echo ${name}-done` },
  })
}

export function release(tree: ReleaseTree, name: string): void {
  writeFileSync(join(dirname(tree.storageRoot), 'workspace', name), '')
}

/** Reads `read` until `done` holds; the wait is on the condition, never a fixed sleep. */
export async function until<T>(
  what: string,
  read: () => T | Promise<T>,
  done: (value: T) => boolean,
): Promise<T> {
  const end =
    /* wall-clock: operation-timing -- the wait gives up a fixed time after it starts. */ Date.now() +
    LIMIT_MS
  for (; ; await sleep(200)) {
    const value = await read()
    if (done(value)) return value
    if (/* wall-clock: operation-timing -- the wait gives up at its deadline. */ Date.now() > end)
      throw new Error(`${what} did not happen: ${JSON.stringify(value)}`)
  }
}

/** The outcome the last run.terminal entry names. */
export function lastOutcomeOf(entries: readonly Entry[]): string {
  const ended = entries.filter(entry => entry.kind === 'run.terminal').at(-1)
  const terminal = (ended?.payload as { terminal?: { outcome?: unknown } } | undefined)?.terminal
  return String(terminal?.outcome ?? '')
}

export const history = (tree: ReleaseTree, session: string): Promise<readonly Entry[]> =>
  historyOf(tree, session)

/**
 * Waits until the work a scenario started is done: its turns ended, and every Tool call settled
 * with its result handed to its consumer. Only then does a clean stop of the tree say anything.
 */
export async function untilQuiet(tree: ReleaseTree, session: string, turns: number): Promise<void> {
  await until(
    `${String(turns)} turns to end`,
    () => history(tree, session),
    entries =>
      count(entries, 'run.terminal') >= turns &&
      count(entries, 'run.started') === count(entries, 'run.terminal'),
  )
  await until(
    'every call to settle and hand its result over',
    () => toolCalls(tree.storageRoot),
    calls => calls.every(call => call.phase === 'settled' && call.delivery !== 'pending'),
  )
}

export const kinds = (entries: readonly Entry[]): string[] => entries.map(entry => entry.kind)

export const count = (entries: readonly Entry[], kind: string): number =>
  entries.filter(entry => entry.kind === kind).length

/** The Run the last run.started entry names. */
export function lastRunOf(entries: readonly Entry[]): string {
  const started = entries.filter(entry => entry.kind === 'run.started').at(-1)
  return String((started?.payload as { run?: unknown } | undefined)?.run ?? '')
}

/** Sends an urgent input as a person does; the answer says if it interrupted a Run. */
export async function interrupt(tree: ReleaseTree, session: string, text: string) {
  return omne(tree, ['interrupt-input', '--session', session, '--text', text])
}

export function textOf(entry: Entry | undefined): string {
  return JSON.stringify(entry?.payload ?? null)
}

export async function omne(tree: ReleaseTree, args: readonly string[]) {
  const run = await tree.cli(args)
  return {
    ...run,
    json: run.stdout.startsWith('{') ? (JSON.parse(run.stdout) as Record<string, unknown>) : null,
  }
}

/** The background calls of the session, as `omne calls list` reads them. */
export async function backgroundCalls(tree: ReleaseTree, session: string): Promise<string[]> {
  const listed = await omne(tree, ['calls', 'list', '--session', session, '--json'])
  const body = listed.json?.['body'] as { calls?: { producer: { call: string } }[] } | undefined
  return (body?.calls ?? []).map(item => item.producer.call)
}

/** The Tool call id a call reference names. */
export function callOf(reference: string): string {
  return String((JSON.parse(reference) as unknown[])[2])
}

/** What the Tool ledger holds of a call: the arguments it was asked with and how often it started. */
export function factsOf(tree: ReleaseTree, reference: string) {
  const facts = toolCallFacts(tree.storageRoot).get(callOf(reference))
  if (facts === undefined) throw new Error(`the Tool ledger has no call ${callOf(reference)}`)
  return facts
}

export function record(scenario: string, passed: boolean, observed: unknown): void {
  process.stdout.write(
    `${JSON.stringify({ scenario, result: passed ? 'PASS' : 'FAIL', observed })}\n`,
  )
}
