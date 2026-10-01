import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  jsonNumberSource,
  writeJsonLossless,
} from '../../packages/core/content-blocks/dist/index.js'
import { parseOpaqueIdentifier, unwrap } from '../../packages/core/identity-values/dist/index.js'
import { judgeMessage } from '../../packages/core/messages/dist/index.js'
import {
  invokeModel,
  openRouterCredentialRedactionConfig,
} from '../../packages/model/model-request-runtime/dist/index.js'
import {
  anthropicDefinitions,
  createAnthropicInputMeter,
  createOfficialProfileContent,
  createPiAiTransport,
} from '../../packages/model/pi-ai-transport/dist/index.js'
import { estimateReservation } from '../../tools/model-probe/src/budget.mjs'
import {
  paidInvocation,
  writePrivateEvidence,
} from '../../tools/model-probe/src/production-gate.mjs'

export const sha256 = value => createHash('sha256').update(value).digest('hex')
export const modelId = 'anthropic/claude-fable-5.1'
export const definition = anthropicDefinitions.find(value => value.modelId === modelId)
assert.ok(definition, 'frozen official model missing')
export const budget = Object.freeze({ limitUsd: '100', researchLimitUsd: '50' })
export const approvedLedger =
  '/data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime/tmp/model-request-runtime/ledger.json'

export async function readFrozenJson(path, expectedSha256) {
  assert.match(expectedSha256, /^[a-f0-9]{64}$/)
  const bytes = await readFile(path)
  assert.equal(sha256(bytes), expectedSha256, `frozen input SHA mismatch: ${path}`)
  return JSON.parse(bytes.toString('utf8'))
}

export function validateScenario(scenario) {
  assert.equal(scenario.format, 1)
  assert.equal(scenario.modelId, modelId)
  assert.equal(scenario.provider, 'anthropic')
  assert.equal(scenario.definitionRevision, definition.revision)
  assert.deepEqual(scenario.implementation, definition.implementation)
  assert.deepEqual(scenario.cache, { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] })
  assert.equal(scenario.reasoningEffort, 'low')
  assert.ok(Number.isSafeInteger(scenario.maxOutputTokens) && scenario.maxOutputTokens > 0)
  assert.ok(scenario.maxOutputTokens <= definition.capabilities.maxOutputTokens)
  assert.ok(Array.isArray(scenario.turns) && scenario.turns.length === 3)
  for (const turn of scenario.turns) {
    assert.equal(typeof turn, 'string')
    assert.match(turn, /^[\x20-\x7e]{1,160}$/)
  }
  assert.match(scenario.publicWireSha256, /^[a-f0-9]{64}$/)
  assert.equal(typeof scenario.expectedEndpointTag, 'string')
  assert.ok(scenario.expectedEndpointTag.length > 0)
  return scenario
}

export function profileFor(scenario) {
  const result = createOfficialProfileContent(definition, {
    providers: ['anthropic'],
    allowFallback: false,
    configuration: { revision: 'priority-certification-1', values: { cache: scenario.cache } },
  })
  if (!('ok' in result)) throw new Error(`official profile rejected: ${result.rejected}`)
  return result.ok
}

export function exactPricing(snapshot, scenario, maxAgeMs, now = Date.now()) {
  assert.equal(snapshot.format, 1)
  const age = now - Date.parse(snapshot.observedAt)
  assert.ok(Number.isSafeInteger(maxAgeMs) && maxAgeMs > 0)
  assert.ok(Number.isFinite(age) && age >= 0 && age <= maxAgeMs, 'catalog is stale or future-dated')
  const card = snapshot.cards?.find(value => value.id === modelId)
  assert.ok(card && card.state === 'directory_present', 'exact model absent from catalog')
  const endpoint = card.endpoints?.find(value => value.tag === scenario.expectedEndpointTag)
  assert.ok(endpoint && endpoint.provider === 'Anthropic', 'exact Anthropic endpoint absent')
  assert.equal(endpoint.status, 0, 'fixed endpoint status changed')
  assert.ok(endpoint.pricing, 'endpoint price missing')
  return endpoint.pricing
}

// The project's finite input cap is the bound for every turn, including a reply
// that cannot be known before the next dispatch. The budget helper applies the
// highest prompt/cache-write/1h-write and completion tiers plus request fee.
export function wholeContextReservation(pricing, scenario) {
  return estimateReservation(
    pricing,
    definition.capabilities.maxInputTokens,
    scenario.maxOutputTokens,
  )
}

export function judgedTextMessage(type, text, id) {
  const at = '2026-09-29T00:00:00Z'
  const result = judgeMessage({
    type,
    id,
    createdAt: at,
    blocks: [
      { id: `${id}-text`, kind: 'text', text, visibility: { toHuman: true, toModel: true } },
    ],
    ...(type === 'system_reminder'
      ? { nature: 'event', source: { kind: 'attempt_started', attempt: 1, reason: 'first', at } }
      : {}),
  })
  if (!('ok' in result)) throw new Error(`message rejected: ${result.rejected}`)
  return result.ok
}

export function publicInput(scenario, profile) {
  return {
    calibration: { kind: 'none', reason: 'no_observation' },
    tokenMargin: { multiplier: 1.1, reserveTokens: 256 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('priority-public', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: modelId,
    provider: 'anthropic',
    parameters: {
      reasoningEffort: scenario.reasoningEffort,
      maxOutputTokens: scenario.maxOutputTokens,
    },
    tools: [],
    messages: [
      judgedTextMessage('system', 'Answer the final question briefly.', 'priority-system'),
      judgedTextMessage('system_reminder', 'Keep the reply short.', 'priority-reminder'),
      judgedTextMessage('user', scenario.turns[0], 'priority-user'),
    ],
    snapshot: {
      adaptation: profile.adaptation,
      providers: profile.providers,
      allowFallback: profile.allowFallback,
      ...definition.capabilities,
      updatedAt: '2026-09-29T00:00:00Z',
    },
  }
}

export function transportPolicy() {
  return {
    maxConnections: 1,
    idleConnectionTimeoutMs: 5_000,
    connectTimeoutMs: 5_000,
    maxErrorBodyBytes: 8_192,
    maxSseEventBytes: 65_536,
    credentialRedaction: openRouterCredentialRedactionConfig,
  }
}

export function invocationPolicy() {
  return {
    now: () => new Date().toISOString(),
    schedule(ms, callback) {
      const timer = setTimeout(callback, ms)
      return () => clearTimeout(timer)
    },
    firstContentTimeoutMs: 15_000,
    idleContentTimeoutMs: 120_000,
    statusCauseTable: {
      401: 'credential_unavailable',
      429: 'upstream_unavailable',
      503: 'upstream_unavailable',
    },
    credentialRedaction: openRouterCredentialRedactionConfig,
    diagnostic: () => {},
  }
}

export function actualUsd(cost) {
  return cost?.cost_usd === 'unknown' || cost?.cost_usd === undefined
    ? undefined
    : jsonNumberSource(cost.cost_usd)
}

export async function publicPaidCase({
  scenario,
  pricing,
  ledger,
  outputDir,
  credential,
  transportOptions = {},
}) {
  const profile = profileFor(scenario)
  const transport = createPiAiTransport({
    definitions: [definition],
    inputMeters: [createAnthropicInputMeter(definition)],
    policy: transportPolicy(),
    ...transportOptions,
  })
  const request = publicInput(scenario, profile)
  try {
    const planned = transport.plan(request)
    assert.ok('planned' in planned, JSON.stringify(planned))
    const wireSha256 = sha256(planned.planned.serialized)
    assert.equal(
      wireSha256,
      scenario.publicWireSha256,
      'public wire differs from approved scenario',
    )
    const estimateUsd = wholeContextReservation(pricing, scenario)
    const paid = await paidInvocation(
      ledger,
      {
        model: modelId,
        provider: 'anthropic',
        stage: 'acceptance',
        estimateUsd,
      },
      async entryId => {
        const outcome = await invokeModel({
          ...request,
          transport,
          credential,
          signal: new AbortController().signal,
          policy: invocationPolicy(),
          onAccepted: () => {},
        }).outcome
        const safe = {
          case: 'public',
          entryId,
          modelId,
          definitionRevision: definition.revision,
          implementation: definition.implementation,
          wireSha256,
          estimateUsd,
          outcome: 'outcome' in outcome ? outcome.outcome : outcome.rejected,
          usage: 'usage' in outcome ? JSON.parse(writeJsonLossless(outcome.usage)) : null,
          cost: 'cost' in outcome ? JSON.parse(writeJsonLossless(outcome.cost)) : null,
          observedInput:
            'inputCalibration' in outcome ? outcome.inputCalibration.observedInput.kind : null,
        }
        await writePrivateEvidence(
          `${outputDir}/public-${entryId}.json`,
          JSON.stringify(safe, null, 2) + '\n',
        )
        return { actualUsd: 'cost' in outcome ? actualUsd(outcome.cost) : undefined, safe }
      },
    )
    assert.equal(paid.receipt.safe.outcome, 'complete', 'public outcome failed; stop next send')
    return { entryId: paid.id, ...paid.receipt.safe }
  } finally {
    await transport.close()
  }
}
