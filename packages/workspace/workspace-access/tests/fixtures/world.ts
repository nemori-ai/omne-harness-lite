import type {
  AccessContribution,
  AnswerOf,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import { createCatalog, createGovernance, createManagementTypes } from '@omne-harness/workspace'
import { createWorkspaceContribution, type WorkspaceFaces } from '@omne-harness/workspace-access'
import { workspaceProtocol, type WorkspaceProtocol } from '@omne-harness/workspace-protocol'
import {
  createMemoryStore,
  fakeAuthority,
  fakeMinting,
  fakeWorld,
} from '@omne-harness/workspace/testing'

const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}

const tenantText = (account: string) =>
  JSON.stringify({ organization: 'org_00000000000000000000000000', account })
export const TENANT = tenantText('acc_00000000000000000000000000')
export const OTHER = tenantText('acc_00000000000000000000000001')

export type Operations = WorkspaceProtocol['operations']
export type Name = keyof Operations
type Handlers = AccessContribution<WorkspaceProtocol>['operations']
export const NAMES = Object.keys(workspaceProtocol.operations) as Name[]

function tree(value: unknown) {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new Error('sample is not JSON')
  return read.value
}

/** Reads a wire sample by the codec of the operation, as the entry does before it calls a handler. */
function bodyOf(name: Name, sample: unknown) {
  const read = workspaceProtocol.operations[name].body.read(tree(sample), limits)
  if (!read.ok) throw new Error(`${name} sample did not read`)
  return read.value as never
}

/** Writes an answer by the codec of its outcome: an answer the protocol cannot carry fails here. */
function wire<K extends Name>(name: K, answer: AnswerOf<Operations[K]>) {
  if (!('body' in answer)) return { outcome: answer.outcome }
  const codec = (workspaceProtocol.operations[name].outcomes as Record<string, unknown>)[
    answer.outcome
  ] as { write(value: unknown, limits: JsonLimits): { ok: boolean; value?: never } }
  const written = codec.write(answer.body, limits)
  if (!written.ok || written.value === undefined) throw new Error(`${answer.outcome} did not write`)
  return { outcome: answer.outcome, body: JSON.parse(writeJsonText(written.value)) as unknown }
}

type LoginAnswer = 'acting' | 'denied' | 'basis-unavailable' | 'throws'

/** The handlers over the real domain on a memory store, with a fake world of addresses behind it. */
export function world() {
  const things = fakeWorld()
  const store = createMemoryStore()
  const authority = fakeAuthority()
  const types = createManagementTypes()
  types.contribute(things.type('plain'))
  const deps = { authority, store, types, minting: fakeMinting(), node: 'node-1' }
  const real: WorkspaceFaces = { governance: createGovernance(deps), catalog: createCatalog(deps) }
  const state = {
    login: 'acting' as LoginAnswer,
    faces: real as WorkspaceFaces | undefined,
    logins: [] as string[],
  }
  const principal = { principal: 'issued' } as unknown as Principal
  const contribution = createWorkspaceContribution({
    principals: {
      async actingFor(_login, tenant) {
        state.logins.push(tenant)
        if (state.login === 'throws') throw new Error('identity is down')
        return state.login === 'acting' ? { ok: principal } : { refused: state.login }
      },
    },
    faces: () => state.faces,
  })
  const context = {
    principal: {} as LoginIdentity,
    messageId: 'm-1',
    signal: new AbortController().signal,
  }

  async function call<K extends Name>(name: K, sample: Record<string, unknown>, tenant = TENANT) {
    const handler = contribution.operations[name] as Handlers[K]
    const answer = await handler(context as never, bodyOf(name, { tenant, ...sample }))
    return wire(name, answer as AnswerOf<Operations[K]>)
  }

  return { things, store, authority, state, real, principal, contribution, call }
}
