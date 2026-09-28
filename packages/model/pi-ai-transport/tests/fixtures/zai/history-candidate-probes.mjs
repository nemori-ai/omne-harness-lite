// Offline only. Does not import HTTP, credentials or a paid ledger.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createZaiHistoryCandidateMeter } from '../../../dist/input-meters/zai-candidate.js'
import { projectZaiCommercialBody } from '../../../dist/input-meters/zai-commercial.js'
import { zaiDefinitions } from '../../../dist/official-models/zai.js'

const sha = value => createHash('sha256').update(value).digest('hex')
const source = new URL('./history-complete-streams.json', import.meta.url)

export function freezeHistoryCandidateProbes(maxOutputTokens) {
  assert.ok(Number.isSafeInteger(maxOutputTokens) && maxOutputTokens > 0)
  const bytes = readFileSync(source)
  const histories = JSON.parse(bytes)
  const probes = []
  for (const row of histories) {
    assert.equal(sha(row.sse), row.sseSha256)
    const frames = row.sse
      .split('\n')
      .filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
      .map(line => JSON.parse(line.slice(6)))
    const choices = frames.flatMap(frame => frame.choices ?? [])
    assert.equal(choices.findLast(choice => choice.finish_reason)?.finish_reason, 'stop')
    assert.equal(choices.map(choice => choice.delta?.reasoning ?? '').join(''), row.thought)
    assert.equal(choices.map(choice => choice.delta?.content ?? '').join(''), row.content)
    const original = projectZaiCommercialBody(row.request, row.model)
    assert.ok(original && Array.isArray(original.messages))
    const model = zaiDefinitions.find(item => item.modelId === row.model)
    assert.ok(model && maxOutputTokens <= Number(model.capabilities.maxOutputTokens))
    const meter = createZaiHistoryCandidateMeter(model)
    // Exact last_message configuration: move its marker to the new final message.
    const last = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'What arithmetic result did we verify?',
          ...(row.model === 'z-ai/glm-5.3-prime'
            ? { cache_control: { type: 'ephemeral', ttl: '5m' } }
            : {}),
        },
      ],
    }
    for (const variant of ['control', 'plain', 'details']) {
      const assistant = {
        role: 'assistant',
        content: row.content,
        ...(variant === 'plain'
          ? { reasoning: row.thought }
          : variant === 'details'
            ? { reasoning_details: [row.detail] }
            : {}),
      }
      const body = {
        ...original,
        max_tokens: maxOutputTokens,
        messages: [...original.messages, assistant, last],
      }
      const serialized = JSON.stringify(body)
      probes.push({
        id: `${row.id}-${variant}`,
        partition: ['prime-base', 'flashx-long'].includes(row.id) ? 'holdout' : 'fit',
        variant,
        model: row.model,
        provider: row.provider,
        sourceSha256: row.sourceSha256,
        sseSha256: row.sseSha256,
        requestSha256: sha(serialized),
        body,
        candidate: meter.measure({ body, serialized }),
      })
    }
  }
  return { status: 'unsent', fixtureSha256: sha(bytes), maxOutputTokens, probes }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv[2], '--max-output-tokens')
  assert.equal(process.argv.length, 4)
  process.stdout.write(
    JSON.stringify(freezeHistoryCandidateProbes(Number(process.argv[3])), null, 2) + '\n',
  )
}
