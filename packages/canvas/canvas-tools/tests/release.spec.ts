import { expect, it } from 'vitest'
import {
  DEFAULT_RELEASE_DETAIL_POLICY,
  judgeReleaseDescription,
} from '@omne-harness/tool-contract/provider'
import { checkReleaseDescription } from '@omne-harness/tool-contract/testing'
import { author, domain, media, personOf, TENANT } from './world.ts'

const tool = author()
const slotOf = (command: string) =>
  tool.registration.operations.find(([name]) => name === command)?.[1]

it('describes lock and unlock alone, for a person who releases them once the gate asks', () => {
  const describing = tool.registration.operations
    .filter(([, operation]) => operation.describeRelease != null)
    .map(([name]) => name)
  expect(describing).toEqual(['lock', 'unlock'])
})

it.each([
  ['lock', '锁上'],
  ['unlock', '解开'],
] as const)(
  '%s is described as what it does and to which items, and reads nothing',
  async (command, doing) => {
    const decoded = tool.decode(command, { items: ['i1', 'i2'] })
    if ('failure' in decoded) throw new Error(JSON.stringify(decoded.failure))
    const d = domain()
    await d.canvas.place(personOf(TENANT), { canvas: 'main', reference: media('a') })
    const checked = await checkReleaseDescription(
      slotOf(command)!.describeRelease!,
      {
        principal: 'agent',
        tenant: TENANT as never,
        arguments: decoded.ok,
        signal: new AbortController().signal,
      },
      { state: async () => d.canvas.look(personOf(TENANT), { canvas: 'main' }) },
    )
    if ('failure' in checked) throw new Error(checked.failure)
    expect(
      judgeReleaseDescription(checked.ok, undefined, DEFAULT_RELEASE_DETAIL_POLICY),
    ).toHaveProperty('ok')
    expect(checked.ok.rows).toEqual([
      { label: '要做的', value: doing },
      { label: '画布项', value: ['i1', 'i2'] },
    ])
  },
)
