#!/usr/bin/env node
// Issue #50 paid probe: does an empty text part {type:'text',text:''} next to an image part make
// OpenRouter (or the pinned upstream) reject a user message?  31 image-capable routes x 3 variants.
//
//   A1  content = [image_url, text('')]
//   A2  content = [text(''), image_url]
//   B   content = [image_url]              (control: same route, same image, no empty text)
//
// Modes (default is --dry-run, which never touches the network):
//   node probe.mjs                                   dry run, same as --dry-run
//   node probe.mjs --live --credential-file F --out D   paid run (F: file with OPENROUTER_API_KEY=...)
//   node probe.mjs --self-test                       offline check of this tool's own judgement
//
// This script deliberately does NOT use openLedger/paidInvocation: an HTTP 4xx has no usage.cost and
// the ledger would freeze the whole run in state 'unknown'.  It keeps its own reservation tally and
// uses the OpenRouter credit balance delta (read before and after) as the true total spend.
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url))
const PROBE_SRC = `${REPO}/tools/model-probe/src`
const NETWORK_URL = new URL(`file://${PROBE_SRC}/network.mjs`).href
const { estimateReservation, usdUnits, usdString } = await import(`${PROBE_SRC}/budget.mjs`)

// --- targets: 31 image-capable routes (copied from issue-50/prices.py; USD per token) ----------
const ROUTES = [
  ['openai/gpt-6-astra', 'openai', '0.00001', '0.00005'],
  ['openai/gpt-6-astra-pro', 'openai', '0.00001', '0.00005'],
  ['openai/gpt-6-sol', 'openai', '0.000002', '0.00001'],
  ['openai/gpt-6-sol-pro', 'openai', '0.000002', '0.00001'],
  ['openai/gpt-6-luna', 'openai', '0.0000001', '0.0000005'],
  ['openai/gpt-6-luna-pro', 'openai', '0.0000001', '0.0000005'],
  ['openai/gpt-5.6-sol', 'openai', '0.000002', '0.00001'],
  ['openai/gpt-5.6-sol-pro', 'openai', '0.000002', '0.00001'],
  ['openai/gpt-5.6-terra', 'openai', '0.000002', '0.000012'],
  ['openai/gpt-5.6-terra-pro', 'openai', '0.000002', '0.000012'],
  ['openai/gpt-5.6-luna', 'openai', '0.0000002', '0.0000012'],
  ['openai/gpt-5.6-luna-pro', 'openai', '0.0000002', '0.0000012'],
  ['anthropic/claude-opus-5.5', 'anthropic', '0.000004', '0.00002'],
  ['anthropic/claude-opus-5', 'anthropic', '0.000005', '0.000025'],
  ['anthropic/claude-sonnet-5', 'anthropic', '0.000002', '0.00001'],
  ['anthropic/claude-fable-5.1', 'anthropic', '0.00001', '0.00005'],
  ['deepseek/deepseek-v4.1-flash', 'deepinfra/fp8', '0.00000014', '0.00000042'],
  ['google/gemini-3.8-flash', 'google-ai-studio', '0.00000075', '0.00000375'],
  ['google/gemini-3.7-flash', 'google-ai-studio', '0.00000075', '0.00000375'],
  ['x-ai/grok-4.7', 'xai', '0.0000016', '0.0000048'],
  ['x-ai/grok-4.6', 'xai', '0.000002', '0.000006'],
  ['qwen/qwen3.8-max-0902', 'alibaba', '0.000002', '0.000006'],
  ['qwen/qwen3.8-max-prime', 'alibaba', '0.000004', '0.000012'],
  ['qwen/qwen3.8-flash', 'alibaba', '0.00000015', '0.00000047'],
  ['qwen/qwen3.8-27b', 'alibaba', '0.000000425', '0.00000255'],
  ['qwen/qwen3.7-plus', 'alibaba', '0.00000032', '0.00000128'],
  ['qwen/qwen3.7-flash', 'alibaba', '0.00000003', '0.00000013'],
  ['moonshotai/kimi-k3', 'moonshotai/mxfp4', '0.000003', '0.000015'],
  ['moonshotai/kimi-k2.7-code', 'moonshotai/int4', '0.00000095', '0.000004'],
  ['z-ai/glm-5.3-flash', 'z-ai/fp8', '0.00000015', '0.0000005'],
  ['z-ai/glm-5.3-flashx', 'z-ai/fp8', '0.00000037', '0.00000125'],
].map(([model, provider, prompt, completion]) => ({ model, provider, pricing: { prompt, completion } }))
const VARIANTS = ['A1', 'A2', 'B']
const MAX_TOKENS = 64

// --- the image: 32x32 solid-colour RGB PNG, built deterministically (no file, no dependency) ----
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function pngChunk(type, data) {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, tail])
}
export function makePng(size = 32, [r, g, b] = [214, 69, 65]) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 2, 0, 0, 0], 8) // 8-bit, truecolour, deflate, adaptive filter, no interlace
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())])
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}
const PNG = makePng()
const PNG_B64 = PNG.toString('base64')
const PNG_SHA256 = createHash('sha256').update(PNG).digest('hex')

// --- request construction -----------------------------------------------------------------------
// Part shapes are those of packages/model/pi-ai-transport/src/plan.ts parts():
//   text  -> { type: 'text', text }      image -> { type: 'image_url', image_url: { url: 'data:<mediaType>;base64,<inline>' } }
const imagePart = () => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${PNG_B64}` } })
const emptyText = () => ({ type: 'text', text: '' })
const CONTENT = {
  A1: () => [imagePart(), emptyText()],
  A2: () => [emptyText(), imagePart()],
  B: () => [imagePart()],
}
export function buildBody(route, variant) {
  return {
    model: route.model,
    provider: { order: [route.provider], allow_fallbacks: false, require_parameters: true },
    stream: true,
    usage: { include: true },
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: CONTENT[variant]() }],
  }
}
export function redactBody(body) {
  const copy = structuredClone(body)
  for (const message of copy.messages)
    for (const part of message.content)
      if (part.type === 'image_url') {
        const url = part.image_url.url
        part.image_url.url = `${url.slice(0, 40)}...[${url.length} chars, png sha256 ${PNG_SHA256.slice(0, 16)}]`
      }
  return copy
}
export function shapeOf(body) {
  return `[${body.messages[0].content.map(p => (p.type === 'text' ? `text(${JSON.stringify(p.text)})` : 'image')).join(', ')}]`
}

// --- own pre-flight: sendOnce's preconditions plus the exact content shape this probe intends ---
const FORBIDDEN = ['user', 'session_id', 'prompt_cache_key', 'models', 'route', 'plugins']
const ALLOWED = ['model', 'provider', 'stream', 'usage', 'max_tokens', 'messages']
export function preflight(body, variant, route) {
  const problems = []
  const p = body.provider
  if (p?.order?.length !== 1 || p.order[0] !== route.provider) problems.push('provider.order must be exactly [route.provider]')
  if (p?.allow_fallbacks !== false) problems.push('allow_fallbacks must be false')
  if (p?.require_parameters !== true) problems.push('require_parameters must be true')
  if (Object.keys(p ?? {}).sort().join() !== 'allow_fallbacks,order,require_parameters')
    problems.push('provider has unexpected keys')
  if (body.stream !== true) problems.push('stream must be true')
  for (const key of FORBIDDEN) if (Object.hasOwn(body, key)) problems.push(`forbidden field ${key}`)
  for (const key of Object.keys(body)) if (!ALLOWED.includes(key)) problems.push(`unexpected field ${key}`)
  if (body.model !== route.model) problems.push('model mismatch')
  if (body.max_tokens !== MAX_TOKENS) problems.push('max_tokens mismatch')
  if (JSON.stringify(body.usage) !== '{"include":true}') problems.push('usage must be {include:true}')
  const messages = body.messages
  if (!Array.isArray(messages) || messages.length !== 1 || messages[0].role !== 'user')
    problems.push('messages must be exactly one user message')
  else if (JSON.stringify(messages[0].content) !== JSON.stringify(CONTENT[variant]()))
    problems.push(`content does not match variant ${variant}`)
  const png = Buffer.from(PNG_B64, 'base64')
  if (png.readUInt32BE(16) !== 32 || png.readUInt32BE(20) !== 32 || png.subarray(1, 4).toString() !== 'PNG')
    problems.push('embedded image is not a 32x32 PNG')
  return problems
}

// --- budget ------------------------------------------------------------------------------------
// estimateReservation (budget.mjs:63-85) treats one input byte as one input token.  A tiny image can
// cost more tokens than its base64 length, so a fixed allowance is added on top of the body bytes.
export function reservationFor(route, body, imageTokenAllowance) {
  const inputBytes = Buffer.byteLength(JSON.stringify(body)) + imageTokenAllowance
  return estimateReservation(route.pricing, inputBytes, body.max_tokens)
}
// Decimal lexeme (possibly with exponent) -> integer units of 1e-18 USD, truncating below that.
export function toUnits(lexeme) {
  const m = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(lexeme))
  if (!m) throw new Error(`Not a nonnegative decimal: ${lexeme}`)
  const frac = m[2] ?? ''
  const shift = 18 + Number(m[3] ?? 0) - frac.length
  const digits = BigInt(m[1] + frac)
  return shift >= 0 ? digits * 10n ** BigInt(shift) : digits / 10n ** BigInt(-shift)
}
export function fmtUnits(units) {
  const negative = units < 0n
  const text = usdString(negative ? -units : units)
  return `${negative ? '-' : ''}${text.slice(0, text.length - 6)}`
}

// --- transport stub: lets the real sendOnce run its validation offline -------------------------
function installHttpsStub(script) {
  const original = https.request
  const calls = []
  const stub = (url, options, onResponse) => {
    const req = new EventEmitter()
    req.destroy = error => setImmediate(() => req.emit('error', error))
    req.end = serialized => {
      calls.push({ url: String(url), serialized })
      const scripted = script({ url: String(url), body: JSON.parse(serialized) })
      setImmediate(() => {
        if (scripted.transportError) {
          req.emit('error', new Error(scripted.transportError))
          req.emit('close')
          return
        }
        const res = new EventEmitter()
        res.statusCode = scripted.status
        onResponse(res)
        res.emit('data', Buffer.from(scripted.raw, 'utf8'))
        res.emit('end')
        req.emit('close')
      })
    }
    return req
  }
  https.request = stub
  syncBuiltinESMExports()
  return {
    calls,
    restore() {
      https.request = original
      syncBuiltinESMExports()
    },
  }
}
// Throws unless the stub is really what network.mjs will call: the offline guarantee of dry-run.
async function importNetworkStubbed(script) {
  const handle = installHttpsStub(script)
  const namespace = await import('node:https')
  if (namespace.request !== https.request || namespace.request.name === 'request')
    throw new Error('Offline guard failed: https.request is not the stub; refusing to continue')
  return { ...handle, network: await import(`${NETWORK_URL}?stub-${Math.random()}`) }
}
const okStream = 'data: {"id":"x","model":"m","provider":"p","choices":[{"delta":{"content":"."},"finish_reason":"stop"}],"usage":{"cost":0}}\n\ndata: [DONE]\n\n'

// Run every constructed body through the real sendOnce (stubbed transport) and our own preflight.
async function conformance(requests, bounds) {
  const { network, restore, calls } = await importNetworkStubbed(() => ({ status: 200, raw: okStream }))
  const failures = []
  try {
    for (const r of requests) {
      const own = preflight(r.body, r.variant, r.route)
      if (own.length) failures.push(`${r.label}: preflight: ${own.join('; ')}`)
      try {
        await network.sendOnce(r.body, 'dry-run-placeholder', bounds)
      } catch (error) {
        failures.push(`${r.label}: sendOnce: ${error.message}`)
      }
    }
  } finally {
    restore()
  }
  if (calls.length + failures.filter(f => f.includes('sendOnce:')).length !== requests.length)
    failures.push('stub call count does not match request count')
  return failures
}

// --- classification of one response (pure) ------------------------------------------------------
function textOfDeltas(frames) {
  return frames
    .flatMap(f => f.choices ?? [])
    .map(c => `${c.delta?.reasoning ?? ''}${c.delta?.content ?? ''}`)
    .join('')
    .slice(0, 200)
}
export function classify(result, network) {
  if (result.status !== 200)
    return { outcome: 'http_error', status: result.status, errorText: result.raw.slice(0, 8192) }
  let facts
  try {
    facts = network.streamFacts(result.raw)
  } catch (error) {
    return { outcome: 'parse_error', status: 200, parseError: error.message }
  }
  const errorFrame = facts.frames.find(f => f.error !== undefined)
  let inband = errorFrame?.error
  let usage = facts.usage
  if (!facts.frames.length) {
    // A 200 whose body is a plain JSON document, not SSE: surface an error object if it carries one.
    try {
      const doc = network.parseFacts(result.raw)
      inband = doc.error ?? inband
      usage = doc.usage ?? usage
    } catch {
      return { outcome: 'parse_error', status: 200, parseError: 'No SSE frames and body is not JSON' }
    }
  }
  const base = {
    status: 200,
    usage,
    provider: facts.provider,
    upstreamModel: facts.upstreamModel,
    requestId: facts.requestId,
    finish: facts.finish,
    outputPreview: textOfDeltas(facts.frames),
  }
  if (inband !== undefined) return { ...base, outcome: 'inband_error', inbandError: inband }
  if (facts.finish === 'error') return { ...base, outcome: 'inband_error', inbandError: { finish_reason: 'error' } }
  if (!facts.done || !facts.finish) return { ...base, outcome: 'incomplete' }
  return { ...base, outcome: 'accepted' }
}

// --- one request, with record ------------------------------------------------------------------
async function runOne({ r, estimate, send, network, credential, bounds, outDir }) {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  let outcome
  let aborted
  try {
    let pending
    try {
      pending = send(r.body, credential, bounds)
    } catch (error) {
      // sendOnce validates synchronously; a throw here is a programming error, not a network fact.
      throw Object.assign(new Error(`sendOnce rejected the request before sending: ${error.message}`), { fatal: true })
    }
    const result = await pending
    if (result.raw.includes(credential)) {
      result.raw = '[withheld: response contained the credential]'
      aborted = 'credential echoed in a response'
      outcome = { outcome: 'http_error', status: result.status, errorText: result.raw }
    } else outcome = { ...classify(result, network), rawResponse: result.raw.slice(0, 65536), rawTruncated: result.raw.length > 65536 }
  } catch (error) {
    if (error.fatal) throw error
    outcome = { outcome: 'transport_error', transportError: error.message, costUnknown: true }
  }
  const costLexeme = outcome.usage?.cost
  let costUnits
  if (costLexeme !== undefined && costLexeme !== null) {
    try {
      costUnits = toUnits(costLexeme)
    } catch {
      outcome.costParseError = String(costLexeme)
    }
  }
  const record = {
    index: r.index,
    route: r.route.model,
    providerRequested: r.route.provider,
    variant: r.variant,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    reservationUsd: estimate,
    costUsd: costUnits === undefined ? null : fmtUnits(costUnits),
    costReported: costUnits !== undefined,
    providerMismatch: outcome.provider !== undefined && outcome.provider !== r.route.provider,
    ...outcome,
    request: redactBody(r.body),
  }
  if (costUnits !== undefined && costUnits > toUnits(estimate)) {
    record.overReservation = true
    aborted ??= `actual cost ${fmtUnits(costUnits)} exceeded reservation ${estimate}`
  }
  await writeFile(join(outDir, `${String(r.index).padStart(2, '0')}-${r.route.model.replaceAll('/', '_')}-${r.variant}.json`), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  return { record, costUnits, aborted }
}

// --- whole run -----------------------------------------------------------------------------------
export async function runAll({ requests, capUsd, allowance, send, network, getCredits, credential, bounds, outDir, afterDelayMs, authFailStop, sleep }) {
  const cap = usdUnits(capUsd)
  // The before-balance is the first network action: if it fails nothing has been sent or spent.
  const before = await getCredits(credential)
  const results = []
  let reserved = 0n
  let stop
  let consecutiveAuth = 0
  for (const r of requests) {
    const estimate = reservationFor(r.route, r.body, allowance)
    if (!stop && reserved + toUnits(estimate) > cap) stop = `reservation cap ${capUsd} USD reached (reserved ${fmtUnits(reserved)})`
    if (stop) {
      results.push({ r, record: { outcome: 'skipped', skippedBecause: stop, reservationUsd: estimate } })
      continue
    }
    reserved += toUnits(estimate)
    const done = await runOne({ r, estimate, send, network, credential, bounds, outDir })
    results.push({ r, ...done })
    consecutiveAuth = [401, 402, 403].includes(done.record.status) ? consecutiveAuth + 1 : 0
    if (done.aborted) stop = done.aborted
    else if (consecutiveAuth >= authFailStop) stop = `${consecutiveAuth} consecutive 401/402/403 responses`
  }
  let after
  let afterError
  await sleep(afterDelayMs)
  try {
    after = await getCredits(credential)
  } catch (error) {
    afterError = error.message
  }
  return { results, before, after, afterError, reserved, stop }
}

// --- summary ---------------------------------------------------------------------------------------
function cell(entry) {
  if (!entry) return '-'
  const rec = entry.record
  const cost = rec.costUsd === null || rec.costUsd === undefined ? '$?' : `$${rec.costUsd}`
  switch (rec.outcome) {
    case 'accepted': return `ok ${cost}`
    case 'http_error': return `HTTP ${rec.status}`
    case 'inband_error': return `inband-error ${cost}`
    case 'transport_error': return 'net-error'
    case 'parse_error': return 'parse-error'
    case 'incomplete': return `incomplete ${cost}`
    case 'skipped': return 'skipped'
    default: return rec.outcome
  }
}
function verdict(byVariant) {
  const state = v => byVariant[v]?.record.outcome
  if (['A1', 'A2', 'B'].some(v => state(v) === undefined || state(v) === 'skipped')) return 'incomplete'
  if (state('B') !== 'accepted') return 'control-failed (inconclusive)'
  const rejected = ['A1', 'A2'].filter(v => state(v) !== 'accepted')
  return rejected.length ? `REJECTS empty text (${rejected.join('+')})` : 'accepts empty text'
}
export function renderSummary({ run, meta }) {
  const lines = ['# issue #50 empty-text probe', '']
  lines.push(`- started: ${meta.startedAt}`, `- finished: ${meta.finishedAt}`)
  lines.push(`- source: repo HEAD ${meta.head}; network.mjs sha256 ${meta.networkSha}; probe.mjs sha256 ${meta.probeSha}; node ${process.version}`)
  lines.push(`- image: 32x32 solid PNG, sha256 ${PNG_SHA256}, ${PNG.length} bytes; max_tokens ${MAX_TOKENS}; usage.include true`)
  lines.push(`- reservation cap ${meta.capUsd} USD, allowance ${meta.allowance} input tokens per request; reserved total ${fmtUnits(run.reserved)}`)
  if (run.stop) lines.push(`- STOPPED EARLY: ${run.stop}`)
  lines.push('', '| route | provider | A1 [img,""] | A2 ["",img] | B [img] | verdict |', '| --- | --- | --- | --- | --- | --- |')
  const byRoute = new Map()
  for (const entry of run.results) {
    const key = entry.r.route.model
    byRoute.set(key, { ...(byRoute.get(key) ?? { route: entry.r.route }), [entry.r.variant]: entry })
  }
  for (const [model, v] of byRoute)
    lines.push(`| ${model} | ${v.route.provider} | ${cell(v.A1)} | ${cell(v.A2)} | ${cell(v.B)} | ${verdict(v)} |`)
  const sent = run.results.filter(e => e.record.outcome !== 'skipped')
  const reported = sent.reduce((sum, e) => sum + (e.costUnits ?? 0n), 0n)
  const rejected = sent.filter(e => e.record.outcome !== 'accepted')
  lines.push('', '## Spend', '', `- requests sent: ${sent.length} of ${run.results.length}; skipped: ${run.results.length - sent.length}`)
  lines.push(`- sum of usage.cost reported in streams: ${fmtUnits(reported)} USD (requests with no reported cost: ${sent.filter(e => !e.record.costReported).length})`)
  if (run.after) {
    const delta = toUnits(run.after.totalUsage) - toUnits(run.before.totalUsage)
    lines.push(`- credits before: total_credits ${run.before.totalCredits}, total_usage ${run.before.totalUsage}`)
    lines.push(`- credits after:  total_credits ${run.after.totalCredits}, total_usage ${run.after.totalUsage}`)
    lines.push(`- **true total spend (total_usage delta): ${fmtUnits(delta)} USD**`)
    lines.push(`- delta minus reported stream costs: ${fmtUnits(delta - reported)} USD (positive means spend not explained by streamed usage.cost, e.g. billed rejections; the credits endpoint may lag, so re-read it later before concluding)`)
  } else lines.push(`- credits after: UNAVAILABLE (${run.afterError}); before: total_credits ${run.before.totalCredits}, total_usage ${run.before.totalUsage}; read the balance manually`)
  lines.push('', '## Rejected / anomalous requests (verbatim error text, first 500 chars)', '')
  if (!rejected.length) lines.push('none')
  for (const e of rejected) {
    const rec = e.record
    const text = rec.errorText ?? (rec.inbandError !== undefined ? JSON.stringify(rec.inbandError) : (rec.transportError ?? rec.parseError ?? rec.outcome))
    lines.push(`- ${e.r.label} (${rec.outcome}${rec.status ? ` ${rec.status}` : ''}, cost ${rec.costUsd ?? 'unreported'}): ${String(text).slice(0, 500).replaceAll('\n', ' ')}`)
  }
  const skipped = run.results.filter(e => e.record.outcome === 'skipped')
  if (skipped.length) lines.push('', `## Skipped (${skipped.length})`, '', skipped.map(e => e.r.label).join(', '))
  return `${lines.join('\n')}\n`
}

// --- construction & CLI ----------------------------------------------------------------------------
export function buildRequests(routes) {
  return routes.flatMap(route => VARIANTS.map(variant => ({ route, variant, body: buildBody(route, variant) }))).map((r, i) => ({
    ...r,
    index: i + 1,
    label: `#${i + 1} ${r.route.model}/${r.variant}`,
  }))
}
const DEFAULTS = { capUsd: '4.5', allowance: 2000, timeoutMs: 120000, maxResponseBytes: 1048576, afterDelayMs: 15000, authFailStop: 3 }
function parseArgs(argv) {
  const opts = { ...DEFAULTS, mode: 'dry-run' }
  const takesValue = {
    '--cap-usd': v => (opts.capUsd = v),
    '--out': v => (opts.out = v),
    '--credential-file': v => (opts.credentialFile = v),
    '--routes': v => (opts.routes = v.split(',').map(s => s.trim()).filter(Boolean)),
    '--image-token-allowance': v => (opts.allowance = Number(v)),
    '--timeout-ms': v => (opts.timeoutMs = Number(v)),
    '--max-response-bytes': v => (opts.maxResponseBytes = Number(v)),
    '--after-delay-ms': v => (opts.afterDelayMs = Number(v)),
    '--auth-fail-stop': v => (opts.authFailStop = Number(v)),
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') opts.mode = 'dry-run'
    else if (arg === '--live') opts.mode = 'live'
    else if (arg === '--self-test') opts.mode = 'self-test'
    else if (takesValue[arg]) {
      if (argv[i + 1] === undefined) throw new Error(`${arg} needs a value`)
      takesValue[arg](argv[++i])
    } else throw new Error(`Unknown argument ${arg}`)
  }
  if (!Number.isSafeInteger(opts.allowance) || opts.allowance < 0) throw new Error('--image-token-allowance must be a nonnegative integer')
  for (const key of ['timeoutMs', 'maxResponseBytes', 'afterDelayMs', 'authFailStop'])
    if (!Number.isSafeInteger(opts[key]) || opts[key] < (key === 'afterDelayMs' ? 0 : 1)) throw new Error(`Invalid ${key}`)
  usdUnits(opts.capUsd)
  return opts
}
function selectRoutes(names) {
  if (!names) return ROUTES
  const unknown = names.filter(n => !ROUTES.some(r => r.model === n))
  if (unknown.length) throw new Error(`Unknown routes: ${unknown.join(', ')}`)
  return ROUTES.filter(r => names.includes(r.model))
}
async function makeOutDir(path, { mustBeEmpty }) {
  await mkdir(path, { recursive: true, mode: 0o700 })
  await chmod(path, 0o700)
  if (mustBeEmpty && (await readdir(path)).length) throw new Error(`--out ${path} is not empty; refusing to risk re-spending`)
}
function sha256File(path) {
  return createHash('sha256').update(execFileSync('cat', [path])).digest('hex').slice(0, 16)
}
function sourceMeta() {
  let head = 'unknown'
  try {
    head = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {}
  return { head, networkSha: sha256File(`${PROBE_SRC}/network.mjs`), probeSha: sha256File(new URL(import.meta.url).pathname) }
}

async function dryRun(opts) {
  const requests = buildRequests(selectRoutes(opts.routes))
  const bounds = { timeoutMs: opts.timeoutMs, maxResponseBytes: opts.maxResponseBytes }
  console.log(`DRY RUN (no network, no credential). ${requests.length} requests; image ${PNG.length} bytes png, sha256 ${PNG_SHA256.slice(0, 16)}`)
  console.log('example body (base64 truncated):', JSON.stringify(redactBody(requests[0].body)))
  const cap = usdUnits(opts.capUsd)
  let total = 0n
  let fitting = 0
  for (const r of requests) {
    const estimate = reservationFor(r.route, r.body, opts.allowance)
    total += toUnits(estimate)
    if (total <= cap) fitting++
    console.log(`${String(r.index).padStart(2)} ${r.route.model.padEnd(28)} ${r.route.provider.padEnd(17)} ${r.variant.padEnd(2)} ${shapeOf(r.body).padEnd(26)} body ${String(Buffer.byteLength(JSON.stringify(r.body))).padStart(4)}B reserve ${fmtUnits(toUnits(estimate)).padStart(12)} cum ${fmtUnits(total)}`)
  }
  const failures = await conformance(requests, bounds)
  console.log(`conformance (real sendOnce on stubbed transport + own preflight): ${failures.length ? 'FAILED' : `${requests.length}/${requests.length} bodies pass`}`)
  for (const f of failures) console.log(`  ${f}`)
  console.log(`TOTAL RESERVATION ${fmtUnits(total)} USD for ${requests.length} requests (allowance ${opts.allowance} input tokens each, max_tokens ${MAX_TOKENS}); cap ${opts.capUsd}; ${fitting} of ${requests.length} fit under the cap`)
  if (failures.length) process.exitCode = 1
}

async function fetchCreditsWith(origin) {
  return async credential => {
    const response = await fetch(`${origin}/api/v1/credits`, {
      headers: { Authorization: `Bearer ${credential}` },
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    })
    const raw = await response.text()
    if (raw.includes(credential)) throw new Error('Credits response contained the credential; refusing to use it')
    if (!response.ok) throw new Error(`Credits HTTP ${response.status}: ${raw.slice(0, 200)}`)
    const keep = new Set(['total_credits', 'total_usage'])
    const data = JSON.parse(raw, (key, value, context) => (keep.has(key) && typeof value === 'number' ? context.source : value)).data
    if (!data || [data.total_credits, data.total_usage].some(v => typeof v !== 'string' || !/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)))
      throw new Error(`Unexpected credits shape: ${raw.slice(0, 200)}`)
    return { totalCredits: data.total_credits, totalUsage: data.total_usage, at: new Date().toISOString() }
  }
}

async function live(opts) {
  if (!opts.credentialFile || !opts.out) throw new Error('--live needs --credential-file and --out')
  const requests = buildRequests(selectRoutes(opts.routes))
  const bounds = { timeoutMs: opts.timeoutMs, maxResponseBytes: opts.maxResponseBytes }
  const failures = await conformance(requests, bounds)
  if (failures.length) throw new Error(`Pre-flight failed, nothing sent:\n${failures.join('\n')}`)
  await makeOutDir(opts.out, { mustBeEmpty: true })
  const network = await import(`${NETWORK_URL}?live`)
  if (https.request.name !== 'request') throw new Error('https.request is still patched; refusing to send')
  const credential = await network.readCredential(opts.credentialFile)
  const startedAt = new Date().toISOString()
  const run = await runAll({
    requests,
    capUsd: opts.capUsd,
    allowance: opts.allowance,
    send: network.sendOnce,
    network,
    getCredits: await fetchCreditsWith(network.origin),
    credential,
    bounds,
    outDir: opts.out,
    afterDelayMs: opts.afterDelayMs,
    authFailStop: opts.authFailStop,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  })
  const meta = { ...sourceMeta(), startedAt, finishedAt: new Date().toISOString(), capUsd: opts.capUsd, allowance: opts.allowance }
  await writeFile(join(opts.out, 'summary.md'), renderSummary({ run, meta }), { mode: 0o600 })
  console.log(`done: ${run.results.filter(e => e.record.outcome !== 'skipped').length} sent; summary at ${join(opts.out, 'summary.md')}${run.stop ? `; STOPPED: ${run.stop}` : ''}${run.afterError ? `; after-balance FAILED: ${run.afterError}` : ''}`)
  if (run.stop || run.afterError) process.exitCode = 1
}

// --- self-test: the tool's own judgement, offline, against scripted responses ---------------------
async function selfTest(opts) {
  const results = []
  const check = (name, ok, detail = '') => {
    results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`)
  }
  // 1. preflight catches representative violations
  const route = ROUTES[0]
  const mutants = {
    'two providers': b => (b.provider.order = ['a', 'b']),
    'fallbacks on': b => (b.provider.allow_fallbacks = true),
    'no require_parameters': b => delete b.provider.require_parameters,
    'not streaming': b => (b.stream = false),
    'session_id': b => (b.session_id = 's'),
    'plugins': b => (b.plugins = []),
    'reasoning param': b => (b.reasoning = { effort: 'low' }),
    'non-empty text': b => (b.messages[0].content[1].text = ' '),
    'swapped order': b => b.messages[0].content.reverse(),
  }
  for (const [name, mutate] of Object.entries(mutants)) {
    const body = buildBody(route, 'A1')
    mutate(body)
    check(`preflight rejects: ${name}`, preflight(body, 'A1', route).length > 0)
  }
  check('preflight accepts the real bodies', buildRequests(ROUTES).every(r => preflight(r.body, r.variant, r.route).length === 0))
  // 2. the real sendOnce rejects the same bodies (our preflight must not be looser on its own rules)
  {
    const { network, restore } = await importNetworkStubbed(() => ({ status: 200, raw: okStream }))
    try {
      const bounds = { timeoutMs: 1000, maxResponseBytes: 1 << 20 }
      for (const name of ['two providers', 'fallbacks on', 'no require_parameters', 'not streaming', 'session_id', 'plugins']) {
        const body = buildBody(route, 'A1')
        mutants[name](body)
        let threw = false
        try {
          await network.sendOnce(body, 'k', bounds)
        } catch {
          threw = true
        }
        check(`real sendOnce rejects: ${name}`, threw)
      }
    } finally {
      restore()
    }
  }
  // 3. full pipeline against scripted responses
  const out = await mkdtemp(join(tmpdir(), 'probe-selftest-'))
  const requests = buildRequests(ROUTES.slice(0, 4))
  const sse = (obj, done = true) => `data: ${JSON.stringify(obj)}\n\n${done ? 'data: [DONE]\n\n' : ''}`
  const script = ({ body }) => {
    const model = body.model
    const content = body.messages[0].content
    const empty = content.some(p => p.type === 'text')
    if (model === ROUTES[0].model && empty && content[0].type === 'image_url') return { status: 400, raw: '{"error":{"message":"text content blocks must be non-empty","code":400}}' }
    if (model === ROUTES[0].model && empty) return { status: 200, raw: sse({ id: 'i', provider: 'openai', error: { code: 400, message: 'empty text' }, choices: [{ finish_reason: 'error', delta: { content: '' } }] }) }
    if (model === ROUTES[1].model && empty) return { transportError: 'socket reset' }
    if (model === ROUTES[2].model && empty) return { status: 200, raw: '{"error":{"message":"plain json rejection","code":422}}' }
    if (model === ROUTES[3].model && empty && content[0].type === 'image_url') return { status: 200, raw: sse({ id: 'i', provider: 'openai', choices: [{ delta: { content: 'hi' }, finish_reason: 'stop' }], usage: { cost: 0.5, prompt_tokens: 9 } }) }
    return { status: 200, raw: sse({ id: 'i', provider: 'openai', choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }], usage: { cost: 0.00001234, prompt_tokens: 9 } }) }
  }
  const { network, restore } = await importNetworkStubbed(script)
  let run
  try {
    let usage = 10n * 10n ** 18n
    run = await runAll({
      requests,
      capUsd: '4.5',
      allowance: 2000,
      send: network.sendOnce,
      network,
      getCredits: async () => ({ totalCredits: '100', totalUsage: fmtUnits(usage), at: 't' }),
      credential: 'SELFTEST-SECRET',
      bounds: { timeoutMs: 1000, maxResponseBytes: 1 << 20 },
      outDir: out,
      afterDelayMs: 0,
      authFailStop: 3,
      sleep: async () => {
        usage += 12345678901234567n
      },
    })
  } finally {
    restore()
  }
  const by = (i, v) => run.results.find(e => e.r.index === i * 3 + VARIANTS.indexOf(v) + 1)?.record
  check('4xx recorded as http_error with body text', by(0, 'A1').outcome === 'http_error' && by(0, 'A1').status === 400 && by(0, 'A1').errorText.includes('non-empty'))
  check('4xx has cost unreported, not zero', by(0, 'A1').costUsd === null && by(0, 'A1').costReported === false)
  check('in-band error frame in a 200 is not accepted', by(0, 'A2').outcome === 'inband_error' && by(0, 'A2').inbandError.code === 400)
  check('transport error recorded and the run continued', by(1, 'A1').outcome === 'transport_error' && by(1, 'A2').outcome === 'transport_error' && by(1, 'B').outcome === 'accepted')
  check('200 plain-JSON error body is not accepted', by(2, 'A1').outcome === 'inband_error' && by(2, 'A1').inbandError.code === 422)
  check('control B accepted with cost lexeme kept', by(0, 'B').outcome === 'accepted' && by(0, 'B').costUsd.startsWith('0.00001234'))
  check('over-reservation cost aborts the run', by(3, 'A1').overReservation === true && run.stop?.includes('exceeded reservation') && by(3, 'A2')?.outcome === 'skipped')
  const files = await readdir(out)
  check('one record per sent request', files.length === run.results.filter(e => e.record.outcome !== 'skipped').length, `${files.length} files`)
  const text = renderSummary({ run, meta: { ...sourceMeta(), startedAt: 'a', finishedAt: 'b', capUsd: '4.5', allowance: 2000 } })
  check('summary flags rejection verdict', text.includes('REJECTS empty text (A1+A2)') && text.includes('control-failed') === false)
  check('summary carries true spend from balance delta', text.includes('0.012345678901'))
  check('credential never persisted', !(await Promise.all(files.map(async f => (await import('node:fs/promises')).readFile(join(out, f), 'utf8')))).some(t => t.includes('SELFTEST-SECRET')) && !text.includes('SELFTEST-SECRET'))
  // 4. cap stops before sending; before-balance failure sends nothing
  {
    const { network: n2, restore: r2, calls } = await importNetworkStubbed(script)
    try {
      const out2 = await mkdtemp(join(tmpdir(), 'probe-selftest-'))
      const tiny = await runAll({ requests: buildRequests(ROUTES.slice(4, 6)), capUsd: '0.0005', allowance: 2000, send: n2.sendOnce, network: n2, getCredits: async () => ({ totalCredits: '1', totalUsage: '0', at: 't' }), credential: 'SELFTEST-SECRET-OTHER', bounds: { timeoutMs: 1000, maxResponseBytes: 1 << 20 }, outDir: out2, afterDelayMs: 0, authFailStop: 3, sleep: async () => {} })
      check('cap stops sending and marks the rest skipped', calls.length === 1 && tiny.stop?.startsWith('reservation cap') && tiny.results.slice(calls.length).every(e => e.record.outcome === 'skipped'), `calls=${calls.length}`)
      const before = calls.length
      let failed = false
      try {
        await runAll({ requests: buildRequests(ROUTES.slice(0, 1)), capUsd: '4.5', allowance: 2000, send: n2.sendOnce, network: n2, getCredits: async () => { throw new Error('credits down') }, credential: 'SELFTEST-SECRET-OTHER', bounds: { timeoutMs: 1000, maxResponseBytes: 1 << 20 }, outDir: out2, afterDelayMs: 0, authFailStop: 3, sleep: async () => {} })
      } catch {
        failed = true
      }
      check('balance-read failure aborts before any request', failed && calls.length === before)
    } finally {
      r2()
    }
  }
  {
    const echo = await importNetworkStubbed(() => ({ status: 400, raw: '{"error":"bad key SELFTEST-SECRET"}' }))
    try {
      const out3 = await mkdtemp(join(tmpdir(), 'probe-selftest-'))
      const leaked = await runAll({ requests: buildRequests(ROUTES.slice(0, 1)), capUsd: '4.5', allowance: 2000, send: echo.network.sendOnce, network: echo.network, getCredits: async () => ({ totalCredits: '1', totalUsage: '0', at: 't' }), credential: 'SELFTEST-SECRET', bounds: { timeoutMs: 1000, maxResponseBytes: 1 << 20 }, outDir: out3, afterDelayMs: 0, authFailStop: 3, sleep: async () => {} })
      const written = await Promise.all((await readdir(out3)).map(async f => (await import('node:fs/promises')).readFile(join(out3, f), 'utf8')))
      check('credential echoed by a response stops the run and is withheld', leaked.stop === 'credential echoed in a response' && !written.some(t => t.includes('SELFTEST-SECRET')))
    } finally {
      echo.restore()
    }
  }
  check('toUnits handles exponent lexemes', toUnits('1.5e-7') === 150000000000n && toUnits('0.000001') === 1000000000000n)
  if (results.includes(false)) process.exitCode = 1
  console.log(`self-test: ${results.filter(Boolean).length}/${results.length} passed`)
}

const opts = parseArgs(process.argv.slice(2))
if (opts.mode === 'live') await live(opts)
else if (opts.mode === 'self-test') await selfTest(opts)
else await dryRun(opts)
