import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { models } from './models.mjs'
import { estimateReservation, openLedger } from './budget.mjs'
import { readCredential, sendOnce, streamFacts } from './network.mjs'

export function validateRun(config, snapshot) {
  if (
    config.format !== 1 ||
    !['research', 'acceptance'].includes(config.stage) ||
    !Array.isArray(config.probes) ||
    !config.probes.length
  )
    throw new Error('Invalid probe configuration')
  if (
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs < 1 ||
    !Number.isSafeInteger(config.maxResponseBytes) ||
    config.maxResponseBytes < 1
  )
    throw new Error('Missing probe resource bounds')
  return config.probes.map(probe => {
    const target = models.find(m => m.id === probe.model)
    const card = snapshot.cards.find(c => c.id === probe.model)
    const endpoint = card?.endpoints?.find(e => e.tag === probe.provider)
    if (!target || !endpoint)
      throw new Error('Model or exact provider absent from inspected directory')
    if (
      !Number.isSafeInteger(probe.maxOutputTokens) ||
      probe.maxOutputTokens < 1 ||
      !Number.isSafeInteger(probe.prefixLines) ||
      probe.prefixLines < 1 ||
      !Number.isSafeInteger(probe.repetitions) ||
      probe.repetitions < 2
    )
      throw new Error('Missing per-model probe limits')
    if (!['automatic', 'explicit'].includes(probe.cache?.mode))
      throw new Error('Cache mode must be explicit')
    if (probe.cache.mode === 'explicit' && typeof probe.cache.ttl !== 'string')
      throw new Error('Explicit caching requires configured TTL')
    if (probe.reasoning && !endpoint.supportedParameters?.includes('reasoning'))
      throw new Error('Reasoning parameter not advertised by endpoint')
    if (probe.fixture !== undefined && !['mapping', 'fruit'].includes(probe.fixture))
      throw new Error('Unknown synthetic fixture')
    return { ...probe, target, endpoint }
  })
}
export function makeRequest(probe) {
  const fruit = probe.fixture === 'fruit'
  const prefix = Array.from({ length: probe.prefixLines }, (_, i) =>
    fruit
      ? `Garden note ${i}: apples grow on trees. Pears also grow on trees.\n`
      : `Reference ${i}: the controlled fixture maps the code A to alpha and B to beta.\n`,
  ).join('')
  const stable = { type: 'text', text: prefix }
  if (probe.cache.mode === 'explicit')
    stable.cache_control = { type: 'ephemeral', ttl: probe.cache.ttl }
  const body = {
    model: probe.model,
    provider: { order: [probe.provider], allow_fallbacks: false, require_parameters: true },
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: probe.maxOutputTokens,
    messages: [
      { role: 'system', content: [stable] },
      {
        role: probe.target.reminderRole,
        content: fruit
          ? 'Please answer using one word.'
          : 'System reminder: answer the final question with ALPHA only.',
      },
      {
        role: 'user',
        content: fruit
          ? 'Which fruit is named first in the garden notes?'
          : 'What is the fixture name for code A?',
      },
    ],
  }
  if (probe.reasoning !== undefined) body.reasoning = probe.reasoning
  return body
}
export async function runProbes(config, snapshot, { credentialFile, ledgerPath, outputDirectory }) {
  const probes = validateRun(config, snapshot)
  const ledger = await openLedger(ledgerPath, config.budget)
  try {
    const credential = await readCredential(credentialFile)
    await mkdir(outputDirectory, { recursive: true, mode: 0o700 })
    const results = []
    for (const probe of probes) {
      const body = makeRequest(probe)
      const inputBytes = Buffer.byteLength(JSON.stringify(body))
      for (let repetition = 0; repetition < probe.repetitions; repetition++) {
        const estimateUsd = estimateReservation(
          probe.endpoint.pricing,
          inputBytes,
          probe.maxOutputTokens,
        )
        const reservation = await ledger.reserve({
          model: probe.model,
          provider: probe.provider,
          stage: config.stage,
          estimateUsd,
        })
        const resultName = `${randomUUID()}.json`
        let result
        try {
          result = await sendOnce(body, credential, config)
        } catch (error) {
          await writeFile(
            join(outputDirectory, resultName),
            JSON.stringify({
              reservation,
              model: probe.model,
              provider: probe.provider,
              repetition,
              failed: error.message,
            }),
            { mode: 0o600 },
          )
          throw error
        }
        if (result.raw.includes(credential))
          throw new Error('Credential in response: refusing to persist it')
        let facts
        let parseError
        try {
          facts = result.status === 200 ? streamFacts(result.raw) : undefined
        } catch {
          parseError = 'Invalid response stream; cost requires reconciliation'
        }
        // Controlled fixture content only, never user/session content or Authorization.
        const record = {
          reservation,
          model: probe.model,
          providerRequested: probe.provider,
          repetition,
          stage: config.stage,
          request: body,
          response: result,
          facts,
          parseError,
        }
        await writeFile(join(outputDirectory, resultName), `${JSON.stringify(record, null, 2)}\n`, {
          mode: 0o600,
        })
        await ledger.settle(reservation, facts?.usage?.cost)
        if (!facts.done || !facts.finish || facts.frames.some(f => f.error))
          throw new Error('Incomplete stream: probe failed')
        if (!facts.provider || facts.provider !== probe.endpoint.provider)
          throw new Error('Actual provider not verified')
        results.push({
          model: probe.model,
          provider: probe.provider,
          repetition,
          cachedTokens: facts.cachedTokens ?? 'unknown',
          cacheWriteTokens: facts.cacheWriteTokens ?? 'unknown',
          actualUsd: facts.usage.cost,
          evidence: resultName,
        })
      }
    }
    const summary = { results, ledger: ledger.snapshot() }
    await writeFile(
      join(outputDirectory, 'summary.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
      { mode: 0o600 },
    )
    return summary
  } finally {
    await ledger.close()
  }
}
