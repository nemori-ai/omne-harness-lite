// Six frozen Qwen conversion probes. Only `run` sends; `dry` has no ledger or credential input.
import { createHash } from 'node:crypto'
import { readFile, open, readdir } from 'node:fs/promises'
import { request } from 'node:https'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  estimateReservation,
  usdUnits,
} from '../../../../../../../tools/model-probe/src/budget.mjs'
import {
  openProductionLedger,
  privateOutputDirectory,
  writePrivateEvidence,
} from '../../../../../../../tools/model-probe/src/production-gate.mjs'
import {
  origin,
  parseFacts,
  readCredential,
  streamFacts,
} from '../../../../../../../tools/model-probe/src/network.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const files = [
  '08-qwen3.8-max-0902-english.json',
  '09-qwen3.8-max-0902-chinese.json',
  '10-qwen3.8-max-0902-code.json',
  '11-qwen3.8-max-0902-mixed-text.json',
  '38-qwen3.8-27b-red-544.json',
  '39-qwen3.8-27b-blue-1024.json',
]

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Expand a JSON monetary lexeme without IEEE-754 arithmetic. */
export function decimalCost(source) {
  if (typeof source !== 'string') return undefined
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source)
  if (!match) return undefined
  const exponent = Number(match[3] ?? '0')
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) return undefined
  const digits = `${match[1]}${match[2] ?? ''}`
  const scale = (match[2] ?? '').length - exponent
  if (digits.length + Math.abs(scale) > 2000) return undefined
  let expanded
  if (scale <= 0) expanded = `${digits}${'0'.repeat(-scale)}`
  else if (scale >= digits.length) expanded = `0.${'0'.repeat(scale - digits.length)}${digits}`
  else expanded = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
  const [whole, fraction] = expanded.split('.')
  const canonical = `${BigInt(whole).toString()}${fraction === undefined ? '' : `.${fraction}`}`
  return canonical
}

function options(args) {
  const [command, ...rest] = args
  if (command !== 'dry' && command !== 'run') throw new Error('Choose dry or run')
  if (rest.length % 2 !== 0) throw new Error('Expected --option value pairs')
  const values = new Map()
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]
    if (!key?.startsWith('--') || values.has(key)) throw new Error('Invalid or duplicate option')
    values.set(key, rest[index + 1])
  }
  const allowed =
    command === 'dry'
      ? ['--snapshot']
      : [
          '--snapshot',
          '--credential-file',
          '--ledger',
          '--approved-ledger',
          '--output',
          '--limit-usd',
          '--research-limit-usd',
          '--timeout-ms',
          '--max-response-bytes',
        ]
  if (values.size !== allowed.length || allowed.some(key => !values.get(key)))
    throw new Error(`Required options: ${allowed.join(', ')}`)
  return { command, values }
}

export async function prepare(snapshotPath) {
  const manifest = JSON.parse(await readFile(join(here, 'manifest.json'), 'utf8'))
  const snapshotBytes = await readFile(snapshotPath)
  const snapshotSha256 = sha256(snapshotBytes)
  if (snapshotSha256 !== manifest.snapshotSha256)
    throw new Error('Endpoint snapshot differs from frozen Qwen probe input')
  const snapshot = JSON.parse(snapshotBytes.toString('utf8'))
  if (snapshot.format !== 1 || !Array.isArray(snapshot.cards))
    throw new Error('Invalid endpoint snapshot')
  if (
    manifest.version !== 1 ||
    manifest.cases?.length !== files.length ||
    files.some((file, index) => manifest.cases[index]?.file !== file)
  )
    throw new Error('Invalid frozen Qwen case manifest')
  const cases = []
  for (const [index, entry] of manifest.cases.entries()) {
    const wire = await readFile(join(here, entry.file))
    if (sha256(wire) !== entry.sha256)
      throw new Error(`Frozen Qwen wire SHA differs: ${entry.file}`)
    const body = JSON.parse(wire.toString('utf8'))
    if (
      body.model !== entry.model ||
      body.provider?.order?.length !== 1 ||
      body.provider.order[0] !== 'alibaba' ||
      body.provider.allow_fallbacks !== false ||
      body.provider.require_parameters !== true ||
      body.stream !== false ||
      body.max_tokens !== 16 ||
      !Array.isArray(body.messages) ||
      body.messages.length !== 1
    )
      throw new Error(`Frozen Qwen wire changed shape: ${entry.file}`)
    const card = snapshot.cards.find(item => item.id === entry.model)
    const endpoints = card?.endpoints?.filter(item => item.tag === entry.provider)
    if (card?.state !== 'directory_present' || endpoints?.length !== 1)
      throw new Error(`Exact Alibaba endpoint missing: ${entry.model}`)
    const endpoint = endpoints[0]
    if (!Number.isSafeInteger(endpoint.contextLength) || endpoint.contextLength < 1)
      throw new Error(`Exact endpoint context missing: ${entry.model}`)
    const estimateUsd = estimateReservation(
      endpoint.pricing,
      Math.max(endpoint.contextLength, wire.length),
      body.max_tokens,
    )
    cases.push({
      number: index + 1,
      file: entry.file,
      sha256: entry.sha256,
      model: entry.model,
      providerTag: entry.provider,
      providerName: endpoint.provider,
      snapshotSha256,
      estimateUsd,
      wire,
    })
  }
  return cases
}

function positiveInteger(value, name) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`Invalid ${name}`)
  return number
}

function sendRawOnce(wire, credential, timeoutMs, maxResponseBytes) {
  return new Promise((resolve, reject) => {
    const req = request(
      `${origin}/api/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credential}`,
          'Content-Type': 'application/json',
          'Content-Length': wire.length,
        },
      },
      response => {
        const chunks = []
        let size = 0
        response.on('data', chunk => {
          size += chunk.length
          if (size > maxResponseBytes) req.destroy(new Error('Response bound exceeded'))
          else chunks.push(chunk)
        })
        response.on('error', () => reject(new Error('Response interrupted; actual cost unknown')))
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: {
              'content-type': response.headers['content-type'],
              'x-generation-id': response.headers['x-generation-id'],
              'x-openrouter-cache-status': response.headers['x-openrouter-cache-status'],
            },
            raw: Buffer.concat(chunks).toString('utf8'),
          }),
        )
      },
    )
    const timer = setTimeout(
      () => req.destroy(new Error('Probe timeout; actual cost unknown')),
      timeoutMs,
    )
    req.on('close', () => clearTimeout(timer))
    req.on('error', () => reject(new Error('Connection failed; actual cost unknown')))
    req.end(wire)
  })
}

async function durableEvidence(directory, name, evidence) {
  await writePrivateEvidence(join(directory, name), `${JSON.stringify(evidence, null, 2)}\n`)
  const handle = await open(directory, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function receiptFacts(receipt) {
  let parsed
  const streaming = String(receipt.headers['content-type']).includes('text/event-stream')
  try {
    parsed = streaming ? streamFacts(receipt.raw) : parseFacts(receipt.raw)
  } catch {
    return {
      actualUsd: undefined,
      promptTokens: undefined,
      provider: undefined,
      id: undefined,
      complete: false,
    }
  }
  const usage = parsed?.usage
  return {
    actualUsd: decimalCost(usage?.cost),
    promptTokens: usage?.prompt_tokens,
    provider: parsed?.provider,
    id: parsed?.id ?? parsed?.requestId,
    complete: !streaming || parsed?.done === true,
  }
}

export async function run(cases, values) {
  const budget = {
    limitUsd: values.get('--limit-usd'),
    researchLimitUsd: values.get('--research-limit-usd'),
  }
  const timeoutMs = positiveInteger(values.get('--timeout-ms'), 'timeoutMs')
  const maxResponseBytes = positiveInteger(values.get('--max-response-bytes'), 'maxResponseBytes')
  const output = await privateOutputDirectory(values.get('--output'))
  if ((await readdir(output)).length !== 0)
    throw new Error('Output directory must be empty; no implicit replay')
  const ledger = await openProductionLedger(
    values.get('--ledger'),
    values.get('--approved-ledger'),
    budget,
  )
  try {
    const credential = await readCredential(values.get('--credential-file'))
    const observations = []
    for (const item of cases) {
      const reservationId = await ledger.reserve({
        model: item.model,
        provider: item.providerTag,
        stage: 'research',
        estimateUsd: item.estimateUsd,
      })
      let receipt
      try {
        receipt = await sendRawOnce(item.wire, credential, timeoutMs, maxResponseBytes)
      } catch {
        try {
          await durableEvidence(output, `${item.file}.failure.json`, {
            reservationId,
            model: item.model,
            requestSha256: item.sha256,
            outcome: 'external_result_unknown',
          })
        } finally {
          await ledger.settle(reservationId, undefined)
        }
        throw new Error('Unreachable: unknown settlement stops this batch')
      }
      if (receipt.raw.includes(credential)) {
        await ledger.settle(reservationId, undefined)
        throw new Error('Response contained credential; cost unknown; batch stopped')
      }
      await durableEvidence(output, `${item.file}.receipt.json`, {
        reservationId,
        model: item.model,
        providerRequested: item.providerTag,
        requestSha256: item.sha256,
        snapshotSha256: item.snapshotSha256,
        estimateUsd: item.estimateUsd,
        response: receipt,
      })
      const facts = receiptFacts(receipt)
      await ledger.settle(reservationId, facts.actualUsd)
      if (
        receipt.status !== 200 ||
        !facts.complete ||
        !Number.isSafeInteger(facts.promptTokens) ||
        facts.promptTokens < 1 ||
        receipt.headers['x-openrouter-cache-status'] === 'HIT'
      )
        throw new Error(`Case ${item.file} lacks valid prompt usage; batch stopped`)
      observations.push({
        file: item.file,
        sha256: item.sha256,
        requestedModel: item.model,
        requestedProviderTag: item.providerTag,
        actualProviderTag: facts.provider === item.providerTag ? item.providerTag : null,
        providerEvidence: facts.provider ?? null,
        generationId: facts.id ?? receipt.headers['x-generation-id'] ?? null,
        status: receipt.status,
        promptTokens: facts.promptTokens,
        actualUsd: facts.actualUsd,
      })
    }
    await durableEvidence(output, 'observations.json', observations)
    return observations
  } finally {
    await ledger.close()
  }
}

async function main(args) {
  const { command, values } = options(args)
  const cases = await prepare(values.get('--snapshot'))
  if (command === 'dry') {
    const total = cases.reduce((sum, item) => sum + usdUnits(item.estimateUsd), 0n)
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: 'dry',
          requestCount: cases.length,
          cases: cases.map(({ number, file, sha256, model, estimateUsd }) => ({
            number,
            file,
            sha256,
            model,
            estimateUsd,
          })),
          reservationTotalUnits1e18: total.toString(),
        },
        null,
        2,
      )}\n`,
    )
    return
  }
  const observations = await run(cases, values)
  // Pinned tokenizer predictions for 08/09/10/11, recorded in CANDIDATE.md.
  const maxTextPredictions = [17, 17, 26, 32]
  process.stdout.write(
    `${JSON.stringify({
      mode: 'research-only',
      completed: observations.length,
      output: values.get('--output'),
      maxTextSampleResiduals: observations
        .slice(0, 4)
        .map((item, index) => item.promptTokens - maxTextPredictions[index]),
      imageDelta:
        observations[5]?.promptTokens !== undefined && observations[4]?.promptTokens !== undefined
          ? observations[5].promptTokens - observations[4].promptTokens
          : null,
      expectedImageDelta: 735,
    })}\n`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
