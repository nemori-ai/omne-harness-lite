import type { AnswerOf } from '@omne-harness/access-cordis-contract'
import {
  humanInterventionProtocol,
  type HumanInterventionProtocol,
} from '@omne-harness/human-intervention-protocol'
import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import { loginIdentity, type FixtureLogin } from './world.ts'

export const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}

export type Operations = HumanInterventionProtocol['operations']
export type Name = keyof Operations

export function tree(value: unknown) {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new Error('sample is not JSON')
  return read.value
}

export function wire<K extends Name>(name: K, answer: AnswerOf<Operations[K]>) {
  if (!('body' in answer)) return { outcome: answer.outcome }
  const codec = (humanInterventionProtocol.operations[name].outcomes as Record<string, unknown>)[
    answer.outcome
  ] as { write(value: unknown, limits: JsonLimits): { ok: boolean; value?: never } }
  const written = codec.write(answer.body, limits)
  if (!written.ok || written.value === undefined) throw new Error(`${answer.outcome} did not write`)
  return { outcome: answer.outcome, body: JSON.parse(writeJsonText(written.value)) as unknown }
}

export function bodyOf<K extends Name>(name: K, sample: Record<string, unknown>) {
  const read = humanInterventionProtocol.operations[name].body.read(tree(sample), limits)
  if (!read.ok) throw new Error(`${name} sample did not read`)
  return read.value as never
}

const signal = new AbortController().signal
export const as = (login: FixtureLogin) => ({
  principal: loginIdentity(login),
  messageId: 'm-1',
  signal,
})
