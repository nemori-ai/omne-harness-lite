import { expect, it } from 'vitest'
import { ok } from './fixtures/common-journal.ts'
import { admitted, applied, load, opened, prepared } from './fixtures/main-reply.ts'
import type { SqlScene } from './fixtures/sql-scene.ts'

const ROOT = 'session.history-root'
const rootReads = (s: SqlScene): number =>
  (s.controls?.reads ?? []).filter(handler => handler === ROOT).length

async function published(name: string) {
  const { s, authority } = await opened(name)
  const request = await prepared(s, authority, 'model-reply')
  const ja = await applied(s, authority, request, admitted(request))
  return { s, authority, ja }
}

it('a call on a session this process published or read does not read the root again', async () => {
  const { s, ja } = await published('root-warm')
  ok(await s.view.journal.commit(ja))
  const before = rootReads(s)
  const first = await load(s)
  expect((await load(s)).revision).toBe(first.revision)
  expect(rootReads(s)).toBe(before)
})

it('a publication of another provider over the same storage is seen at the next call, without a root read', async () => {
  const { s, ja } = await published('root-shared')
  const behind = (await load(s)).revision
  ok(await s.fresh().journal.commit(ja))
  const before = rootReads(s)
  expect((await load(s)).revision).not.toBe(behind)
  expect(rootReads(s)).toBe(before)
})

it('a publication whose outcome is unknown makes the next call read the root', async () => {
  const { s, ja } = await published('root-unknown')
  s.controls?.loseNextReply()
  const answer = await s.view.journal.commit(ja)
  expect('failure' in answer && answer.failure.kind).toBe('commit-unknown')
  const before = rootReads(s)
  await load(s)
  expect(rootReads(s)).toBeGreaterThan(before)
  const confirmed = rootReads(s)
  await load(s)
  expect(rootReads(s)).toBe(confirmed)
})
