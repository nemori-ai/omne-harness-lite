import { describe, expect, it } from 'vitest'
import { accountPreferences } from '../src/model/preferences.ts'

const client = (answers: Record<string, unknown>) => {
  const asked: unknown[] = []
  const call = (name: string) => async (body: unknown) => {
    asked.push([name, body])
    const answer = answers[name]
    if (answer instanceof Error) throw answer
    return answer
  }
  return {
    asked,
    port: accountPreferences({
      'read-account-preference': call('read-account-preference'),
      'write-account-preference': call('write-account-preference'),
    } as never),
  }
}

describe('the account preferences the identity interface lends (C16)', () => {
  it('reads and writes under a name, and tells a conflict with the revision now', async () => {
    const { port, asked } = client({
      'read-account-preference': { outcome: 'succeeded', body: { value: '{}', revision: '2' } },
      'write-account-preference': { outcome: 'conflict', body: { revision: '3' } },
    })
    expect(await port.read('keys.mac')).toEqual({ kind: 'read', value: '{}', revision: '2' })
    expect(await port.write('keys.mac', '{"a":1}', '2')).toEqual({
      kind: 'conflict',
      revision: '3',
    })
    expect(asked).toEqual([
      ['read-account-preference', { name: 'keys.mac' }],
      ['write-account-preference', { name: 'keys.mac', value: '{"a":1}', expected: '2' }],
    ])
  })

  it('a refusal or a call that never came back is a failure in words, never a value', async () => {
    const { port } = client({
      'read-account-preference': { outcome: 'denied' },
      'write-account-preference': new Error('offline'),
    })
    expect(await port.read('keys.mac')).toEqual({
      kind: 'failed',
      why: '账号偏好没有读写成（denied）',
    })
    expect(await port.write('keys.mac', '{}', '0')).toEqual({
      kind: 'failed',
      why: '账号偏好没有读写成（unavailable）',
    })
  })
})
