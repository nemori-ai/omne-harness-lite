import { mkdir, mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { openDemo } from '../src/demo.ts'
import { createLocalTls } from './local-tls.ts'
import { demoRetirement } from './model-request-support.ts'

it('records a real service call in its verified tenant journal and keeps reads after close', async () => {
  const parent = resolve('tmp/model-request-runtime/diagnostic-demo-tests')
  await mkdir(parent, { mode: 0o700, recursive: true })
  const root = await mkdtemp(join(parent, 'call-'))
  const tls = await createLocalTls(join(root, 'tls'))
  const credential = Buffer.from('diagnostic-local-private-key')
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
    const sent = await demo.send('diagnostic call', async () => undefined)
    expect(sent.kind).toBe('saved')
    expect(tls.requests).toHaveLength(1)
    const closed = await demo.close()
    expect(closed.complete).toBe(true)
    const scope = demo.diagnostics.tenant.scope
    const rows = await demo.diagnostics.tenant.query({
      scope,
      limit: 128,
      maxBytes: 1_048_576,
    })
    expect('page' in rows).toBe(true)
    if (!('page' in rows)) return
    expect(rows.page.records.some(record => record.source === 'runtime')).toBe(true)
    expect(rows.page.records.every(record => record.scope.kind === 'tenant')).toBe(true)
    expect(JSON.stringify(rows.page.records)).not.toContain(credential.toString())
    const localRows = await demo.diagnostics.local.query({
      scope: demo.diagnostics.local.scope,
      limit: 128,
      maxBytes: 1_048_576,
    })
    expect('page' in localRows).toBe(true)
    if ('page' in localRows)
      expect(localRows.page.records.some(record => record.source === 'runtime')).toBe(false)
  } finally {
    credential.fill(0)
    if (demo) await demo.close()
    await tls.close()
  }
})
