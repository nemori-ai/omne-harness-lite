// When the session-log Journal reads the common root of a session (SPEC「已发布计数由本进程保管」).
// The publication count has one writer in a process: the publications of the Journal providers
// over one storage. So what they published and read is the count, and a call reads the root only
// when the process cannot know it: nothing was read yet, a publication did not answer plainly, or
// the last confirmation by the storage is older than the bound. On the node:sqlite double that
// records every handler read.
import { afterEach, expect, it, vi } from 'vitest'
import { ok } from './fixtures/common-journal.ts'
import { admitted, applied, load, opened, prepared } from './fixtures/main-reply.ts'
import type { SqlScene } from './fixtures/sql-scene.ts'

const ROOT = 'session.history-root'
const rootReads = (s: SqlScene): number =>
  (s.controls?.reads ?? []).filter(handler => handler === ROOT).length

afterEach(() => {
  vi.useRealTimers()
})

/** A scene whose provider published once: the main reply Ja. */
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
  // The lost reply committed: the root read confirms the count, and the calls after it trust it.
  const confirmed = rootReads(s)
  await load(s)
  expect(rootReads(s)).toBe(confirmed)
})

it('the storage confirms the count again after the bound: one root read, then none', async () => {
  // Only the monotonic clock is faked, and before the scene: every instant is on the same clock.
  vi.useFakeTimers({ toFake: ['performance'] })
  const { s, ja } = await published('root-aged')
  ok(await s.view.journal.commit(ja))
  await load(s)
  const before = rootReads(s)
  vi.advanceTimersByTime(1_001)
  await load(s)
  await load(s)
  expect(rootReads(s)).toBe(before + 1)
})
