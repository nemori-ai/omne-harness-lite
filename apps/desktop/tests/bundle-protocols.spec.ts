import type { ProtocolContract } from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'
import { bundleContracts, bundleProtocolsText } from '../src/shared/bundle-protocols.ts'
import { domainProtocols } from '../src/shared/protocols.ts'

const contract = (name: string, major: number): ProtocolContract => ({
  name,
  major,
  operations: {},
  observations: {},
})
const known = [contract('a', 1), contract('b', 1), contract('b', 2)]

describe('页面包的协议清单', () => {
  it('转发层只转发清单里有、自己也认得的协议', () => {
    const listed = JSON.stringify([
      { name: 'b', major: 2 },
      { name: 'a', major: 1 },
      { name: 'later', major: 1 },
    ])
    expect(bundleContracts(known, listed)).toEqual([known[0], known[2]])
  })

  it('没有清单的包照认得的全量；清单读不成就一条都不转发', () => {
    expect(bundleContracts(known, undefined)).toEqual(known)
    for (const text of ['', '{', '{}', '[{"name":"a"}]', '[{"name":1,"major":1}]'])
      expect(bundleContracts(known, text), text).toEqual([])
  })

  it('构建写出的清单读回来就是这一版页面说的那些协议', () => {
    const text = bundleProtocolsText(domainProtocols)
    expect(bundleContracts(domainProtocols, text)).toEqual(domainProtocols)
    expect(JSON.parse(text)).toContainEqual({ name: 'session', major: 1 })
  })
})
