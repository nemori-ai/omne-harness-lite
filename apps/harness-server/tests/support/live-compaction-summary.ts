import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { openSecretVault } from '@omne-harness/settings-local/secrets'
import { resolveLocations } from '../../src/local/locations.ts'
import type { GatewayAnswer } from '../fixtures/model-gateway.ts'

const DIRECTORY = '/tmp/omne-1310-compaction-delivery'
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

export function liveCompactionSummary() {
  const located = resolveLocations({
    platform: process.platform,
    env: process.env,
    home: homedir(),
  })
  if (located.kind !== 'located')
    throw new Error('the local Model credential location is unavailable')
  const opened = openSecretVault({ path: located.locations.vaultFile })
  if (opened.kind !== 'open') throw new Error(`the local Model vault is ${opened.cause}`)
  const credential = opened.vault.use({
    scope: { layer: 'official' },
    purpose: 'setting',
    target: {
      owner: 'setting',
      key: '["official/model-provider/openrouter","openrouter","apiKey"]',
    },
  })
  opened.vault.close()
  if (typeof credential === 'string')
    throw new Error(`the official Model credential is ${credential}`)
  const calls: {
    model: unknown
    requestBytes: number
    requestHash: string
    status: number
    responseBytes: number
    responseHash: string
  }[] = []
  function record(evidence: Readonly<Record<string, unknown>>) {
    mkdirSync(DIRECTORY, { recursive: true })
    writeFileSync(
      `${DIRECTORY}/real-model-quality.json`,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          calls,
          ...evidence,
        },
        null,
        2,
      ) + '\n',
    )
  }
  return {
    record,
    async summarize(body: string): Promise<GatewayAnswer> {
      const parsed: unknown = JSON.parse(body)
      const model =
        typeof parsed === 'object' && parsed !== null && 'model' in parsed ? parsed.model : null
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(120_000),
        headers: {
          authorization: `Bearer ${credential.value}`,
          'content-type': 'application/json',
        },
        body,
      })
      const text = await response.text()
      calls.push({
        model,
        requestBytes: Buffer.byteLength(body),
        requestHash: hash(body),
        status: response.status,
        responseBytes: Buffer.byteLength(text),
        responseHash: hash(text),
      })
      record({ stage: 'response-received' })
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        body: text,
      }
    },
  }
}
