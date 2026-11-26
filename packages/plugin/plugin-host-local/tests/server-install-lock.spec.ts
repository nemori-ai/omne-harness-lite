import { describe, expect, it } from 'vitest'
import { serverInstall, type ServerInstallPorts } from '../src/server-install.ts'

const member = { point: 'access.protocols', key: 'usage/v1', module: 'protocol.js', export: 'make' }
const files = [{ path: 'protocol.js', digest: 'sha256:x', bytes: 1 }]

function ports(lockedBy: ServerInstallPorts['lockedBy']) {
  const calls: string[] = []
  const given: ServerInstallPorts = {
    scope: ['tenant', 'alice'],
    point: () => ({ kind: 'takes', takes: 'code', when: 'running' }),
    guestForm: () => made => made,
    needs: () => ({
      kind: 'adopted',
      bind: () => ({ ports: {}, close: () => undefined }) as never,
    }),
    async load() {
      calls.push('load')
      return { make: () => ({}) }
    },
    async put() {
      calls.push('put')
      return () => undefined
    },
    ...(lockedBy === undefined ? {} : { lockedBy }),
  }
  return { given, calls }
}

describe('一份 plugin 的成员撞上带锁的键', () => {
  it('不装：原因写明被哪一份锁住；它的代码不装入，也不往登记表放', async () => {
    const { given, calls } = ports((point, key) =>
      point === 'access.protocols' && key === 'usage/v1' ? 'usage-access' : undefined,
    )
    const outcome = await serverInstall(given)({ members: [member], needs: [], files } as never)
    expect(outcome).toEqual({
      kind: 'failed',
      reason:
        'member 1 (access.protocols usage/v1): the key is locked by usage-access: an entry of the deployment holds it and a tenant cannot replace it',
    })
    expect(calls).toEqual([])
  })

  it('键上没有锁：照常装', async () => {
    const { given, calls } = ports(() => undefined)
    const outcome = await serverInstall(given)({ members: [member], needs: [], files } as never)
    expect(outcome.kind).toBe('installed')
    expect(calls).toEqual(['load', 'put'])
  })
})
