import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import { judgeModelRequest } from '@omne-harness/model-contract/provider'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import { fixtureDirectory } from '@omne-harness/pi-ai-transport/testing'
import { GLM_RECORDS, officialGlmProfiles } from '../src/index.ts'
import { FAMILY } from './support/glm.ts'

const root = fileURLToPath(new URL('./fixtures/records/', import.meta.url))
const release = JSON.parse(
  readFileSync(new URL('./fixtures/release-tools.json', import.meta.url), 'utf8'),
) as {
  max_tokens: number
  messages: { role: 'system' | 'user'; content: string }[]
  tools: { function: { name: string; description: string; parameters: unknown } }[]
}

function releaseRequest(saved: Record<string, unknown>) {
  const block = (id: string, text: string) => ({
    kind: 'text',
    id,
    visibility: { toModel: true, toHuman: true },
    text,
  })
  const parameter = { kind: 'max-output-tokens', value: String(release.max_tokens) }
  const supplier = (saved.suppliers as { adoption: unknown }[])[0]?.adoption
  return {
    ...saved,
    system: release.messages
      .filter(m => m.role === 'system')
      .map((m, i) => block('system' + i, m.content)),
    messages: release.messages
      .filter(m => m.role === 'user')
      .map((m, i) => ({
        id: 'msg_' + String(i).padStart(22, '0'),
        role: 'user',
        blocks: [block('user' + i, m.content)],
      })),
    parameters: [parameter],
    parameterAdoptions: [
      {
        supplier,
        applied: parameter,
        origin: { kind: 'explicit', requested: parameter, source: saved.source },
      },
    ],
    tools: release.tools.map(({ function: tool }) => {
      const schema = readJsonText(JSON.stringify(tool.parameters), {
        maxBytes: 65536,
        maxDepth: 32,
        maxItems: 1024,
        maxMembers: 256,
        maxStringLength: 32768,
        maxNumberLength: 16,
      })
      if (schema.kind !== 'ok') throw Error('invalid released tool schema')
      return { name: tool.name, description: tool.description, argumentsSchema: schema.value }
    }),
  }
}

const cases = GLM_RECORDS.flatMap(record =>
  (['fixture', 'release-tools'] as const).map(sample => ({ record, sample })),
)
it.each(cases)(
  'counts $sample with the real tokenizer and covers its measured cold input on $record.name',
  async ({ record, sample }) => {
    const directory = join(root, fixtureDirectory(record))
    const file = JSON.parse(readFileSync(join(directory, 'request.json'), 'utf8')) as {
      request: Record<string, unknown>
    }
    const checked = judgeModelRequest(
      'llm',
      sample === 'fixture' ? file.request : releaseRequest(file.request),
    )
    if ('failure' in checked) throw Error(JSON.stringify(checked.failure))
    const request = checked.ok,
      supplier = request.suppliers[0]
    const profile = officialGlmProfiles({
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
      if (sample === 'release-tools') {
        const { model, provider, ...wire } = JSON.parse(writeJsonText(sent.ok.body))
        expect(model).toBe(record.name)
        expect(provider.order).toEqual(record.serving.order)
        expect(wire).toEqual(release)
      }
      const { representation } = sent.ok
      const represented = JSON.parse(writeJsonText(representation.tokenInput))
      expect(represented.tools).toEqual(
        request.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: JSON.parse(writeJsonText(tool.argumentsSchema)),
        })),
      )
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
      const observation = JSON.parse(
        readFileSync(
          new URL(
            './fixtures/observations/' + record.name.split('/')[1] + '.json',
            import.meta.url,
          ),
          'utf8',
        ),
      )
      expect(BigInt(check.measurement.amount)).toBe(
        BigInt(observation.samples[sample].countedVisibleTokens) +
          BigInt(record.meter.coldRequestTokens),
      )
      const frames = readFileSync(join(directory, 'stream.sse'), 'utf8')
        .split(/\r?\n/)
        .filter(line => line.startsWith('data: {'))
        .map(line => JSON.parse(line.slice(6)) as { usage?: { prompt_tokens?: number } })
      const tokens =
        sample === 'release-tools'
          ? observation.samples['release-tools'].usage.prompt_tokens
          : frames.findLast(frame => frame.usage?.prompt_tokens !== undefined)?.usage?.prompt_tokens
      if (tokens === undefined || !Number.isSafeInteger(tokens) || tokens <= 0)
        throw Error('gateway prompt token measurement missing')
      expect(
        BigInt(check.measurement.amount) + BigInt(check.measurement.margin),
      ).toBeGreaterThanOrEqual(BigInt(tokens))
      expect(check.measurement.method.owner).toBe('@omne-harness/pi-ai-glm')
    } finally {
      await binding.release()
    }
  },
)
