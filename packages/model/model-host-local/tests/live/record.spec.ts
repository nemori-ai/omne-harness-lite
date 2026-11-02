// @module-tag slow — the recorder of real requests: one HTTPS request through the environment's
// proxy, which adds the real credential, and a recording written into the pi transport's fixtures.
// It runs only when OMNE_LIVE_TESTS=1 and OMNE_RECORD_CASE names a case, and skips at run time
// otherwise: a `skipIf` would make the slow tier's pre-parse drop the whole file. A run costs
// money, so no default case exists.
//
// Environment, read only at this test boundary:
// - OMNE_RECORD_CASE: one of ALL_RECORD_CASE_NAMES, which holds the four reasoning cases and the
//   two tool-call cases (`openai-tool-call`, then `openai-tool-call-continued`, model
//   `openai/gpt-5.6-sol`). A continued case replays its first round's recording from the same
//   output root, so the first round is recorded before it. The synthetic pieces of the tool-call
//   cases below this package's `tests/fixtures/recordings/` are not read from there: the recorder
//   writes `stream.sse` and `recording.json` into the output root.
// - OMNE_RECORD_OUT: the root of the recordings. Default: pi-ai-transport's
//   `tests/fixtures/recordings/`. An existing recording is never replaced.
// - OMNE_RECORD_TARGET: the gateway origin. Default: `https://openrouter.ai/`.
// - OMNE_RECORD_CA: a PEM file that the host trusts instead of Node's default authorities; only
//   for a local target.
// - HTTPS_PROXY and NO_PROXY: the proxy and its bypass list. The proxy is required.
// The credential variables are never read: the vault holds a placeholder.
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
/** A real gateway through a proxy may take longer to connect than a local server. */
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
      // The first round's request and its reply, replayed from its recording on this machine.
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
    // The outcome holds no header, no body and no matched secret; it is safe to print.
    console.info(`recorder ${name}: ${JSON.stringify(outcome)}`)
    expect(outcome.kind).toBe('written')
  } finally {
    rmSync(vault, { recursive: true, force: true })
  }
})
