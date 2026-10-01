import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:https'
import { execFileSync } from 'node:child_process'
import {
  LosslessNumber,
  writeJsonLossless,
  readJsonStrict,
} from '@omne-harness-lite/content-blocks'
import { openLedger } from '../../../../../../tools/model-probe/src/budget.mjs'
import { dryPlan, invokePhase, validatePrevious, sourceFingerprint } from './cache-public.mjs'
import { makeManifest } from './cache-manifest.mjs'
import { decimalUsd, wholeContextReservation } from './cache-budget.mjs'

const endpoint = {
  provider_name: 'Anthropic',
  context_length: 100000,
  max_completion_tokens: 4096,
  pricing: { prompt: '0.000001', completion: '0.000002', input_cache_write_1h: '0.000004' },
}
const load = async path => {
  const value = readJsonStrict(await readFile(path, 'utf8'))
  assert('ok' in value)
  return value.ok
}
const frame = data => `data: ${writeJsonLossless(data)}\n\n`
const credential = 'synthetic-cache-secret-ABC123456789'

test('four current mp4-18 dry plans reject stale binding and preserve exact costs', async () => {
  assert.match(await sourceFingerprint(), /^[a-f0-9]{64}$/)
  for (const model of [
    'anthropic/claude-opus-5.5',
    'anthropic/claude-opus-5',
    'anthropic/claude-sonnet-5',
    'anthropic/claude-fable-5.1',
  ]) {
    const manifest = makeManifest(model)
    assert.equal(manifest.implementationRevision, 'mp4-18')
    const { planned } = await dryPlan(manifest)
    assert(planned.serialized.includes('"ttl":"1h"'))
    assert.equal(planned.inputLimitEvidence.inputTokens.kind, 'estimated')
    await assert.rejects(() => dryPlan({ ...manifest, implementationRevision: 'mp4-4' }), {
      name: 'AssertionError',
      actual: 'mp4-4',
      expected: 'mp4-18',
    })
  }
  assert.throws(
    () => makeManifest('anthropic/claude-sonnet-5', '5m'),
    /unsupported Anthropic cache TTL/,
  )
  assert.equal(
    decimalUsd(new LosslessNumber('1.234567890123456789e-7')),
    '0.0000001234567890123456789',
  )
  assert.equal(wholeContextReservation(endpoint, 512), '0.401024000000000000')
})

for (const mode of ['complete', 'failed-known', 'unknown', 'protocol'])
  test(`real public HTTPS ${mode}: preserve before settlement, no phase replay`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'anthropic-cache-test-'))
    const output = join(directory, 'evidence')
    await (await import('node:fs/promises')).mkdir(output, { mode: 0o700 })
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        join(directory, 'key.pem'),
        '-out',
        join(directory, 'cert.pem'),
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
      ],
      { stdio: 'ignore' },
    )
    let sends = 0,
      captured
    const server = createServer(
      {
        key: await readFile(join(directory, 'key.pem')),
        cert: await readFile(join(directory, 'cert.pem')),
      },
      async (req, res) => {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        sends++
        captured = Buffer.concat(chunks).toString('utf8')
        res.setHeader('Content-Type', 'text/event-stream')
        if (mode === 'protocol') {
          // Controlled invalid refusal value under D108, not a reconstruction
          // of the original live Opus 5 response.
          res.end(
            frame({
              provider: 'Anthropic',
              choices: [{ delta: { refusal: ['Synthetic refused content'] } }],
            }),
          )
          return
        }
        res.write(
          frame({
            id: 'synthetic-generation',
            provider: 'Anthropic',
            choices: [{ delta: { content: 'OK' } }],
          }),
        )
        const usage = {
          prompt_tokens: 5000,
          completion_tokens: 2,
          prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 4990 },
        }
        if (mode !== 'unknown') usage.cost = new LosslessNumber('1.234567890123456789e-7')
        res.write(frame({ choices: [], usage }))
        if (mode === 'failed-known')
          res.end(
            frame({ error: { code: 503, message: `Rejected echo ${credential}` } }) +
              'data: [DONE]\n\n',
          )
        else
          res.end(frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n')
      },
    )
    let ledger
    try {
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
      ledger = await openLedger(join(directory, 'ledger.json'), {
        limitUsd: '100',
        researchLimitUsd: '50',
      })
      const manifest = makeManifest('anthropic/claude-sonnet-5')
      const identity = {
        manifestSha256: 'test',
        snapshotSha256: 'snapshot',
        plannedSerialized: (await dryPlan(manifest)).planned.serialized,
      }
      const options = {
        manifest,
        phase: 'write',
        output,
        endpoint,
        identity,
        credential,
        transportOptions: {
          baseUrl: `https://127.0.0.1:${server.address().port}/api/v1/`,
          tls: { ca: await readFile(join(directory, 'cert.pem')) },
        },
        ledger: {
          reserve: value => ledger.reserve(value),
          settle: async (id, usd) => {
            const observed = await load(join(output, 'write-observed.json'))
            assert.equal(observed.reservation, id)
            assert.equal((await stat(join(output, 'write-observed.json'))).mode & 0o777, 0o600)
            assert(observed.result)
            assert.equal(observed.attempts, 1, writeJsonLossless(observed.result))
            await ledger.settle(id, usd)
          },
        },
      }
      if (mode === 'complete') assert.equal((await invokePhase(options)).result, 'pass')
      else
        await assert.rejects(
          invokePhase(options),
          ['unknown', 'protocol'].includes(mode) ? /Actual cost unknown/ : /complete/,
        )
      assert.equal(sends, 1)
      assert.equal(captured, identity.plannedSerialized)
      const observedSource = await readFile(join(output, 'write-observed.json'), 'utf8')
      assert(!observedSource.includes(credential))
      const observed = await load(join(output, 'write-observed.json'))
      assert.equal(
        observed.result.outcome,
        ['failed-known', 'protocol'].includes(mode) ? 'failed' : 'complete',
      )
      assert.deepEqual(observed.capture, {
        domainOutcome: true,
        rawSseBody: false,
        protocolFailureFrame: false,
      })
      if (mode === 'protocol') {
        assert.equal(observed.result.failure.localError, 'invalid refusal')
        assert.equal(observed.result.failure.upstreamError, undefined)
        assert(!observedSource.includes('Synthetic refused content'))
      }
      const entry = ledger.snapshot().entries[0]
      if (['unknown', 'protocol'].includes(mode)) assert.equal(entry.state, 'unknown')
      else {
        assert.equal(entry.state, 'settled')
        assert.equal(entry.actualUsd, '0.0000001234567890123456789')
      }
      await assert.rejects(invokePhase(options), /EEXIST/)
      assert.equal(sends, 1)
      if (mode === 'complete') {
        const before = await load(join(output, 'write-before.json')),
          settled = await load(join(output, 'write-settled.json'))
        const check = {
          phase: 'read',
          manifest,
          before,
          observed,
          settled,
          ledger: ledger.snapshot(),
          identity,
          now: Date.parse(observed.endedAt) + 1000,
          provider: 'Anthropic',
        }
        validatePrevious(check)
        assert.throws(
          () =>
            validatePrevious({ ...check, identity: { ...identity, snapshotSha256: 'different' } }),
          /snapshotSha256/,
        )
        assert.throws(() => validatePrevious({ ...check, now: check.now + 300000 }), /Read window/)
        const read = {
          ...observed,
          result: {
            ...observed.result,
            usage: { ...observed.result.usage, cache_read_tokens: 4900 },
          },
        }
        const expiry = {
          ...check,
          phase: 'expiry',
          before: { ...before, phase: 'read' },
          observed: read,
        }
        assert.throws(() => validatePrevious(expiry), /Expiry not due/)
        validatePrevious({ ...expiry, now: Date.parse(observed.endedAt) + 3900000 })
      }
    } finally {
      try {
        await ledger?.close()
      } finally {
        if (server.listening) {
          server.closeAllConnections()
          await new Promise(resolve => server.close(resolve))
        }
        await rm(directory, { recursive: true, force: true })
      }
    }
  })
