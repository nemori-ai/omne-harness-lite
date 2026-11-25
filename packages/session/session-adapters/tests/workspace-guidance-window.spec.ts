import { describe, expect, it } from 'vitest'
import type { Message } from '@omne-harness/message'
import { guidanceBlocks } from '../src/cordis/guidance-window.ts'

describe('directory guidance in the current model view', () => {
  it('restores exactly the missing source after compaction and keeps equal text at different paths distinct', () => {
    const source = (path: string) => ({ path, digest: 'sha256:example', text: 'same text' })
    const root = source('AGENTS.md'),
      leaf = source('pay/AGENTS.md')
    const scope = {
      state: 'attached' as const,
      workspace: 'A',
      instance: '1',
      root: '/A',
      sources: [root, leaf],
    }
    const first = guidanceBlocks(scope, [], 'tenant/session')
    expect(first).toHaveLength(3)
    const held = (blocks: typeof first) =>
      [{ role: 'system_reminder', id: 'msg_1', blocks }] as unknown as Message[]
    expect(guidanceBlocks(scope, held(first), 'tenant/session')).toEqual([])
    const deficit = guidanceBlocks(scope, held(first.slice(0, 2)), 'tenant/session')
    expect(deficit).toEqual([first[2]])
    const truncated = first.map((b, i) => (i === 1 ? { ...b, text: b.text.slice(0, -1) } : b))
    expect(guidanceBlocks(scope, held(truncated), 'tenant/session')).toEqual([first[1]])
    const foreign = { ...scope, workspace: 'B' }
    expect(guidanceBlocks(foreign, held(first), 'tenant/session')).toHaveLength(3)
  })
})

it('reuses a retained body when switching back and publishes a changed file only once', () => {
  const current = (workspace: string, text: string) => ({
    state: 'attached' as const,
    workspace,
    instance: workspace,
    root: '/work/' + workspace,
    sources: [{ path: 'AGENTS.md', digest: 'sha256:' + text, text }],
  })
  const view: Message[] = []
  const deliver = (scope: ReturnType<typeof current>, tenant = 'tenant/session') => {
    const blocks = guidanceBlocks(scope, view, tenant)
    const [first, ...rest] = blocks
    if (first !== undefined)
      view.push({
        role: 'system_reminder',
        id: 'msg_test' as Message['id'],
        blocks: [first, ...rest],
      })
    return blocks
  }
  const a = current('A', 'same')
  const b = current('B', 'same')
  expect(deliver(a)).toHaveLength(2)
  expect(deliver(b)).toHaveLength(2)
  expect(deliver(a)).toHaveLength(1)
  expect(deliver(a)).toHaveLength(0)
  const next = current('A', 'changed')
  expect(deliver(next)).toHaveLength(2)
  expect(deliver(next)).toHaveLength(0)
  expect(deliver(next, 'other/session')).toHaveLength(2)
})
