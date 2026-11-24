// AS-28: of a secret, whoever acts for the tenant is told whether it is set, and nothing else.
import { expect, it } from 'vitest'
import { presenceOf } from '../../../src/rows/settings/index.ts'
import type { SecretItemInput, SecretSettings } from '../../../src/rows/settings/ports.ts'

const asked = { principal: 'p', tenant: 't', asset: { name: 'docs' }, item: 'credential' }
const input = asked as unknown as SecretItemInput
const facing = (describe: SecretSettings['describe']) => ({ describe })

it.each(['available', 'unset', 'revoked', 'unreadable'] as const)(
  'a secret that reads %s is told as that state',
  async own => {
    const seen: unknown[] = []
    const face = facing(async given => {
      seen.push(given)
      return { kind: 'described', item: { kind: 'secret', own, value: 'never-told' } } as never
    })
    expect(await presenceOf(face, input)).toBe(own)
    expect(seen).toEqual([asked])
  },
)

it.each(['denied', 'not-visible', 'conflict', 'unavailable'] as const)(
  'a read answered %s is not readable',
  async kind => {
    expect(
      await presenceOf(
        facing(async () => ({ kind })),
        input,
      ),
    ).toBe('unreadable')
  },
)

it('a read that throws is not readable', async () => {
  const face = facing(async () => {
    throw new Error('down')
  })
  expect(await presenceOf(face, input)).toBe('unreadable')
})
