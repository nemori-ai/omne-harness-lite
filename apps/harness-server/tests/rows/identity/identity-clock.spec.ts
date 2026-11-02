// `identityClock` 入口对象：identity `./cordis` 的时钟定义（R1-D27），读宿主系统时间。用例经服务键调用。
import { describe, expect, it } from 'vitest'
import { IdentityClockService, identityClockKey } from '@omne-harness/identity/cordis'
import { compareInstants, encodeInstant, parseInstant } from '@omne-harness/utc-instant'
import { identityClock } from '../../../src/entry/identity-clock.ts'
import { fixtureEnv, got } from '../../entry/support.ts'

describe('identityClock (IdentityClock shape)', () => {
  it('is a real entry object under the identity key and registers no shutdown handle', () => {
    expect(identityClock).toMatchObject({ name: identityClockKey, implementation: 'real' })
    expect(identityClock.registersFor ?? []).toEqual([])
  })

  it('installs the identity definition and reads a UTC instant that does not go backwards', async () => {
    const fixture = fixtureEnv([])
    await fixture.install(identityClock)
    const clock = got(fixture.root.get(identityClockKey), 'identityClock')
    expect(clock).toBeInstanceOf(IdentityClockService)
    const first = await clock.now()
    if (first.kind !== 'read') throw new Error(`reading failed: ${first.diagnostic}`)
    expect(parseInstant(encodeInstant(first.instant)).ok).toBe(true)
    const second = await clock.now()
    if (second.kind !== 'read') throw new Error(`reading failed: ${second.diagnostic}`)
    expect(compareInstants(first.instant, second.instant)).not.toBe(1)
  })
})
