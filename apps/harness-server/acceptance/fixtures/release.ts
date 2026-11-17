import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  historyOf,
  toolCallFacts,
  type Entry,
  type ReleaseTree,
} from '../../tests/support/release-tree.ts'

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

export const history = (tree: ReleaseTree, session: string): Promise<readonly Entry[]> =>
  historyOf(tree, session)

export const kinds = (entries: readonly Entry[]): string[] => entries.map(entry => entry.kind)

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
  const listed = await omne(tree, ['calls', 'list', '--session', session])
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
