import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { certificate, finish, fixture, sse } from './support.ts'
import { buildFormal, invokeFormal } from './fixtures/qwen/probe-six/formal-invoke.mjs'

test('formal Qwen planner and invoke cross a real local TLS boundary once', async () => {
  const cert = certificate()
  const host = await fixture(cert.tls, response => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(
      sse({
        id: 'gen-qwen-formal-local',
        model: 'qwen/qwen3.8-max-0902',
        provider: 'Alibaba',
        choices: [{ delta: { content: 'OK qwen-local-only-credential' } }],
      }) +
        sse('{"choices":[],"usage":{"prompt_tokens":68,"completion_tokens":2,"cost":0.000005}}') +
        finish(),
    )
  })
  const output = await mkdtemp(join(tmpdir(), 'qwen-formal-invoke-'))
  const settled = []
  const ledger = {
    reserve: async value => {
      assert.equal(value.model, 'qwen/qwen3.8-max-0902')
      assert.equal(value.provider, 'alibaba')
      return 'local-reservation'
    },
    settle: async (...value) => settled.push(value),
  }
  try {
    const prepared = { ...(await buildFormal()), estimateUsd: '2.500096000000000000' }
    const result = await invokeFormal({
      prepared,
      output,
      ledger,
      credential: 'qwen-local-only-credential',
      transportOptions: host.options,
    })
    assert.equal(result.outcome, 'complete')
    assert.equal(result.servingProvider, 'Alibaba')
    assert.equal(host.requests.length, 1)
    assert.equal(host.requests[0].body, prepared.planned.serialized)
    assert.deepEqual(settled, [['local-reservation', '0.000005']])
    const observedSource = await readFile(join(output, 'observed.json'), 'utf8')
    assert.equal(observedSource.includes('qwen-local-only-credential'), false)
    const observed = JSON.parse(observedSource)
    assert.deepEqual(observed.capture, { domainOutcome: true, rawSseBody: false })
    assert.equal(observed.attempts, 1)
    assert.equal(
      observed.sentSha256,
      '05980a21733b774d261ec231e71a94671d9372f07051ce2ee473cf5120f56c26',
    )
  } finally {
    await host.close()
    cert.dispose()
    await rm(output, { recursive: true, force: true })
  }
})
