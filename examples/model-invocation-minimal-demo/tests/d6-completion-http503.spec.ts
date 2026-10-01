import { mkdir, mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDemo } from '../src/demo.ts'
import { createLocalTls } from './local-tls.ts'
import { demoRetirement } from './model-request-support.ts'

describe('D6 source-bounded 503 in the real demo', () => {
  it('retains the HTTP status but excludes a same-valued credential and upstream error from query and export', async () => {
    const parent = resolve('tmp/d6-completion')
    await mkdir(parent, { mode: 0o700, recursive: true })
    const root = await mkdtemp(join(parent, 'http503-'))
    const tls = await createLocalTls(join(root, 'tls'))
    tls.setMode('http503')
    const credential = Buffer.from('503')
    let demo: Awaited<ReturnType<typeof openDemo>> | undefined
    try {
      demo = await openDemo(
        join(root, 'data'),
        { multiplier: 1.1, reserveTokens: 256 },
        demoRetirement(),
        16_384,
        credential,
        { developmentTransport: tls.developmentTransport },
      )
      const sent = await demo.send('private 503 prompt', async () => undefined)
      expect(sent.kind).toBe('failed')
      expect(tls.requests).toHaveLength(1)
      expect(tls.requests[0]?.authorization).toBe('Bearer 503')
      const closed = await demo.close()
      expect(closed.businessComplete).toBe(true)
      expect(closed.complete).toBe(true)
      const tenant = demo.diagnostics.tenant
      const query = { scope: tenant.scope, limit: 128, maxBytes: 1_048_576 }
      const rows = await tenant.query(query)
      if (!('page' in rows)) throw new Error('tenant engineering query unavailable')
      expect(
        rows.page.records.some(
          row =>
            row.stage === 'send' && row.facts.kind === 'transport' && row.facts.httpStatus === 503,
        ),
      ).toBe(true)
      const exported = await tenant.exportPage(query, { maxRecords: 128, maxBytes: 1_048_576 })
      if (!('page' in exported)) throw new Error('tenant engineering export unavailable')
      for (const value of [JSON.stringify(rows.page.records), exported.page.jsonl]) {
        expect(value).toContain('"httpStatus":503')
        expect(value).not.toContain('Bearer 503')
        expect(value).not.toContain('controlled failure')
        expect(value).not.toContain('private 503 prompt')
        expect(value).not.toContain('"raw"')
        expect(value).not.toContain('"error"')
      }
    } finally {
      credential.fill(0)
      if (demo) await demo.close()
      await tls.close()
    }
  })
})
