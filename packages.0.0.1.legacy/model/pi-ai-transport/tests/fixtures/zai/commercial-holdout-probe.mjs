// Four fresh, bounded diagnostic sends. Only the approved paid owner may run them.
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
import { exactContextTokens, plainUsd } from './reasoning-mapping-probe.mjs'

const baseQuestion = '请读完工具记录后，只回答核验数值。'
const mixedQuestion =
  `${baseQuestion}\n代码与 JSON 仅作上下文：\n` +
  '```json\n{"标签":"甲乙丙🔬","values":[17,19,323],"valid":true}\n```\n'.repeat(12)

export const cases = Object.freeze(
  [
    { label: 'prime', model: 'z-ai/glm-5.3-prime', provider: 'alibaba' },
    { label: 'flashx', model: 'z-ai/glm-5.3-flashx', provider: 'z-ai/fp8' },
  ].flatMap(model =>
    ['base', 'mixed'].map(variant =>
      Object.freeze({ ...model, id: `${model.label}-${variant}`, variant }),
    ),
  ),
)

export function makeBody(testCase) {
  const approved = cases.find(item => item.id === testCase?.id)
  if (!approved) throw new Error('Unapproved holdout case')
  const content = [
    { type: 'text', text: approved.variant === 'base' ? baseQuestion : mixedQuestion },
  ]
  if (approved.provider === 'alibaba') content[0].cache_control = { type: 'ephemeral', ttl: '5m' }
  return {
    model: approved.model,
    provider: { order: [approved.provider], allow_fallbacks: false, require_parameters: true },
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 64,
    messages: [
      { role: 'system', content: [{ type: 'text', text: '仅核验记录中的数值；一句话作答。' }] },
      { role: 'user', content: '请调用 audit_value 核验十七乘十九。' },
      {
        role: 'assistant',
        content: '我已核验。',
        tool_calls: [
          {
            id: 'holdout_call_1',
            type: 'function',
            function: { name: 'audit_value', arguments: '{"左":17,"右":19}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'holdout_call_1', content: '核验值：323。状态：有效。' },
      { role: 'user', content },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'audit_value',
          description: '核验两个整数的积',
          parameters: {
            type: 'object',
            properties: { 左: { type: 'integer' }, 右: { type: 'integer' } },
            required: ['左', '右'],
          },
        },
      },
    ],
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
    const contextTokens = exactContextTokens(snapshot, testCase.model, endpoint)
    return {
      testCase,
      endpoint,
      contextTokens,
      reservationUsd: estimateReservation(endpoint.pricing, contextTokens, 64),
    }
  })
  if (values.dryRun) {
    for (const item of selected)
      process.stdout.write(
        `${item.testCase.id} ${item.testCase.provider} ${createHash('sha256')
          .update(JSON.stringify(makeBody(item.testCase)))
          .digest('hex')}\n`,
      )
    return
  }
  const storedLedger = JSON.parse(await readFile(values.ledger, 'utf8'))
  const ledger = await openProductionLedger(values.ledger, values['approved-ledger'], {
    limitUsd: storedLedger.limitUsd,
    researchLimitUsd: storedLedger.researchLimitUsd,
  })
  try {
    const credential = await readCredential(values['credential-file'])
    const directory = await privateOutputDirectory(values.output)
    if ((await readdir(directory)).length) throw new Error('Evidence directory must be empty')
    const records = []
    for (const { testCase, endpoint, contextTokens, reservationUsd } of selected) {
      const body = makeBody(testCase)
      const serialized = JSON.stringify(body)
      const reservation = await ledger.reserve({
        model: testCase.model,
        provider: testCase.provider,
        stage: 'research',
        estimateUsd: reservationUsd,
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
        // The raw response is retained; its cost is unknown.
      }
      const record = {
        id: testCase.id,
        model: testCase.model,
        requestedProvider: testCase.provider,
        reportedProvider: facts?.provider ?? null,
        promptTokens: facts?.usage?.prompt_tokens ?? null,
        cachedTokens: facts?.cachedTokens ?? null,
        rawCost: facts?.usage?.cost ?? null,
        actualUsd: plainUsd(facts?.usage?.cost) ?? null,
        reservationContextTokens: contextTokens,
        reservedUsd: reservationUsd,
        snapshotSha256,
        requestSha256: createHash('sha256').update(serialized).digest('hex'),
        reservation,
      }
      await writePrivateEvidence(
        join(directory, `${testCase.id}.json`),
        JSON.stringify({ record, request: body, response, facts }, null, 2),
      )
      await ledger.settle(reservation, record.actualUsd ?? undefined)
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
      JSON.stringify(
        { snapshotSha256, records, status: 'diagnostic_only_no_meter_binding' },
        null,
        2,
      ),
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
