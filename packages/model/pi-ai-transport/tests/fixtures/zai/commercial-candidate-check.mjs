// Offline diagnostic for a public-template candidate; it never binds a meter.
// Run with: node --experimental-strip-types commercial-candidate-check.mjs --fit DIR [--holdout DIR]
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { glm5Tokenizer } from '../../../src/input-meters/zai-glm52.ts'
import { renderGlm53Prompt } from '../../../src/input-meters/zai-glm53.ts'

export function candidatePrompt(body) {
  const projected = structuredClone(body)
  // These fields are OpenRouter transport/cache controls, absent from the
  // pinned local template. Their server-side effects are still unknown.
  delete projected.stream_options
  for (const message of projected.messages ?? []) {
    if (!Array.isArray(message.content)) continue
    for (const part of message.content) delete part.cache_control
  }
  return renderGlm53Prompt(projected, false)
}

export function candidateTokens(body) {
  const prompt = candidatePrompt(body)
  if (prompt === undefined) throw new Error('Candidate cannot render this final wire')
  return glm5Tokenizer().encode(prompt, { add_special_tokens: false }).ids.length
}

async function evidence(directory, id) {
  const source = await readFile(join(directory, `${id}.json`))
  const item = JSON.parse(source.toString('utf8'))
  if (item.record?.id !== id || !Number.isSafeInteger(item.record.promptTokens) || !item.request)
    throw new Error(`Missing complete usage/request: ${id}`)
  const prime = id.startsWith('prime-')
  const model = prime ? 'z-ai/glm-5.3-prime' : 'z-ai/glm-5.3-flashx'
  const tag = prime ? 'alibaba' : 'z-ai/fp8'
  const provider = prime ? 'Alibaba' : 'Z.AI'
  if (
    item.request.model !== model ||
    item.request.provider?.order?.length !== 1 ||
    item.request.provider.order[0] !== tag ||
    item.request.provider.allow_fallbacks !== false ||
    item.record.reportedProvider !== provider ||
    !item.facts?.done ||
    !item.facts.finish
  )
    throw new Error(`Incomplete or mismatched selected route: ${id}`)
  const requestSha256 = createHash('sha256').update(JSON.stringify(item.request)).digest('hex')
  if (requestSha256 !== item.record.requestSha256)
    throw new Error(`Recorded request hash mismatch: ${id}`)
  const candidate = candidateTokens(item.request)
  return {
    id,
    evidenceSha256: createHash('sha256').update(source).digest('hex'),
    requestSha256,
    observed: item.record.promptTokens,
    candidate,
    residual: item.record.promptTokens - candidate,
    provider: item.record.reportedProvider,
    cachedTokens: item.record.cachedTokens,
    finish: item.facts.finish,
  }
}

function args(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!['--fit', '--holdout'].includes(name) || !value || name in values)
      throw new Error('Usage: --fit DIR [--holdout DIR]')
    values[name] = value
  }
  if (!values['--fit']) throw new Error('--fit DIR required')
  return values
}

async function execute(values) {
  const fit = {}
  for (const model of ['prime', 'flashx']) {
    fit[model] = await Promise.all(
      ['control', 'long'].map(variant => evidence(values['--fit'], `${model}-${variant}`)),
    )
  }
  const fittedOffset = {}
  for (const model of ['prime', 'flashx']) {
    const [control, long] = fit[model]
    fittedOffset[model] = control.residual === long.residual ? control.residual : null
  }
  const result = { fit, fittedOffset, status: 'diagnostic_only_no_meter_binding' }
  if (values['--holdout']) {
    result.holdout = {}
    for (const model of ['prime', 'flashx']) {
      result.holdout[model] = await Promise.all(
        ['base', 'mixed'].map(variant => evidence(values['--holdout'], `${model}-${variant}`)),
      )
      result.holdout[model] = result.holdout[model].map(item => ({
        ...item,
        errorAfterFit: fittedOffset[model] === null ? null : item.residual - fittedOffset[model],
      }))
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  execute(args(process.argv.slice(2))).catch(error => {
    process.stderr.write(`${String(error)}\n`)
    process.exitCode = 1
  })
}
