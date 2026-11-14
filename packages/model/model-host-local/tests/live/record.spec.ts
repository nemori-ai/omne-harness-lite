// @module-tag slow — the recorder of real requests: one HTTPS request through the environment's
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import type { ProxyConfig } from '@omne-harness/pi-ai-transport'
import { recordRound } from '../support/recorder.ts'
import {
  continuedRequest,
  firstRoundRequest,
  ALL_RECORD_CASE_NAMES,
  isRecordCaseName,
  RECORD_CASES,
  replayRound,
} from '../support/recording-cases.ts'

const DEFAULT_OUTPUT = fileURLToPath(
  new URL('../../../pi-ai-transport/tests/fixtures/recordings/', import.meta.url),
)
const DEFAULT_TARGET = 'https://openrouter.ai/'
const CONNECT_TIMEOUT_MS = 30_000

function proxyFromEnvironment(): ProxyConfig {
  const url = process.env.HTTPS_PROXY
  if (url === undefined || url === '')
    throw new Error('the recorder requires HTTPS_PROXY: the credential is added by the proxy')
  const bypass = (process.env.NO_PROXY ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry !== '')
  return { url, bypass }
}

it('records one real request of the named case', { timeout: 300_000 }, async ctx => {
  const name = process.env.OMNE_RECORD_CASE ?? ''
  if (process.env.OMNE_LIVE_TESTS !== '1' || name === '') ctx.skip()
  if (!isRecordCaseName(name))
    throw new Error(`OMNE_RECORD_CASE must be one of ${ALL_RECORD_CASE_NAMES.join(', ')}`)
  const item = RECORD_CASES[name]
  const output = process.env.OMNE_RECORD_OUT || DEFAULT_OUTPUT
  const ca = process.env.OMNE_RECORD_CA
  const gateway = {
    url: new URL(process.env.OMNE_RECORD_TARGET || DEFAULT_TARGET),
    ...(ca === undefined || ca === '' ? {} : { ca: readFileSync(ca) }),
    proxy: proxyFromEnvironment(),
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
  }
  const vault = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-record-')))
  try {
    let request = firstRoundRequest(item)
    if (item.round.kind === 'continued') {
      const first = firstRoundRequest(RECORD_CASES[item.round.first])
      const replayed = await replayRound({
        request: first,
        recording: join(output, item.round.first),
        label: `replay-${item.round.first}`,
        vault,
      })
      request = continuedRequest({
        first,
        replayed,
        ...(item.next !== undefined && { next: item.next }),
      })
    }
    const outcome = await recordRound({
      name,
      request,
      requiresReasoningState: item.requiresReasoningState,
      requiresToolCall: item.requiresToolCall === true,
      gateway,
      output,
      vault,
      now: () => new Date(),
    })
    console.info(`recorder ${name}: ${JSON.stringify(outcome)}`)
    expect(outcome.kind).toBe('written')
  } finally {
    rmSync(vault, { recursive: true, force: true })
  }
})
