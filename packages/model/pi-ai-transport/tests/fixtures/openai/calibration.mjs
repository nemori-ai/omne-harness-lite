// Offline research only. No credentials, sockets, ledger, or production binding.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { getEncoding } from 'js-tiktoken'

const encoder = getEncoding('o200k_base')
export const models = Object.freeze([
  'openai/gpt-6-astra',
  'openai/gpt-6-astra-pro',
  'openai/gpt-6-sol',
  'openai/gpt-6-sol-pro',
  'openai/gpt-6-luna',
  'openai/gpt-6-luna-pro',
])
const at = '2026-09-28T00:00:00Z'
const hash = value => createHash('sha256').update(value).digest('hex')

export function textFeatures(body) {
  if (
    body.messages?.length !== 3 ||
    body.tools !== undefined ||
    body.reasoning?.effort !== 'low' ||
    body.max_tokens !== 16
  )
    throw new Error('outside frozen three-message text experiment')
  let textTokens = 0
  for (const [index, message] of body.messages.entries()) {
    if (message.role !== ['system', 'developer', 'user'][index] || !Array.isArray(message.content))
      throw new Error('unexpected message geometry')
    for (const part of message.content) {
      if (part.type !== 'text' || typeof part.text !== 'string')
        throw new Error('nontext calibration input')
      textTokens += encoder.encode(part.text).length
    }
  }
  return { o200kTextTokens: textTokens, candidateTokens: textTokens }
}

export async function prepare(prior) {
  const { judgeMessage } = await import('@omne-harness-lite/messages')
  const { parseOpaqueIdentifier, unwrap } = await import('@omne-harness-lite/identity-values')
  const { createOfficialProfileContent, openaiConfiguration, openaiDefinitions, planRequest } =
    await import('../../../dist/index.js')
  const baseline = models.map(modelId => {
    const candidates = prior.cases.filter(
      item => item.modelId === modelId && item.variant === 'baseline',
    )
    if (candidates.length !== 1) throw new Error(`missing unique prior baseline: ${modelId}`)
    const item = candidates[0]
    if (hash(item.wire) !== item.requestSha256 || JSON.stringify(item.body) !== item.wire)
      throw new Error('prior wire changed')
    return { ...item, features: textFeatures(item.body) }
  })
  const cases = []
  for (const set of ['fit', 'holdout'])
    for (const base of baseline) {
      const definition = openaiDefinitions.find(item => item.modelId === base.modelId)
      if (!definition) throw new Error('missing exact definition')
      const profile = createOfficialProfileContent(definition, {
        providers: ['openai'],
        allowFallback: false,
        configuration: openaiConfiguration,
      })
      if ('rejected' in profile) throw new Error('profile rejected')
      const baselineUser = base.body.messages[2].content[0].text
      const suffix =
        set === 'fit'
          ? '\nReference data, do not quote it:\n' +
            Array.from(
              { length: 24 },
              (_, i) => `Record ${i}: amber river, quiet forest, silver cloud, stable stone.`,
            ).join('\n')
          : '\nReference data, do not quote it:\n' +
            '资料：保持完整上下文；不要遗漏此前的消息。\n'.repeat(11) +
            'const result = [1, 2, 3].map(x => ({ value: x * x, ready: true }));\n' +
            'Unicode: αβγ — café 🦉. Reply with the original requested phrase only.'
      const rawMessages = [
        { type: 'system', id: 'system', text: 'Answer briefly and truthfully.' },
        { type: 'system_reminder', id: 'reminder', text: 'Preserve the preceding conversation.' },
        { type: 'user', id: 'question', text: baselineUser + suffix },
      ]
      const messages = rawMessages.map(({ type, id, text }) => {
        const result = judgeMessage({
          type,
          id,
          createdAt: at,
          blocks: [
            { id: `${id}_text`, kind: 'text', text, visibility: { toHuman: true, toModel: true } },
          ],
          ...(type === 'system_reminder'
            ? {
                nature: 'event',
                source: { kind: 'attempt_started', attempt: 1, reason: 'first', at },
              }
            : {}),
        })
        if ('rejected' in result) throw new Error('message rejected')
        return result.ok
      })
      const id = `gpt6-v2-${base.modelId.split('/')[1]}-${set}`
      const input = {
        calibration: { kind: 'none', reason: 'no_observation' },
        tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
        target: {
          kind: 'model_call',
          callId: unwrap(parseOpaqueIdentifier(id, 'ModelCallId')),
          dispatch: 1,
        },
        routeName: base.modelId,
        provider: 'openai',
        parameters: { reasoningEffort: 'low', maxOutputTokens: 16 },
        tools: [],
        messages,
        snapshot: {
          adaptation: profile.ok.adaptation,
          providers: profile.ok.providers,
          allowFallback: profile.ok.allowFallback,
          inputModalities: profile.ok.inputModalities,
          outputModalities: profile.ok.outputModalities,
          maxInputTokens: profile.ok.maxInputTokens,
          maxOutputTokens: profile.ok.maxOutputTokens,
          inputConstraints: profile.ok.inputConstraints,
          upstreamInputLimits: profile.ok.upstreamInputLimits,
          updatedAt: at,
        },
      }
      const researchMeter = {
        modelId: definition.modelId,
        definitionRevision: definition.revision,
        implementation: definition.implementation,
        provider: 'openai',
        algorithmRevision: 'offline-projection-only',
        tokenizerRevision: 'offline-projection-only',
        replayRevision: 'unavailable',
        transformRevision: 'fixture',
        measureReplay: () => ({ kind: 'unavailable' }),
        measureNew: () => ({ kind: 'unavailable' }),
        evidence: 'No sending authorization or usable admission count',
        measureFull: () => ({ kind: 'estimated', tokens: 1 }),
      }
      const result = await planRequest(input, [definition], researchMeter, {
        signal: new AbortController().signal,
      })
      if ('rejected' in result) throw new Error(`plan rejected: ${JSON.stringify(result)}`)
      const wire = result.planned.serialized
      const body = JSON.parse(wire)
      const expected = structuredClone(base.body)
      expected.messages[2].content[0].text += suffix
      if (JSON.stringify(expected) !== wire) throw new Error('projection changed outside user text')
      cases.push({
        id,
        set,
        modelId: base.modelId,
        provider: 'openai',
        variant: `text-${set}`,
        baselineId: base.id,
        requestSha256: hash(wire),
        bytes: Buffer.byteLength(wire),
        features: textFeatures(body),
        wire,
        body,
      })
    }
  return {
    status: 'research-only-no-production-binding',
    maximumRequests: 12,
    batchMaximum: 6,
    baseline,
    cases,
    frozenCandidate:
      'For each exact model independently, text surrogate + that model baseline usage minus baseline surrogate; unit slope is frozen before new observations. No pooled ratio, fitted slope, or common Pro offset.',
    stopOn: [
      'provider mismatch',
      'HTTP or in-band error',
      'missing complete usage/cost',
      'incomplete SSE',
    ],
    limitation:
      'Pro accounting can aggregate model work. Even matching usage does not establish context occupancy. These fixed low-effort, three-message text cases do not cover tools, images, history or other efforts.',
  }
}

export function analyze(packet, observations, stage) {
  if (stage !== 'fit' && stage !== 'holdout') throw new Error('stage must be fit or holdout')
  if (!Array.isArray(observations) || observations.length === 0)
    throw new Error('exact observations required; absent usage is never zero')
  const included = new Set(observations.map(o => o.modelId))
  if ([...included].some(id => !models.includes(id))) throw new Error('unusable observation model')
  const selected = [
    ...packet.baseline,
    ...packet.cases.filter(c => c.set === 'fit' || stage === 'holdout'),
  ].filter(c => included.has(c.modelId))
  if (
    selected.length !== included.size * (stage === 'fit' ? 2 : 3) ||
    observations.length !== selected.length
  )
    throw new Error('exact observations required; absent usage is never zero')
  const seen = new Map(observations.map(o => [o.id, o]))
  if (seen.size !== selected.length) throw new Error('duplicate observations')
  const counts = new Map(
    selected.map(c => {
      const o = seen.get(c.id)
      if (
        hash(c.wire) !== c.requestSha256 ||
        !o ||
        o.requestSha256 !== c.requestSha256 ||
        o.modelId !== c.modelId ||
        o.provider !== 'OpenAI' ||
        !Number.isSafeInteger(o.promptTokens) ||
        o.promptTokens < 0
      )
        throw new Error(`unusable observation: ${c.id}`)
      if (JSON.stringify(textFeatures(JSON.parse(c.wire))) !== JSON.stringify(c.features))
        throw new Error(`changed features: ${c.id}`)
      return [c.id, o.promptTokens]
    }),
  )
  const rows = models
    .filter(id => included.has(id))
    .map(modelId => {
      const base = packet.baseline.find(c => c.modelId === modelId)
      if (!base) throw new Error('missing exact baseline')
      const baselineUsage = counts.get(base.id)
      const offset = baselineUsage - base.features.o200kTextTokens
      return {
        modelId,
        baselineUsage,
        baselineSurrogate: base.features.o200kTextTokens,
        frozenOffset: offset,
        usageSemantics: modelId.endsWith('-pro')
          ? 'aggregate-work-risk-not-context-count'
          : 'observed-prompt-usage',
        cases: selected
          .filter(c => c.modelId === modelId && c.id !== base.id)
          .map(c => {
            const actual = counts.get(c.id)
            const predicted = c.features.o200kTextTokens + offset
            return {
              id: c.id,
              set: c.set,
              predicted,
              actual,
              residual: actual - predicted,
              surrogateDelta: c.features.o200kTextTokens - base.features.o200kTextTokens,
              usageDelta: actual - baselineUsage,
            }
          }),
      }
    })
  return {
    status: 'research-observations-only',
    stage,
    rows,
    unassessedModels: models.filter(id => !included.has(id)),
    limitation:
      'No production acceptance, exact tokenizer identity, whole-domain error bound or context-count equivalence follows from this report.',
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, input, outputOrObservations, stage] = process.argv.slice(2)
  if (command === 'prepare' && input && outputOrObservations) {
    const packet = await prepare(JSON.parse(readFileSync(input)))
    writeFileSync(outputOrObservations, `${JSON.stringify(packet, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    })
    process.stdout.write(`${outputOrObservations}: 12 offline cases; no request sent\n`)
  } else if (command === 'analyze' && input && outputOrObservations) {
    process.stdout.write(
      `${JSON.stringify(
        analyze(
          JSON.parse(readFileSync(input)),
          JSON.parse(readFileSync(outputOrObservations)),
          stage,
        ),
        null,
        2,
      )}\n`,
    )
  } else
    throw new Error(
      'usage: calibration.mjs prepare prior-packet.json new-packet.json | analyze packet.json observations.json fit|holdout',
    )
}
