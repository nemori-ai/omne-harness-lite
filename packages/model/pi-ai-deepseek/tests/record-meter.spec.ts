import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import { judgeModelRequest } from '@omne-harness/model-contract/provider'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import { fixtureDirectory } from '@omne-harness/pi-ai-transport/testing'
import { DEEPSEEK_RECORDS, officialDeepSeekProfiles } from '../src/index.ts'
import { FAMILY } from './support/deepseek.ts'

const root = fileURLToPath(new URL('./fixtures/records/', import.meta.url))
it.each(DEEPSEEK_RECORDS)(
  'counts the actual tool request and covers its measured cold input on $name',
  async record => {
    const directory = join(root, fixtureDirectory(record))
    const file = JSON.parse(readFileSync(join(directory, 'request.json'), 'utf8')) as {
      request: unknown
    }
    const checked = judgeModelRequest('llm', file.request)
    if ('failure' in checked) throw Error(JSON.stringify(checked.failure))
    const request = checked.ok,
      supplier = request.suppliers[0]
    const profile = officialDeepSeekProfiles({
      retryPolicy: request.retryPolicy,
      compactionTriggerPercent: '80',
    }).find(p => p.suppliers[0].model === record.route.model)
    if (!profile) throw Error('record lacks a current profile')
    const acquired = await composeFamilies([FAMILY]).acquire(supplier, new AbortController().signal)
    if ('failure' in acquired) throw Error(JSON.stringify(acquired.failure))
    const binding = acquired.ok
    try {
      const sent = binding.encode({
        request,
        media: [],
        declaration: request.declarations[0],
        resent: [],
      })
      if ('failure' in sent) throw Error(JSON.stringify(sent.failure))
      const { representation } = sent.ok
      const represented = writeJsonText(representation.tokenInput)
      for (const tool of request.tools) {
        expect(represented).toContain(tool.name)
        expect(represented).toContain(tool.description)
      }
      const result = await binding.meter.measure({
        profile: request.profile,
        supplier: profile.suppliers[0],
        context: profile.context,
        limits: profile.limits,
        assembled: request,
        parameters: request.parameterAdoptions,
        representation,
      })
      if ('failure' in result) throw Error(JSON.stringify(result.failure))
      const check = result.ok.checks.find(c => c.metric === 'input-tokens')
      if (check?.measurement.kind !== 'estimate') throw Error('input estimate missing')
      const frames = readFileSync(join(directory, 'stream.sse'), 'utf8')
        .split(/\r?\n/)
        .filter(line => line.startsWith('data: {'))
        .map(line => JSON.parse(line.slice(6)) as { usage?: { prompt_tokens?: number } })
      const tokens = frames.findLast(frame => frame.usage?.prompt_tokens !== undefined)?.usage
        ?.prompt_tokens
      if (tokens === undefined || !Number.isSafeInteger(tokens) || tokens <= 0)
        throw Error('gateway prompt token measurement missing')
      expect(
        BigInt(check.measurement.amount) + BigInt(check.measurement.margin),
      ).toBeGreaterThanOrEqual(BigInt(tokens))
      expect(check.measurement.method.owner).toBe('@omne-harness/pi-ai-deepseek')
    } finally {
      await binding.release()
    }
  },
)
