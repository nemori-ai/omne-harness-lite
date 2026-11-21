import { DatabaseSync } from 'node:sqlite'
import { unpackText } from '@omne-harness/sql-contract/worker'
import type { ToolStartAuthority } from '@omne-harness/tool-contract/provider'
import { toolStartAuthorityKey } from '@omne-harness/tool-cordis-contract/cordis'
import { expect } from 'vitest'
import { SHELL, faceOf } from '../../governance/tenant-settings-support.ts'
import { loginAccess } from '../../model/public-stream-support.ts'
import {
  historyOf,
  pollUntil,
  sqliteFiles,
  toolCallsByRequest,
  type ReleaseTree,
} from '../../support/release-tree.ts'

/** The history kind of an authorization a person expressed on a card. */
export const ONCE = 'session.authorization-expressed'

/** Holds the first start of a call of the named tool until `go`; the call stays live meanwhile. */
export function holdStart(tree: ReleaseTree, tool: string) {
  const authority = tree.scope.get(toolStartAuthorityKey) as ToolStartAuthority<unknown> | undefined
  if (authority === undefined) throw new Error('no start authority installed')
  const consume = authority.consume.bind(authority)
  const released = Promise.withResolvers<void>()
  let held = 0
  Object.assign(authority, {
    consume: async (input: Parameters<typeof consume>[0]) => {
      if (held === 0 && input.request.availability.definition.name === tool) {
        held += 1
        await released.promise
      }
      return consume(input)
    },
  })
  return { held: () => held, go: () => released.resolve() }
}

const RELEASED = 'action-current-permission'

export type AdmittedRelease = Readonly<{
  by: string
  grant: Readonly<{ via: string; source?: Readonly<Record<string, unknown>> }> | null
}>

function storedText(cell: unknown): string | null {
  if (typeof cell === 'string') return cell
  if (!(cell instanceof Uint8Array)) return null
  try {
    return unpackText(cell)
  } catch {
    return null
  }
}

function storedJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function admittedReleases(storageRoot: string): readonly AdmittedRelease[] {
  const found = new Map<string, AdmittedRelease>()
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) return
    const record: unknown = Reflect.get(value, 'record')
    if (typeof record === 'string' && record.includes(RELEASED)) {
      const parsed = storedJson(record) as (AdmittedRelease & { decision?: string }) | undefined
      if (parsed?.decision === RELEASED)
        found.set(record, { by: parsed.by, grant: parsed.grant ?? null })
    }
    for (const member of Object.values(value)) visit(member)
  }
  for (const file of sqliteFiles(storageRoot)) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
      for (const table of tables)
        for (const row of db.prepare(`SELECT * FROM "${String(table['name'])}"`).all())
          for (const cell of Object.values(row)) {
            const text = storedText(cell)
            if (text?.includes(RELEASED)) visit(storedJson(text))
          }
    } finally {
      db.close()
    }
  }
  return [...found.values()]
}

// Each new user message asks for one call, so one session holds several calls of the same tool.
const perMessage = (through: 'Shell' | 'Tools') =>
  toolCallsByRequest(body => {
    const messages = (JSON.parse(body) as { messages?: { role: string; content: unknown }[] })
      .messages
    const last = messages?.at(-1)
    const label =
      last?.role === 'user'
        ? /start: echo ([a-z0-9-]+)/.exec(JSON.stringify(last.content))?.[1]
        : undefined
    const batch =
      last?.role === 'user'
        ? /start: batch ([a-z0-9-]+)/.exec(JSON.stringify(last.content))?.[1]
        : undefined
    const info =
      last?.role === 'user'
        ? /start: info ([a-z0-9-]+)/.exec(JSON.stringify(last.content))?.[1]
        : undefined
    if (info !== undefined)
      return [
        {
          id: `call_${info}`,
          tool: 'Shell',
          arguments: JSON.stringify({ command: 'info', intent: 'test call', params: {} }),
        },
      ]
    if (batch !== undefined)
      return [1, 2, 3].map(n => ({
        id: `call_${batch}_${String(n)}`,
        tool: 'Shell',
        arguments: JSON.stringify({
          command: 'execute',
          intent: 'test call',
          params: { script: `echo ${batch}-${String(n)}-done` },
        }),
      }))
    if (label === undefined) return []
    // Tools forwards only the business arguments, so it carries a command that needs no intent.
    const params =
      through === 'Shell'
        ? // A label that starts with slow- keeps its call running for a while.
          { script: `${label.startsWith('slow-') ? 'sleep 12; ' : ''}echo ${label}-done` }
        : { name: 'TodoItems', command: 'add', arguments: { text: `${label}-done` } }
    const call = JSON.stringify({ command: 'execute', intent: 'test call', params })
    return [{ id: `call_${label}`, tool: through, arguments: call }]
  })

export const perMessageShell = perMessage('Shell')
/** A TodoItems call carried by Tools: TodoItems must be nonresident in the tree. */
export const perMessageTodoThroughTools = perMessage('Tools')

/** The one release card the session waits on. */
export async function pendingCard(tree: ReleaseTree, session: string, what: string) {
  const [item] = await pollUntil(
    `the release card of ${what}`,
    () => tree.cards({ sessionRef: session, states: ['pending'] }),
    cards => cards.length === 1,
  )
  if (item === undefined) throw new Error('no card')
  return item.card
}

type Card = Awaited<ReturnType<typeof pendingCard>>

/** Answers the card as a person does, through the CLI. */
export async function answerCard(
  tree: ReleaseTree,
  card: Card,
  reply: readonly string[],
  replyId: string,
) {
  const base = ['submit-reply', '--request', card.ref.request.requestId, '--card', card.ref.cardId]
  const answer = await tree.cli([
    ...base,
    '--revision',
    card.revision,
    ...reply,
    '--reply-id',
    replyId,
  ])
  expect(answer.status, answer.stderr).toBe(0)
}

/** Sets the tenant's value of the Shell run gate, as a person does in the settings. */
export function setShell(tree: ReleaseTree, pick: 'deny' | 'ask' | 'auto', operation: string) {
  return setGate(tree, SHELL, 'run', pick, operation)
}

/** Sets the tenant's value of one gate of a released tool, as a person does in the settings. */
export async function setGate(
  tree: ReleaseTree,
  owner: Readonly<{ kind: 'asset'; category: 'tool'; name: string }>,
  gate: string,
  pick: 'deny' | 'ask' | 'auto',
  operation: string,
) {
  const face = faceOf(tree)
  const { principal, tenant } = await loginAccess(tree)
  const item = { principal, tenant, owner, item: gate }
  const before = await face.describe(item)
  if (before.kind !== 'described') throw new Error(JSON.stringify(before))
  const written = await face.set({
    ...item,
    operation,
    expectedRevision: before.item.revision,
    value: { kind: 'permission', pick },
  })
  expect(written).toMatchObject({ kind: 'written' })
}

export async function sendInput(tree: ReleaseTree, session: string, text: string) {
  const sent = await tree.cli(['send-input', '--session', session, '--text', text])
  expect(sent.status, sent.stderr).toBe(0)
}

/** The history once the session has ended that many Runs. */
export function endedRuns(tree: ReleaseTree, session: string, runs: number) {
  return pollUntil(
    `Run ${String(runs)} of the session to end`,
    () => historyOf(tree, session),
    value => value.filter(entry => entry.kind === 'run.terminal').length === runs,
  )
}
