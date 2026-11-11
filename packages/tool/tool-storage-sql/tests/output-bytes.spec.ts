// TS-13：受信读取一次保管的全部字节。经公开入口保管，再经公开入口读回；块数据在库里被改动时
// 按清单摘要拒绝；从未保管、只保管了投影或租户不在目录里时，各自得到规定的答复。
import { randomBytes } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type DurableEvidence,
} from '@omne-harness/tool-contract'
import { createSqlToolOutputCustody, readSqlToolOutputBytes } from '../src/index.ts'
import {
  domainNameOf,
  openApp,
  TENANT_A,
  TENANT_B,
  UNREGISTERED,
  type App,
} from './fixtures/app.ts'

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}
const call = ok(decodeToolCallId('call-1'))
const operation = ok(decodeToolOperationId('call-1/start/wait-request'))
const codec = { owner: 'test', name: 'json', revision: '1', digest: 'sha256:json' }
const source: DurableEvidence = { owner: 'test', record: 's', revision: '1', digest: 'sha256:s' }

async function kept(bytes: Uint8Array) {
  const app = await openApp()
  opened.push(app)
  const custody = createSqlToolOutputCustody<string>(app.custodyOptions({ maxChunkBytes: 100 }))
  const raw = ok(
    await custody.preserve({
      principal: 'p',
      tenant: TENANT_A,
      call,
      operation,
      codec,
      bytes,
      source,
    }),
  )
  return { app, custody, raw, read: readSqlToolOutputBytes(app.options) }
}

it('reads back the bytes of a kept original over several chunks, with its codec and custody', async () => {
  const bytes = new Uint8Array(randomBytes(350))
  const { raw, read } = await kept(bytes)
  expect(ok(await read({ tenant: TENANT_A, call, operation }))).toEqual({
    codec,
    bytes,
    custody: raw.custody,
  })
})

it('answers unavailable when a chunk no longer matches the manifest', async () => {
  const { app, read } = await kept(new Uint8Array(randomBytes(250)))
  app.sqlite.inspect(
    domainNameOf(TENANT_A),
    `UPDATE tl_chunk SET data = ? WHERE operation = ? AND idx = 1`,
    [new Uint8Array(100), operation],
  )
  expect(await read({ tenant: TENANT_A, call, operation })).toMatchObject({
    failure: { kind: 'unavailable' },
  })
})

it('answers unavailable when a chunk is missing', async () => {
  const { app, read } = await kept(new Uint8Array(randomBytes(250)))
  app.sqlite.inspect(domainNameOf(TENANT_A), `DELETE FROM tl_chunk WHERE idx = 2`)
  expect(await read({ tenant: TENANT_A, call, operation })).toMatchObject({
    failure: { kind: 'unavailable' },
  })
})

it('answers null for an operation that kept nothing, for a projection, and in another tenant', async () => {
  const { custody, raw, read } = await kept(new Uint8Array([1, 2, 3]))
  const other = ok(decodeToolOperationId('call-1/start/other'))
  expect(ok(await read({ tenant: TENANT_A, call, operation: other }))).toBeNull()
  expect(ok(await read({ tenant: TENANT_B, call, operation }))).toBeNull()
  const projection = ok(decodeToolOperationId('call-1/start/projection'))
  ok(
    await custody.retainResult({
      principal: 'p',
      tenant: TENANT_A,
      call,
      operation: projection,
      raw,
      value: { content: [], data: { kind: 'none' }, original: { kind: 'none' }, attachments: [] },
    }),
  )
  expect(ok(await read({ tenant: TENANT_A, call, operation: projection }))).toBeNull()
})

it('answers unavailable for a tenant that the directory does not hold', async () => {
  const { read } = await kept(new Uint8Array([1]))
  expect(await read({ tenant: UNREGISTERED, call, operation })).toMatchObject({
    failure: { kind: 'unavailable' },
  })
})
