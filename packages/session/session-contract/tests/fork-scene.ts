import { judgeMessage, type Message } from '@omne-harness/message'
import type {
  ForkPoint,
  InputId,
  ModelViewRow,
  SessionCreation,
} from '@omne-harness/session-contract'
import {
  creation,
  evidence,
  operationId,
  ordinaryInput,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { open, participation, scene } from './scene.ts'

export type Scene = ReturnType<typeof scene>
const VISIBLE = { toHuman: true, toModel: true }

export const asking = (name: string, calls: readonly string[]): Message =>
  ({
    id: `msg_assistant000000000000${name}`,
    role: 'assistant',
    blocks: calls.map(callId => ({
      kind: 'tool_call',
      id: `${callId}/call`,
      visibility: VISIBLE,
      callId,
      name: 'Ask',
      arguments: { kind: 'object', entries: [] },
    })),
  }) as unknown as Message

export const answering = (callId: string): Message =>
  ({
    id: `msg_tool0000000000000000${callId}`,
    role: 'tool',
    blocks: [
      { kind: 'tool_result', id: `${callId}/result`, visibility: VISIBLE, callId },
      { kind: 'text', id: `${callId}/text`, visibility: VISIBLE, text: 'done' },
    ],
  }) as unknown as Message

export async function record(s: Scene, name: string, message: Message) {
  const { run } = await s.active()
  return s.commit({
    kind: 'recordMessage',
    input: {
      ...s.base,
      operation: operationId(`message-${name}`),
      participation: {
        ...participation(run.execution.execution, 'message'),
        operation: `agent-message-${name}`,
      },
      value: {
        message,
        source: evidence(`agent/source/${name}`),
        admission: evidence(`agent/admission/${name}`),
        consumption: null,
      },
    },
  })
}

export async function deliver(s: Scene, name: string, inputs: readonly string[]) {
  const { run } = await s.active()
  return s.commit({
    kind: 'recordMessage',
    input: {
      ...s.base,
      operation: operationId(`deliver-${name}`),
      participation: {
        ...participation(run.execution.execution, 'delivered'),
        operation: `agent-deliver-${name}`,
      },
      value: {
        deliveries: inputs.map(input => ({
          input: input as InputId,
          message: ordinaryInput(input).message,
        })),
        source: evidence(`agent/step/${name}`),
        admission: evidence(`agent/step/${name}`),
      },
    },
  })
}

/** Tells the model something outside a Run: one more row of the view. */
export async function remind(s: Scene, name: string) {
  const reminder = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'system_reminder',
    blocks: [{ kind: 'text', id: name, text: name, visibility: { toHuman: false, toModel: true } }],
  })
  if (!('ok' in reminder)) throw new Error('the reminder fixture is invalid')
  return s.commit({
    kind: 'commitDerived',
    input: {
      ...s.base,
      operation: operationId(`remind-${name}`),
      expected: (await s.read()).revision,
      value: { kind: 'context-reminder', message: reminder.ok, source: evidence(name) },
    },
  })
}

/** Compacts through `to`, keeping what the open work of the session still needs to see. */
export async function compact(s: Scene, name: string, from: string, to: string) {
  const { run } = await s.active()
  const current = await view(s)
  const context = succeeded(
    await s.port.history.readCompactionContext({
      ...s.access,
      basis: current.basis,
      coverTo: to as never,
    }),
    'compaction context',
  )
  if (context.kind !== 'context') throw new Error('a compaction context is expected')
  const open = new Set<string>(context.value.open)
  const retained = context.value.covered
    .filter(row => row.message !== null && open.has(row.ref))
    .map(row => row.ref)
  const candidate = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'compaction',
    blocks: [{ kind: 'text', id: name, visibility: VISIBLE, text: name }],
    covers: { from, to },
    retained,
    derivation: evidence(name),
  })
  if (!('ok' in candidate) || candidate.ok.role !== 'compaction') throw new Error('bad summary')
  return s.commit({
    kind: 'commitDerived',
    input: {
      ...s.base,
      operation: operationId(name),
      participation: participation(run.execution.execution, 'context-transition'),
      judgment: evidence(name),
      value: { kind: 'compaction', message: candidate.ok, epoch: current.basis.epoch },
    },
  })
}

export async function view(s: Scene) {
  const page = succeeded(
    await s.port.history.readModelView({
      ...s.access,
      basis: null,
      after: null,
      pageBytes: 1_000_000,
    }),
    'view',
  )
  if (page.kind !== 'page') throw new Error('a page of the model view is expected')
  return page
}

export const rows = async (s: Scene): Promise<readonly ModelViewRow[]> => (await view(s)).rows

export const entryIds = (s: Scene): string[] =>
  s.port.controls.entriesOf(s.base.tenant, s.base.session).map(entry => entry.id)

/** The id of the newest assistant message in the view: in these scenes, the one that makes the running call. */
export async function latestAsking(s: Scene): Promise<string> {
  return (await rows(s)).findLast(row => row.message.role === 'assistant')?.message.id ?? 'msg_none'
}

export async function pointOf(s: Scene): Promise<ForkPoint> {
  const asking = await latestAsking(s)
  const read = succeeded(await s.port.history.readForkPoint({ ...s.access, asking }), 'fork point')
  if (read.kind !== 'point') throw new Error('a fork point is expected')
  return read.point
}

/** A session in a step: a user message, a call with its answer, and a second call that is running. */
export async function talking(): Promise<Scene> {
  const s = await open()
  succeeded(await deliver(s, 'one', ['first']), 'deliver')
  succeeded(await record(s, 'ask-1', asking('ask-1', ['k1'])), 'assistant')
  succeeded(await record(s, 'answer-1', answering('k1')), 'tool')
  succeeded(await record(s, 'ask-2', asking('ask-2', ['k2'])), 'assistant')
  return s
}

export const childOf = (
  parent: Scene,
  point: ForkPoint | null,
  overrides: Partial<SessionCreation> = {},
): SessionCreation =>
  creation({
    relation: { kind: 'child', parent: parent.base.session, basis: evidence('dispatch') },
    attendance: 'unattended',
    ...(point === null ? {} : { fork: { source: parent.base.session, point } }),
    ...overrides,
  })

export const createWith = (s: Scene, value: SessionCreation, operation = 'create') =>
  s.commit({
    kind: 'create',
    input: { ...s.base, operation: operationId(operation), creation: value },
  })
