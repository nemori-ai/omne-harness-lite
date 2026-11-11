// 段的派生身份：装配只凭等待身份找回保管等待请求的操作，凭别的身份找不回。
import { expect, it } from 'vitest'
import { decodeToolWaitId } from '@omne-harness/tool-contract/provider'
import { waitRequestOperation } from '@omne-harness/tool-host-local'
import { unbox } from './author-values.ts'

it('derives the request operation of a segment wait from the start that names it', () => {
  const wait = unbox(decodeToolWaitId('call-1/start/1/wait'))
  expect(unbox(waitRequestOperation(wait))).toBe('call-1/start/1/wait-request')
})

it('refuses a wait that no segment of this host named', () => {
  for (const text of ['call-1/start/1', 'call-1/start/1/wait/x', '/wait'])
    expect(waitRequestOperation(unbox(decodeToolWaitId(text)))).toEqual({
      failure: { field: 'wait', reason: 'not-a-segment-wait' },
    })
})

it('refuses a wait whose request operation would be no legal identity', () => {
  const wait = unbox(decodeToolWaitId(`${'a'.repeat(250)}/wait`))
  expect(waitRequestOperation(wait)).toMatchObject({ failure: { reason: 'length' } })
})
