import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { judgeMetaCommand, type SessionCommandReads } from '../../src/entry/meta-capabilities.ts'

const access = { principal: 'p', tenant: 't', session: 's' } as never

function reads(humanInteraction: boolean | 'unreadable') {
  const asked: unknown[] = []
  const read: SessionCommandReads = {
    interaction: async given => {
      asked.push(given)
      return humanInteraction === 'unreadable'
        ? fail('the session is gone')
        : succeed({ humanInteraction })
    },
  }
  return { read, asked }
}

describe('a command that would ask a person', () => {
  it('is open without reading the session when it asks no person', async () => {
    const { read, asked } = reads(false)
    expect(await judgeMetaCommand(read, access, 'Shell', 'execute')).toEqual({ kind: 'open' })
    expect(await judgeMetaCommand(read, access, 'Ask', null)).toEqual({ kind: 'open' })
    expect(asked).toEqual([])
  })

  it('is open while the session lets the agent ask a person, and closed with a sentence when it does not', async () => {
    const open = reads(true)
    expect(await judgeMetaCommand(open.read, access, 'Ask', 'ask')).toEqual({ kind: 'open' })
    expect(open.asked).toEqual([access])
    const closed = reads(false)
    expect(await judgeMetaCommand(closed.read, access, 'Ask', 'ask')).toEqual({
      kind: 'closed',
      answer: expect.stringMatching(/^Ask: the command "ask" is not available now\. /),
    })
  })

  it('answers unreadable when the session cannot be read', async () => {
    const { read } = reads('unreadable')
    expect(await judgeMetaCommand(read, access, 'Ask', 'ask')).toEqual({
      kind: 'unreadable',
      diagnostic: 'the human interaction of the session is unreadable: the session is gone',
    })
  })
})
