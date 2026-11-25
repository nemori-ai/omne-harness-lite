import { expect, it } from 'vitest'
import type { Message } from '@omne-harness/message'
import type { ModelViewRow, SessionHistory } from '@omne-harness/session-contract'
import { memoryAccess } from '@omne-harness/session-contract/testing'
import { readGuidanceHistory } from '../src/cordis/guidance-history.ts'
import { guidanceBlocks } from '../src/cordis/guidance-window.ts'

it('reads just the appended rows in the same model view and rebuilds visibility in a new epoch', async () => {
  const partition = 'test/session'
  const scope = {
    state: 'attached' as const,
    workspace: 'w',
    instance: 'i',
    root: '/r',
    sources: [{ path: 'AGENTS.md', digest: 'hash', text: 'body' }],
  }
  const [manifest, body] = guidanceBlocks(scope, [], partition)
  const original: Message = {
    role: 'system_reminder',
    id: 'msg_1' as Message['id'],
    blocks: [manifest!, body!],
  }
  let rows: Message[] = [original]
  let epoch = 'one'
  let visited = 0
  const history: Pick<SessionHistory<string>, 'readModelView'> = {
    async readModelView(request) {
      const start = Number(request.after ?? 0)
      const suffix = rows.slice(start)
      visited += suffix.length
      return {
        ok: {
          kind: 'page',
          basis: { epoch, upper: String(rows.length) },
          next: null,
          resume: String(rows.length),
          rows: suffix.map((message, index) => ({
            message,
            seq: String(start + index + 1),
            entry: 'entry' as ModelViewRow['entry'],
            bytes: 4,
            prefixDigest: 'abc',
          })),
        },
      }
    },
  }
  const access = { ...memoryAccess('model-view'), principal: 'reader' }
  const cold = await readGuidanceHistory(history, access, partition)
  if ('failure' in cold) throw new Error(JSON.stringify(cold.failure))
  expect(visited).toBe(1)
  rows.push({ ...original, id: 'msg_2' as Message['id'] })
  const next = await readGuidanceHistory(history, access, partition, cold.ok)
  expect(visited).toBe(2)
  if ('failure' in next) throw new Error(JSON.stringify(next.failure))
  epoch = 'two'
  rows = [{ ...original, blocks: [manifest!] }]
  const fresh = await readGuidanceHistory(history, access, partition, next.ok)
  if ('failure' in fresh) throw new Error(JSON.stringify(fresh.failure))
  expect(fresh.ok.index.sources.has(body!.id)).toBe(false)
})
