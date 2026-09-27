import { request } from 'node:https'
import { readFile } from 'node:fs/promises'

export const origin = 'https://openrouter.ai'
export async function readCredential(path) {
  const source = await readFile(path, 'utf8')
  const matches = [...source.matchAll(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/gm)]
  if (matches.length !== 1) throw new Error('Expected exactly one explicit OpenRouter credential')
  let value = matches[0][1]
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
    value = value.slice(1, -1)
  if (!value.trim() || /[\r\n]/.test(value)) throw new Error('Invalid credential')
  return value
}
export function parseFacts(raw) {
  // Retain numeric cost lexemes instead of converting money through IEEE doubles.
  return JSON.parse(raw, (key, value, context) =>
    key === 'cost' && typeof value === 'number' ? context.source : value,
  )
}
export async function getPublic(path) {
  if (!path.startsWith('/api/v1/models')) throw new Error('Invalid public endpoint')
  const response = await fetch(`${origin}${path}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`Public directory HTTP ${response.status}`)
  return { raw: await response.text(), observedAt: new Date().toISOString() }
}
export function sendOnce(body, credential, { timeoutMs, maxResponseBytes }) {
  if (
    !credential.trim() ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isSafeInteger(maxResponseBytes) ||
    maxResponseBytes < 1
  )
    throw new Error('Invalid request bounds')
  if (
    body.provider?.order?.length !== 1 ||
    body.provider.allow_fallbacks !== false ||
    body.provider.require_parameters !== true ||
    !body.stream
  )
    throw new Error('Probe must pin routing and stream')
  if (
    ['user', 'session_id', 'prompt_cache_key', 'models', 'route', 'plugins'].some(key =>
      Object.hasOwn(body, key),
    )
  )
    throw new Error('Forbidden request field')
  const serialized = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    let timer
    const req = request(
      `${origin}/api/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credential}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(serialized),
        },
      },
      res => {
        const chunks = []
        let bytes = 0
        res.on('data', chunk => {
          bytes += chunk.length
          if (bytes > maxResponseBytes) req.destroy(new Error('Response bound exceeded'))
          else chunks.push(chunk)
        })
        res.on('error', () =>
          reject(new Error('Probe response stream failed; cost requires reconciliation')),
        )
        res.on('end', () =>
          resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString('utf8') }),
        )
      },
    )
    timer = setTimeout(
      () => req.destroy(new Error('Probe timeout; cost requires reconciliation')),
      timeoutMs,
    )
    req.on('close', () => clearTimeout(timer))
    req.on('error', () =>
      reject(new Error('Probe connection failed; cost requires reconciliation')),
    )
    req.end(serialized)
  })
}
export function streamFacts(raw) {
  const frames = []
  let done = false
  for (const event of raw.replaceAll('\r\n', '\n').split('\n\n')) {
    const data = event
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
    if (!data) continue
    if (done) throw new Error('Trailing SSE event after DONE')
    if (data === '[DONE]') {
      done = true
      continue
    }
    frames.push(parseFacts(data))
  }
  const usage = frames.filter(f => f.usage).at(-1)?.usage
  const provider = frames.find(f => f.provider)?.provider
  const requestId = frames.find(f => f.id)?.id
  const upstreamModel = frames.find(f => f.model)?.model
  const finish = frames.flatMap(f => f.choices ?? []).findLast(c => c.finish_reason)?.finish_reason
  return {
    frames,
    done,
    usage,
    provider,
    requestId,
    upstreamModel,
    finish,
    cachedTokens: usage?.prompt_tokens_details?.cached_tokens,
    cacheWriteTokens: usage?.prompt_tokens_details?.cache_write_tokens,
  }
}
