import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sdk } from './sdk.mjs'

// Explicit controlled boundary: this card does not verify a model request.
// The actual codecs, complete log relationships and all downstream providers remain real.
export async function publishControlledModelSource(host, held, journal) {
  const MODEL = await sdk('packages/core/model-request-runtime')
  const SESSION = await sdk('packages/core/session-runtime')
  const LOG = await sdk('packages/core/session-log')
  const DEMO = await sdk('examples/model-invocation-minimal-demo')
  const JSON = host.JSON
  const run = 'selected-tool-run',
    attempt = 1,
    at = new Date().toISOString()
  const messages = []
  const capture = (category, value) => {
    const result = MODEL.captureModelLogValue({ category, input: { kind: 'value', value } })
    if (!('ok' in result)) throw new Error(`Controlled model capture rejected: ${result.reason}`)
    return result.ok
  }
  function model(category, value, purpose = { kind: category }, withRun = true) {
    const captured = capture(category, value)
    const entry = MODEL.prepareModelLogEntry({
      ...host.scope,
      shell: { tenant: host.scope.tenant, ...(withRun ? { run, attempt } : {}) },
      captured,
      purpose,
      messagePrefix: messages,
    })
    if (!('ok' in entry)) throw new Error(`Controlled model entry rejected: ${entry.reason}`)
    if (captured.message && captured.message.type !== 'system') messages.push(captured.message)
    return entry.ok
  }
  async function append(entries) {
    const prefix = await held.log.readSince(host.scope.session, 0)
    assert.ok('entries' in prefix)
    const result = await held.log.append(
      host.scope.session,
      entries,
      { kind: 'unfenced' },
      { kind: 'tailEquals', tail: prefix.tail },
    )
    assert.ok(!('failure' in result), JSON.writeJsonLossless(result))
  }
  const user = model(
    'message',
    { id: 'selected-tool-inbound', type: 'user', createdAt: at, blocks: [] },
    { kind: 'message' },
    false,
  )
  await append([user])
  const startedRun = await journal.commit({
    kind: 'run_started',
    run,
    inboundKey: user.dedupeKey,
    at,
  })
  assert.equal(startedRun.kind, 'committed', JSON.writeJsonLossless(startedRun))
  const startedFactKey = `selected-tool-attempt-${randomUUID()}`
  const started = LOG.checkAppendInput(
    host.scope.session,
    [
      {
        tenant: host.scope.tenant,
        run,
        attempt,
        dedupeKey: startedFactKey,
        readKeys: ['session-runtime/attempts'],
        payload: SESSION.attemptStartedPayload({
          kind: 'attempt_started',
          run,
          attempt,
          reason: 'first',
          at,
        }),
      },
    ],
    { kind: 'fenced', run, attempt },
    { kind: 'unconditional' },
  )
  assert.ok('ok' in started)
  const adoptionValue = {
    kind: 'attempt_adopted',
    run,
    attempt,
    adoption: 'candidate',
    startedFactKey,
    tools: [host.selected],
    context: [],
    report: host.report,
  }
  adoptionValue.adoption = DEMO.driverKey(adoptionValue)
  assert.equal(typeof adoptionValue.adoption, 'string')
  const adopted = await journal.commit(adoptionValue, started.ok.entries[0])
  assert.equal(adopted.kind, 'committed', JSON.writeJsonLossless(adopted))
  const binding = {
    implementation: { name: 'selected-tool-controlled-model-source', revision: 'one' },
    definition: { modelId: 'selected-tool/controlled', revision: 'one' },
    configuration: { revision: 'one', values: {} },
  }
  const route = {
    adaptation: binding,
    profile: { origin: 'official', routeName: 'selected-tool/controlled' },
    profileSnapshot: {
      adaptation: binding,
      providers: ['controlled'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 100,
      maxOutputTokens: 20,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
      updatedAt: at,
    },
    provider: 'controlled',
    selectedBy: 'session',
    credentialScope: { layer: 'factory' },
    parameters: {},
  }
  const call = 'selected-tool-model-call',
    responseId = 'selected-tool-response'
  const argumentsValue = { text: '原参数：选中工具' }
  const toolCall = JSON.judgeContentBlock({
    kind: 'tool_call',
    complete: true,
    id: 'selected-tool-block',
    visibility: { toHuman: true, toModel: true },
    callId: 'selected-tool-tool-call',
    tool: host.selected.name,
    arguments: argumentsValue,
  })
  assert.ok('ok' in toolCall, JSON.writeJsonLossless(toolCall))
  await append([
    model('record', {
      kind: 'model_call_created',
      call,
      creationKey: 'selected-tool-created',
      payload: { kind: 'created', locator: call, version: 'v1', digest: 'a'.repeat(64) },
      createdAt: at,
    }),
  ])
  await append([
    model('record', {
      kind: 'model_call_dispatched',
      call,
      dispatch: 1,
      response: responseId,
      ...route,
    }),
  ])
  await append([
    model('record', { kind: 'model_call_opened', call, dispatch: 1, firstTokenAt: at }),
  ])
  const message = {
    id: 'selected-tool-assistant',
    type: 'assistant',
    response: responseId,
    ending: 'complete',
    createdAt: at,
    blocks: [toolCall.ok],
  }
  const response = {
    id: responseId,
    call: { callId: call, runId: run },
    attemptId: attempt,
    dispatch: 1,
    route,
    outcome: 'complete',
    reply: message,
    replyDisposition: 'persisted',
    timing: { sentAt: at, firstTokenAt: at, endedAt: at },
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_read_tokens: 'unknown',
      cache_write_tokens: 0,
      source: 'upstream',
    },
    inputCalibration: {
      requestInput: { kind: 'unavailable', reason: 'not_retained' },
      observedInput: { kind: 'unavailable', reason: 'missing_usage' },
      outputGroup: { kind: 'unavailable', reason: 'not_retained' },
    },
    cost: { cost_usd: 0, source: 'upstream_usage' },
  }
  const responseCaptured = capture('response', response)
  await append([
    model('message', message, { kind: 'persistedMessage', response: responseCaptured }),
    model('response', response),
  ])
  return {
    origin: { run, attempt, assistantMessage: message.id },
    adoption: adoptionValue.adoption,
    call: toolCall.ok,
    messages,
    append,
    MODEL,
  }
}
