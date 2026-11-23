import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import { judgeFixedModelRequest } from '@omne-harness/model-contract/provider'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import { KIMI_RECORDS } from '../src/records.ts'
import { FAMILY } from './support/kimi.ts'

const captures = fileURLToPath(new URL('./fixtures/records/', import.meta.url))
const cases = [
  { route: 'moonshotai/kimi-k3.1-pro', required: true, named: false },
  { route: 'moonshotai/kimi-k3', required: true, named: true },
  { route: 'moonshotai/kimi-k2.7-code', required: false, named: false },
]

it.each(cases)('encodes only tool choices the pinned endpoint accepts for $route', async record => {
  const current = KIMI_RECORDS.find(candidate => candidate.name === record.route)
  if (!current) throw new Error(`Missing Kimi record for ${record.route}`)
  const file = join(captures, encodeURIComponent(record.route), current.revision, 'request.json')
  const fixture = JSON.parse(readFileSync(file, 'utf8')) as { request: object }
  for (const [choice, supported, wire] of [
    ['required', record.required, 'required'],
    [
      { name: 'get_weather' },
      record.named,
      { type: 'function', function: { name: 'get_weather' } },
    ],
  ] as const) {
    const fixed = judgeFixedModelRequest({ ...fixture.request, toolChoice: choice })
    if ('failure' in fixed) throw new Error(JSON.stringify(fixed.failure))
    const request = fixed.ok
    const supplier = request.suppliers[0]
    const acquired = await composeFamilies([FAMILY]).acquire(supplier, new AbortController().signal)
    if ('failure' in acquired) throw new Error(JSON.stringify(acquired.failure))
    try {
      const result = acquired.ok.encode({
        request,
        declaration: request.declarations[0],
        media: [],
        resent: [],
      })
      if (supported) {
        if ('failure' in result) throw new Error(JSON.stringify(result.failure))
        expect(JSON.parse(writeJsonText(result.ok.body))).toMatchObject({
          model: record.route,
          tool_choice: wire,
        })
      } else {
        expect(result).toEqual({
          failure: { kind: 'unsupported', field: 'toolChoice', adapter: supplier.adoption },
        })
      }
    } finally {
      await acquired.ok.release()
    }
  }
})
