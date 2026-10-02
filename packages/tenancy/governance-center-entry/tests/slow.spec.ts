// @module-tag slow
// 归慢层：真实等待＋网络：在完整中心的本地 TLS 与 Unix 套接字入口上按真实时长慢发请求、等满接收时限。
// 接收时限（https-json/1 S-10 的下限表、S-20；绑定 V-11 与规范场景 S-28 的「接近 30 秒才发完」一例、V-6 的「到了接收时限还没收齐」）。
// 这两支按真实时长跑（约 30 秒），用 describe.concurrent 并行，放在单独的文件里，不拖慢其余测试文件。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RECEIVE_LIMITS } from '../src/index.ts'
import { type Center, HEALTH, OPS_HEALTH, bodyOf, bootCenter } from './support/composition.ts'
import { httpRequest, tlsExchange, unixExchange } from './support/wire.ts'

let center: Center
beforeAll(async () => {
  center = await bootCenter({ label: 'slow' })
  await center.open()
})
afterAll(async () => {
  await center.dispose()
})

/** 恰切成 `count` 段（每段至少一个字节）。 */
function slices(request: Buffer, count: number): Buffer[] {
  if (request.length < count) throw new Error('request shorter than the number of slices')
  const bounds = Array.from({ length: count + 1 }, (_, i) =>
    Math.floor((i * request.length) / count),
  )
  return Array.from({ length: count }, (_, i) => request.subarray(bounds[i], bounds[i + 1]))
}

describe.concurrent('接收时限：下限 30 秒之内不被切，到了时限还没收齐就关闭不写', () => {
  it('客户端一面：连接就绪之后慢慢发，约 28 秒才发完最后一个字节的公开体检请求 ⇒ 照常得到答复', async () => {
    const request = httpRequest(JSON.stringify({ operation: HEALTH }))
    const started = performance.now()
    const reply = await tlsExchange(center.port, Buffer.alloc(0), {
      chunks: slices(request, 29),
      chunkDelayMs: 1_000,
      timeoutMs: 40_000,
    })
    expect(performance.now() - started).toBeGreaterThan(27_000)
    expect(bodyOf(reply.bytes)).toMatchObject({ reachable: true })
  })

  it('客户端一面：到了接收时限仍没收齐 ⇒ 关闭，一个字节都不写；关闭不早于 30 秒', async () => {
    const started = performance.now()
    const reply = await tlsExchange(
      center.port,
      Buffer.from('POST / HTTP/1.1\r\nContent-Length: 10\r\n\r\n{'),
      {
        endAfterWrite: false,
        timeoutMs: 40_000,
      },
    )
    const elapsed = performance.now() - started
    expect(reply.bytes.length).toBe(0)
    expect(elapsed).toBeGreaterThanOrEqual(RECEIVE_LIMITS.receiveTimeoutMs)
    expect(elapsed).toBeLessThan(RECEIVE_LIMITS.receiveTimeoutMs + 3_000)
  })

  it('运维面同一时限：约 28 秒才发完的请求照答；没收齐的在 30 秒后关闭不写', async () => {
    const slow = unixExchange(center.socketPath, Buffer.alloc(0), {
      chunks: slices(httpRequest(OPS_HEALTH), 29),
      chunkDelayMs: 1_000,
      timeoutMs: 40_000,
    })
    const started = performance.now()
    const stalled = unixExchange(center.socketPath, Buffer.from('POST / HTTP/1.1\r\n'), {
      endAfterWrite: false,
      timeoutMs: 40_000,
    })
    expect(bodyOf((await slow).bytes)).toMatchObject({ reachable: true })
    expect((await stalled).bytes.length).toBe(0)
    expect(performance.now() - started).toBeGreaterThanOrEqual(RECEIVE_LIMITS.receiveTimeoutMs)
  })
})
