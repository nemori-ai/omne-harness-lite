// 本包依赖的上游机制取证（任务要求报给主线登 basis 的两条，另加实现里依赖的两条）：
// 1. Cordis 4.0.4 的 `ctx.on` 经 effect 纳管：fiber 撤除时监听自动解除（源码：src/events.ts `on` → `register` → `this.ctx.fiber.effect`）。
// 2. ajv 8 的 `unicodeRegExp` 缺省开启：`pattern` 以 `u` 标志编译、按码点求值；`maxLength` 按码点计（源码：lib/core.ts 的选项缺省、
//    lib/vocabularies/code.ts 的 usePattern、lib/runtime/ucs2length.ts）。
// 3. Node 24.18：把预先建好的 `secureContext` 交给 `tls.createServer`，ECDSA 证书握不了手（client-face.ts 因此直接传材料）。
// 4. 规范 Schema 的包内副本与 spec 目录那一份逐字节相同（漂移即红）；副本连同所引的两份 Schema 在 ajv 里编得出每条路由的定义。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { connect, createSecureContext, createServer } from 'node:tls'
import { Context } from '@deepseek-ai/cordis'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { z } from 'zod'
import { ROUTE_IDS } from '@omne-harness-lite/governance-center-entry'
import { ROUTES } from '../src/routing/routes.ts'
import { entryValidator } from '../src/routing/schema.ts'
import { TLS_FIXTURES } from './support/wire.ts'

const PACKAGE = join(import.meta.dirname, '..')
const SPEC_SCHEMA = join(
  PACKAGE,
  '../../../.meta_harness/design/spec/compositions/governance-center-entry/v3/governance-center-entry.schema.json',
)

describe('basis：ctx.on 经 effect 纳管', () => {
  it('插件里 ctx.on 挂的监听，在该 fiber 撤除后不再被调用；未撤除时照常被调用', async () => {
    const root = new Context()
    let calls = 0
    const listener = definePlugin<Record<string, never>>({
      name: 'on-probe',
      Config: z.object({}).strict(),
      apply(ctx) {
        ctx.on('governance-center-entry/defect', () => {
          calls += 1
        })
      },
    })
    const fiber = root.plugin(listener, {})
    await fiber
    root.emit('governance-center-entry/defect')
    expect(calls).toBe(1)
    await fiber.dispose()
    root.emit('governance-center-entry/defect')
    expect(calls).toBe(1)
  })
})

describe('basis：ajv 的 unicodeRegExp 缺省开启', () => {
  it('缺省选项下 opts.unicodeRegExp 为 true；pattern 按码点求值、maxLength 按码点计', () => {
    const ajv = new Ajv2020()
    expect(ajv.opts.unicodeRegExp).toBe(true)
    const onePoint = ajv.compile({ type: 'string', pattern: '^.$' })
    expect(onePoint('\u{1F600}')).toBe(true)
    const shortString = ajv.compile({ type: 'string', maxLength: 1 })
    expect(shortString('\u{1F600}')).toBe(true)
    const nonUnicode = new Ajv2020({ unicodeRegExp: false }).compile({
      type: 'string',
      pattern: '^.$',
    })
    expect(nonUnicode('\u{1F600}')).toBe(false)
  })

  it('本包的校验器沿用缺省：出示物的 pattern 把一个星形码点当一个字符', () => {
    expect(entryValidator('LoginStatePresentation')('\u{1F600}')).toBe(true)
    expect(entryValidator('LoginStatePresentation')('\uD800')).toBe(false)
  })
})

describe('basis：Node 24 的 TLS 服务器与预建的 secureContext', () => {
  async function handshake(serverOptions: Parameters<typeof createServer>[0]): Promise<boolean> {
    const server = createServer({ ...serverOptions })
    server.on('secureConnection', socket => socket.end())
    server.on('tlsClientError', () => undefined)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    const ok = await new Promise<boolean>(resolve => {
      const client = connect({
        host: '127.0.0.1',
        port: address.port,
        servername: 'localhost',
        ca: TLS_FIXTURES.caPem,
      })
      client.once('secureConnect', () => {
        client.destroy()
        resolve(true)
      })
      client.once('error', () => resolve(false))
    })
    await new Promise<void>(resolve => server.close(() => resolve()))
    return ok
  }

  it('材料直接交给 createServer ⇒ 握手成功；预建的 secureContext ⇒ 握手失败（ERR_SSL_NO_SUITABLE_SIGNATURE_ALGORITHM）', async () => {
    const material = { cert: TLS_FIXTURES.chainPem, key: TLS_FIXTURES.leafKeyPem }
    expect(await handshake(material)).toBe(true)
    expect(await handshake({ secureContext: createSecureContext(material) })).toBe(false)
  })
})

describe('规范 Schema 的包内副本', () => {
  it('与 spec 目录的那一份逐字节相同', () => {
    expect(readFileSync(join(PACKAGE, 'schema/governance-center-entry.schema.json'))).toEqual(
      readFileSync(SPEC_SCHEMA),
    )
  })

  it('每条路由的 Payload_<路由> 与 Result_<路由> 都编得出；另有 Exchange、Envelope、FullHealthReply', () => {
    for (const route of ROUTES) {
      expect(() => entryValidator(`Payload_${route.schema}`)).not.toThrow()
      expect(() => entryValidator(`Result_${route.schema}`)).not.toThrow()
    }
    for (const name of [
      'Exchange',
      'Envelope',
      'FullHealthReply',
      'PublicHealthReply',
      'ClientFaceReply',
    ]) {
      expect(() => entryValidator(name)).not.toThrow()
    }
    expect(ROUTES).toHaveLength(ROUTE_IDS.length)
  })
})
