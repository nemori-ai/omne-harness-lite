// Bounded diagnostic probe. Run only by the approved paid-request owner.
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { estimateReservation } from '../../../../../../tools/model-probe/src/budget.mjs'
import {
  readCredential,
  sendOnce,
  streamFacts,
} from '../../../../../../tools/model-probe/src/network.mjs'
import {
  openProductionLedger,
  privateOutputDirectory,
  writePrivateEvidence,
} from '../../../../../../tools/model-probe/src/production-gate.mjs'

const historyText =
  'I checked the multiplication carefully: seventeen times nineteen is three hundred twenty three. '.repeat(
    5,
  )
const finalAnswer = 'The arithmetic result is 323.'
const toolCalls = [
  {
    id: 'history_call_1',
    type: 'function',
    function: { name: 'lookup', arguments: '{"value":17}' },
  },
]
const tools = [
  {
    type: 'function',
    function: {
      name: 'lookup',
      description: 'Return a number',
      parameters: {
        type: 'object',
        properties: { value: { type: 'integer' } },
        required: ['value'],
      },
    },
  },
]

export const cases = Object.freeze([
  ...['control', 'plain', 'details', 'inline'].map(variant => ({
    id: `glm53-${variant}`,
    model: 'z-ai/glm-5.3',
    provider: 'z-ai/fp8',
    variant,
  })),
  ...['control', 'long'].map(variant => ({
    id: `prime-${variant}`,
    model: 'z-ai/glm-5.3-prime',
    provider: 'alibaba',
    variant,
  })),
  ...['control', 'long'].map(variant => ({
    id: `flashx-${variant}`,
    model: 'z-ai/glm-5.3-flashx',
    provider: 'z-ai/fp8',
    variant,
  })),
])

export function makeBody(testCase) {
  if (!cases.some(item => item.id === testCase.id)) throw new Error('Unapproved probe case')
  const assistant = { role: 'assistant', content: finalAnswer, tool_calls: toolCalls }
  if (testCase.variant === 'plain') assistant.reasoning = historyText
  if (testCase.variant === 'details')
    assistant.reasoning_details = [
      { type: 'reasoning.text', text: historyText.slice(0, 240), index: 0 },
      { type: 'reasoning.text', text: historyText.slice(240), index: 1 },
    ]
  if (testCase.variant === 'inline')
    assistant.content = `<think>${historyText}</think>${finalAnswer}`
  const long = testCase.variant === 'long'
  const user = long
    ? `What arithmetic result was given? ${'Read all earlier material before answering. '.repeat(96)}`
    : 'What arithmetic result was given?'
  const system = { type: 'text', text: 'Answer the final question in one short sentence.' }
  const finalUserContent = [{ type: 'text', text: user }]
  if (testCase.provider === 'alibaba')
    finalUserContent[0].cache_control = { type: 'ephemeral', ttl: '5m' }
  return {
    model: testCase.model,
    provider: { order: [testCase.provider], allow_fallbacks: false, require_parameters: true },
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 64,
    messages: [
      { role: 'system', content: [system] },
      { role: 'user', content: 'Compute 17 times 19 with the lookup tool.' },
      assistant,
      { role: 'tool', tool_call_id: 'history_call_1', content: '17 × 19 = 323' },
      { role: 'user', content: finalUserContent },
    ],
    tools,
  }
}

export function summarize(records) {
  const byId = new Map(records.map(record => [record.id, record]))
  const delta = (left, right) => {
    const a = byId.get(left)?.promptTokens
    const b = byId.get(right)?.promptTokens
    return Number.isSafeInteger(a) && Number.isSafeInteger(b) ? b - a : null
  }
  return {
    glm53: {
      plainMinusControl: delta('glm53-control', 'glm53-plain'),
      detailsMinusControl: delta('glm53-control', 'glm53-details'),
      inlineMinusControl: delta('glm53-control', 'glm53-inline'),
      conclusion:
        'Usage deltas diagnose whether history affects this selected route; they do not establish the private reasoning_content transform or clear_thinking setting alone.',
    },
    prime: { longMinusControl: delta('prime-control', 'prime-long') },
    flashx: { longMinusControl: delta('flashx-control', 'flashx-long') },
    status: 'diagnostic_only_no_meter_binding',
  }
}

function args(argv) {
  const values = {}
  const allowed = new Set([
    'snapshot',
    'dry-run',
    'credential-file',
    'ledger',
    'approved-ledger',
    'output',
    'timeout-ms',
    'max-response-bytes',
  ])
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || !value || !allowed.has(name.slice(2)) || name.slice(2) in values)
      throw new Error('Invalid arguments')
    values[name.slice(2)] = value
  }
  if (!values.snapshot) throw new Error('--snapshot is required')
  if (values['dry-run'] === 'true') return { ...values, dryRun: true }
  if (values['dry-run'] !== undefined) throw new Error('--dry-run must be true')
  for (const name of ['credential-file', 'ledger', 'approved-ledger', 'output'])
    if (!values[name]) throw new Error(`--${name} is required for paid execution`)
  const timeoutMs = Number(values['timeout-ms'] ?? 60000)
  const maxResponseBytes = Number(values['max-response-bytes'] ?? 1000000)
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 300000 ||
    !Number.isSafeInteger(maxResponseBytes) ||
    maxResponseBytes < 1 ||
    maxResponseBytes > 10000000
  )
    throw new Error('Probe resource bounds invalid')
  return { ...values, timeoutMs, maxResponseBytes }
}

async function execute(values) {
  const snapshotSource = await readFile(values.snapshot, 'utf8')
  const snapshotSha256 = createHash('sha256').update(snapshotSource).digest('hex')
  const snapshot = JSON.parse(snapshotSource)
  const selected = cases.map(testCase => {
    const card = snapshot.cards?.find(item => item.id === testCase.model)
    const endpoint = card?.endpoints?.find(item => item.tag === testCase.provider)
    if (!endpoint?.pricing || !endpoint.provider)
      throw new Error(`Exact endpoint/pricing missing: ${testCase.id}`)
    return { testCase, endpoint, body: makeBody(testCase) }
  })
  if (values.dryRun) {
    for (const item of selected)
      process.stdout.write(
        `${item.testCase.id} ${item.testCase.provider} ${createHash('sha256').update(JSON.stringify(item.body)).digest('hex')}\n`,
      )
    return
  }
  const storedLedger = JSON.parse(await readFile(values.ledger, 'utf8'))
  const budget = {
    limitUsd: storedLedger.limitUsd,
    researchLimitUsd: storedLedger.researchLimitUsd,
  }
  const ledger = await openProductionLedger(values.ledger, values['approved-ledger'], budget)
  try {
    const credential = await readCredential(values['credential-file'])
    const directory = await privateOutputDirectory(values.output)
    if ((await readdir(directory)).length)
      throw new Error('Evidence directory must be empty before paid execution')
    const records = []
    for (const { testCase, endpoint, body } of selected) {
      const serialized = JSON.stringify(body)
      const estimateUsd = estimateReservation(endpoint.pricing, Buffer.byteLength(serialized), 64)
      const reservation = await ledger.reserve({
        model: testCase.model,
        provider: testCase.provider,
        stage: 'research',
        estimateUsd,
      })
      let response
      try {
        response = await sendOnce(body, credential, {
          timeoutMs: values.timeoutMs,
          maxResponseBytes: values.maxResponseBytes,
        })
      } catch (error) {
        await writePrivateEvidence(
          join(directory, `${testCase.id}.json`),
          JSON.stringify({ id: testCase.id, reservation, error: String(error) }),
        )
        await ledger.settle(reservation, undefined)
        throw error
      }
      if (response.raw.includes(credential))
        throw new Error('Credential in upstream response; reservation remains unresolved')
      let facts
      try {
        facts = response.status === 200 ? streamFacts(response.raw) : undefined
      } catch {
        // Keep the raw response, but leave cost unknown and stop further sends.
      }
      const record = {
        id: testCase.id,
        model: testCase.model,
        requestedProvider: testCase.provider,
        reportedProvider: facts?.provider ?? null,
        promptTokens: facts?.usage?.prompt_tokens ?? null,
        cachedTokens: facts?.cachedTokens ?? null,
        actualUsd: facts?.usage?.cost ?? null,
        snapshotSha256,
        requestSha256: createHash('sha256').update(serialized).digest('hex'),
        reservation,
      }
      await writePrivateEvidence(
        join(directory, `${testCase.id}.json`),
        JSON.stringify({ record, request: body, response, facts }, null, 2),
      )
      await ledger.settle(reservation, facts?.usage?.cost)
      if (
        response.status !== 200 ||
        !facts?.done ||
        !facts.finish ||
        facts.frames.some(frame => frame.error)
      )
        throw new Error(`Incomplete ${testCase.id}: stop after persisted evidence`)
      if (facts.provider !== endpoint.provider)
        throw new Error(`Provider mismatch ${testCase.id}: stop after persisted evidence`)
      records.push(record)
    }
    await writePrivateEvidence(
      join(directory, 'summary.json'),
      JSON.stringify({ snapshotSha256, records, analysis: summarize(records) }, null, 2),
    )
  } finally {
    await ledger.close()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  execute(args(process.argv.slice(2))).catch(error => {
    process.stderr.write(`${String(error)}\n`)
    process.exitCode = 1
  })
}
