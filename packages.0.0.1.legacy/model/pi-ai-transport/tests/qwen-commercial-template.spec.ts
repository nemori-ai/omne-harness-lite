// QC-V2 and QC-V3 of the adopted Qwen commercial public-template estimate (candidate
// revision 1): the template oracle against independent Jinja goldens, the batch8
// reproduction (counterexample 17), the equivalence oracle and the open-leaf regression
// oracle (counterexample 14). Goldens come from real Jinja2 + HF tokenizers
// (fixtures/qwen/commercial-reference-render.py; batch8 from the QC-V0 recompute), never
// from the package renderer.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { Tokenizer } from '@huggingface/tokenizers'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  createQwenInputMeter,
  projectQwenMeterBody,
  qwenOpenTemplateSettings,
  renderQwenPrompt,
  type QwenTemplateSettings,
} from '../src/input-meters/qwen.ts'
import { object } from '../src/json.ts'
import { qwenDefinitions } from '../src/official-models/qwen.ts'
import { directFull } from './direct-full-input.ts'
import { asReasoningString, serialized } from './moonshot-visible-support.ts'
import {
  qwenBatch8,
  qwenCommercialMeter,
  qwenCommercialModels,
  qwenFamilySettings,
} from './qwen-commercial-support.ts'

function readFixture(name: string): JsonObject {
  const parsed = readJsonStrict(
    readFileSync(new URL(`./fixtures/qwen/${name}`, import.meta.url), 'utf8'),
  )
  if (!('ok' in parsed) || !object(parsed.ok)) throw new Error(`invalid ${name}`)
  return parsed.ok
}

const source = readFixture('commercial-template-cases.json')
const golden = readFixture('commercial-template-golden.json')
const capture = readFixture('open-regression-capture.json')
if (!Array.isArray(source.cases) || !object(golden.cases) || !object(capture.rows))
  throw new Error('invalid template fixtures')
const cases = source.cases.filter(object)
const goldenCases = golden.cases
const captureRows = capture.rows

function caseBody(value: JsonObject, modelId: string): JsonObject {
  const tools = typeof value.tools === 'string' ? source[value.tools] : undefined
  if (!Array.isArray(value.messages)) throw new Error('case messages')
  return {
    model: modelId,
    provider: { order: ['alibaba'], allow_fallbacks: false, require_parameters: true },
    stream: true,
    messages: value.messages,
    ...(tools === undefined ? {} : { tools: [tools] }),
  }
}

function goldenRow(name: string, key: string): { promptSha256: string; tokens: number } {
  const rows = goldenCases[name]
  const row = object(rows) ? rows[key] : undefined
  if (!object(row) || typeof row.promptSha256 !== 'string' || typeof row.tokens !== 'number')
    throw new Error(`golden ${name} ${key}`)
  return { promptSha256: row.promptSha256, tokens: row.tokens }
}

function settingsKey(settings: QwenTemplateSettings): string {
  return `thinking=${settings.preserveThinking ? 'all' : 'last-turn'},instruction=${settings.effortInstruction},tojson=${settings.toolJson}`
}

const sha = (text: string | undefined) =>
  text === undefined ? undefined : createHash('sha256').update(text).digest('hex')

function render(body: JsonObject, settings?: QwenTemplateSettings): string | undefined {
  const projected = projectQwenMeterBody(body)
  return projected && renderQwenPrompt(projected, settings)
}

// An independent handle on the pinned tokenizer, for counts under settings no leaf binds.
let tokenizer: Tokenizer
beforeAll(() => {
  const directory = new URL('../resources/tokenizers/qwen-38-24t/', import.meta.url)
  tokenizer = new Tokenizer(
    JSON.parse(readFileSync(new URL('tokenizer.json', directory), 'utf8')),
    JSON.parse(readFileSync(new URL('tokenizer_config.json', directory), 'utf8')),
  )
  for (const model of qwenCommercialModels) qwenCommercialMeter(model)
}, 120_000)
const count = (text: string) => tokenizer.encode(text, { add_special_tokens: false }).ids.length

const matrix: QwenTemplateSettings[] = [true, false].flatMap(preserveThinking =>
  (['xhigh', 'none'] as const).map(effortInstruction => ({
    preserveThinking,
    effortInstruction,
    toolJson: 'wire-order' as const,
  })),
)

describe('QC-V2 template oracle: parameterized renderer equals independent Jinja', () => {
  it('fixtures pin the same template and tokenizer bytes', () => {
    expect(golden.chatTemplateSha256).toBe(
      createHash('sha256')
        .update(
          readFileSync(
            new URL('../resources/tokenizers/qwen-38-24t/chat_template.jinja', import.meta.url),
          ),
        )
        .digest('hex'),
    )
    expect(golden.tokenizerSha256).toBe(
      '0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3',
    )
    expect(cases.map(value => value.name)).toEqual(Object.keys(goldenCases))
  })

  it.each(cases.map(value => ({ name: String(value.name), value })))(
    '$name: preserve_thinking {default,false} × instruction {xhigh,none}',
    ({ name, value }) => {
      const body = caseBody(value, 'qwen/qwen3.8-flash')
      const prompts = new Set<string>()
      for (const settings of matrix) {
        const expected = goldenRow(name, settingsKey(settings))
        const prompt = render(body, settings)
        if (prompt === undefined) throw new Error(`${name} ${settingsKey(settings)} unrendered`)
        expect(sha(prompt), settingsKey(settings)).toBe(expected.promptSha256)
        expect(count(prompt), settingsKey(settings)).toBe(expected.tokens)
        prompts.add(prompt)
      }
      // The two instruction values always differ; thinking differs unless no assistant
      // precedes the last user query.
      expect(prompts.size).toBeGreaterThanOrEqual(2)
    },
  )

  it.each(qwenCommercialModels)(
    '$modelId factory counts every case with its bound settings',
    model => {
      const settings = qwenFamilySettings[model.family]
      for (const value of cases) {
        const name = String(value.name)
        const body = caseBody(value, model.modelId)
        const expected = goldenRow(name, settingsKey(settings))
        expect(directFull(qwenCommercialMeter(model), serialized(body)), name).toEqual({
          kind: 'estimated',
          tokens: expected.tokens,
        })
      }
    },
  )

  it('geometry: last-turn thinking drops only assistants before the last user query', () => {
    const last = qwenFamilySettings['3.7']
    const think = (name: string) => {
      const value = cases.find(item => item.name === name)
      if (!value) throw new Error(name)
      return render(caseBody(value, 'qwen/qwen3.7-flash'), last)?.split('<think>\n').length
    }
    // Generation prompt always opens one think block; count the rest.
    expect(think('assistant-before-last-query')).toBe(2) // dropped
    expect(think('assistant-after-last-query')).toBe(3) // kept: in-turn tool loop
    expect(think('consecutive-tool-results')).toBe(2) // both before the new query
    expect(think('wrapped-tool-response-user')).toBe(3) // wrapped user is not a query
    expect(think('reminder-after-tool-result')).toBe(2) // a reminder user is a query
  })
})

describe('QC-V2 and counterexample 17: batch8 18 rebuilt bodies reproduce upstream', () => {
  it('residual 0 on every request; sorted-key tojson would give +1', () => {
    expect(qwenBatch8).toHaveLength(18)
    const table: string[] = []
    for (const row of qwenBatch8) {
      const model = qwenCommercialModels.find(item => item.modelId === `qwen/${row.leaf}`)
      if (!model) throw new Error(row.leaf)
      const settings = qwenFamilySettings[model.family]
      expect(writeJsonLossless(row.body)).toBe(row.wire)
      const measured = directFull(qwenCommercialMeter(model), {
        body: row.body,
        serialized: row.wire,
      })
      if (measured.kind !== 'estimated') throw new Error(`${row.leaf} ${row.round} unavailable`)
      const tokens = Number(measured.tokens)
      table.push(`${row.leaf} r${row.round} ${tokens - row.upstreamPromptTokens}`)
      expect(tokens, `${row.leaf} round ${row.round}`).toBe(row.upstreamPromptTokens)
      expect(tokens).toBe(row.predictedWireOrder)
      // The rendered prompt is byte-identical to the independent Jinja rendering (the meter
      // strips 0902's high effort before rendering; so does this direct call).
      const effortless = noEffort(row.body)
      expect(sha(render(effortless, settings))).toBe(row.promptSha256WireOrder)
      // Negative control: Jinja's built-in sorted-key tojson reproduces the QC-V0 +1.
      const sorted = render(effortless, { ...settings, toolJson: 'sorted-keys' })
      if (sorted === undefined) throw new Error('sorted-key render')
      expect(count(sorted)).toBe(row.predictedSortedKeys)
      expect(count(sorted) - row.upstreamPromptTokens).toBe(1)
      // Negative control: the other family's thinking/instruction settings do not fit.
      const swapped = render(effortless, qwenFamilySettings[model.family === '3.8' ? '3.7' : '3.8'])
      if (swapped === undefined) throw new Error('swapped render')
      expect(count(swapped)).not.toBe(row.upstreamPromptTokens)
    }
    expect(table.every(line => line.endsWith(' 0'))).toBe(true)
  })
})

describe('QC-V3 equivalence oracle: details and the `reasoning` string count the same', () => {
  it.each(qwenCommercialModels)('$modelId on batch8 bodies and every template case', model => {
    const meter = qwenCommercialMeter(model)
    const bodies: JsonObject[] = [
      ...qwenBatch8.map(row => forLeaf(row.body, model.modelId)),
      ...cases.map(value => caseBody(value, model.modelId)),
    ]
    let compared = 0
    for (const body of bodies) {
      const details = directFull(meter, serialized(body))
      if (details.kind !== 'estimated') throw new Error('details form unavailable')
      expect(directFull(meter, serialized(asReasoningString(body)))).toEqual(details)
      compared++
    }
    expect(compared).toBe(18 + cases.length)
  })
})

function noEffort(body: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'reasoning'))
}

/** A batch8 body moved to another leaf's route: its effort and cache domain, same history. */
function forLeaf(body: JsonObject, modelId: string): JsonObject {
  const definition = qwenDefinitions.find(item => item.modelId === modelId)
  const automatic = definition?.routes.alibaba?.cache.mode === 'automatic'
  const moved = modelId === 'qwen/qwen3.8-max-0902' ? body : noEffort(body)
  return {
    ...moved,
    model: modelId,
    messages: (Array.isArray(body.messages) ? body.messages : []).map(message =>
      automatic && object(message) && Array.isArray(message.content)
        ? {
            ...message,
            content: message.content.map(part =>
              object(part)
                ? Object.fromEntries(
                    Object.entries(part).filter(([key]) => key !== 'cache_control'),
                  )
                : part,
            ),
          }
        : message,
    ),
  }
}

describe('QC-V3 and counterexample 14: open leaves are byte-for-byte unchanged', () => {
  it.each(['qwen/qwen3.8-2.4t-a95b', 'qwen/qwen3.8-27b'])(
    '%s renders and counts every case as captured before the change',
    modelId => {
      const definition = qwenDefinitions.find(item => item.modelId === modelId)
      if (!definition) throw new Error(modelId)
      expect(definition).toMatchObject({
        revision: '4',
        implementation: { name: 'pi-ai:qwen', revision: 'mp4-19' },
      })
      const meter = createQwenInputMeter(definition)
      expect(meter.algorithmRevision).toBe(
        modelId === 'qwen/qwen3.8-27b'
          ? 'qwen-38-public-template-image-effort-5'
          : 'qwen-38-public-template-effort-4',
      )
      expect(meter.tokenizerRevision).toBe(
        modelId === 'qwen/qwen3.8-27b'
          ? 'tokenizer-basis/qwen-38-public-template-image-effort-4'
          : 'tokenizer-basis/qwen-38-public-template-effort-3',
      )
      const rows = captureRows[modelId]
      if (!object(rows)) throw new Error('capture rows')
      for (const value of cases) {
        const name = String(value.name)
        const row = rows[name]
        if (!object(row)) throw new Error(`capture ${name}`)
        const body = caseBody(value, modelId)
        const prompt = render(body)
        expect(sha(prompt), name).toBe(row.promptSha256)
        expect(render(body, qwenOpenTemplateSettings)).toBe(prompt)
        // The unchanged open path is also the independent Jinja sorted-key rendering.
        expect(sha(prompt)).toBe(
          goldenRow(name, 'thinking=all,instruction=xhigh,tojson=sorted-keys').promptSha256,
        )
        expect(directFull(meter, serialized(body)), name).toEqual({
          kind: 'estimated',
          tokens: row.tokens as JsonValue,
        })
      }
    },
  )
})
