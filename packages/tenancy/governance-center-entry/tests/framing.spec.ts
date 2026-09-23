// 成帧器逐例（https-json/1 S-10；绑定 V-6 的成帧那一半、V-11 的「Content-Length 大于上界不读体」与「恰在下限上」）。
// 线上那一半（收不到任何字节、收不到 4xx）在 transport.spec.ts。`Content-Length` 按 ccd39d9 的读法：值是剥掉前后 OWS 之后的
// field-value，多处按剥后的值逐字节比较；`42, 42` 不是 1*DIGIT。
import { describe, expect, it } from 'vitest'
import { RECEIVE_LIMITS } from '../src/index.ts'
import { type FrameStep, RequestFramer } from '../src/ops/http1.ts'

const frame = (...chunks: (string | Buffer)[]): FrameStep => {
  const framer = new RequestFramer(RECEIVE_LIMITS)
  let step: FrameStep = { kind: 'need-more' }
  for (const chunk of chunks) {
    step = framer.push(typeof chunk === 'string' ? Buffer.from(chunk, 'latin1') : chunk)
    if (step.kind !== 'need-more') return step
  }
  return step
}
const kind = (...chunks: (string | Buffer)[]) => frame(...chunks).kind

describe('能成帧的报文', () => {
  it('最短的 POST：头部收齐、按 Content-Length 读满体', () => {
    const step = frame('POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 2\r\n\r\n{}')
    expect(step).toEqual({ kind: 'complete', body: Buffer.from('{}'), trailing: 0 })
  })

  it('没有 Content-Length ⇒ 体长 0（之后按 S-7 第 3 级答 version-mismatch）', () => {
    expect(frame('POST / HTTP/1.1\r\nHost: x\r\n\r\n')).toEqual({
      kind: 'complete',
      body: Buffer.alloc(0),
      trailing: 0,
    })
  })

  it('逐字节送也一样；报文之后同一批到达的字节计为 trailing（流水线里的下一个请求不当作请求）', () => {
    const text = 'POST / HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}'
    expect(frame(...[...text].map(c => c))).toMatchObject({ kind: 'complete', trailing: 0 })
    expect(frame(`${text}GET / HTTP/1.1\r\n\r\n`)).toMatchObject({ kind: 'complete', trailing: 18 })
  })

  it('方法、路径、其余头都不看：任意 token 方法、四种 request-target、缺 Host、重复 Host', () => {
    for (const line of [
      'GET /x?y=1 HTTP/1.1',
      'HEAD * HTTP/1.1',
      'PUT http://a.example/p HTTP/1.1',
      'CONNECT a.example:443 HTTP/1.1',
      'X-CUSTOM / HTTP/1.0',
    ]) {
      expect(kind(`${line}\r\n\r\n`)).toBe('complete')
    }
    expect(kind('POST / HTTP/1.1\r\nHost: a\r\nHost: b\r\nExpect: 100-continue\r\n\r\n')).toBe(
      'complete',
    )
  })

  it('Content-Length：剥前后 OWS；前导零按十进制；多处剥后逐字节相同即可', () => {
    expect(frame('POST / HTTP/1.1\r\nContent-Length: 2 \r\n\r\n{}')).toMatchObject({
      kind: 'complete',
    })
    expect(frame('POST / HTTP/1.1\r\nContent-Length:\t02\r\n\r\n{}')).toMatchObject({
      kind: 'complete',
      body: Buffer.from('{}'),
    })
    expect(
      frame('POST / HTTP/1.1\r\nContent-Length: 2\r\ncontent-length:2 \r\n\r\n{}'),
    ).toMatchObject({ kind: 'complete' })
  })
})

describe('成帧不了（S-10）', () => {
  it.each([
    ['Transfer-Encoding: chunked', 'POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n'],
    [
      'Transfer-Encoding 任何取值',
      'POST / HTTP/1.1\r\nTransfer-Encoding: identity\r\nContent-Length: 0\r\n\r\n',
    ],
    ['单独 LF 结尾的头部行', 'POST / HTTP/1.1\r\nHost: x\n\r\n'],
    ['单独 LF 结尾的请求行', 'POST / HTTP/1.1\nHost: x\r\n\r\n'],
    ['以单独 LF 结束头部', 'POST / HTTP/1.1\r\nHost: x\r\n\n'],
    ['裸 CR', 'POST / HTTP/1.1\r\nHost: a\rb\r\n\r\n'],
    ['obs-fold 续行', 'POST / HTTP/1.1\r\nX-A: a\r\n b\r\n\r\n'],
    ['字段名与冒号之间有空白', 'POST / HTTP/1.1\r\nHost : x\r\n\r\n'],
    ['起始行与第一个头之间的空白', 'POST / HTTP/1.1\r\n Host: x\r\n\r\n'],
    ['请求行之前的空行', '\r\nPOST / HTTP/1.1\r\n\r\n'],
    ['请求行多一个空格', 'POST  / HTTP/1.1\r\n\r\n'],
    ['请求行不是 HTTP/1.x', 'POST / HTTP/2.0\r\n\r\n'],
    ['不是 HTTP 请求', 'hello world\r\n\r\n'],
    ['字段值里有 NUL', 'POST / HTTP/1.1\r\nX-A: a\u0000b\r\n\r\n'],
    [
      '两个不同的 Content-Length',
      'POST / HTTP/1.1\r\nContent-Length: 2\r\nContent-Length: 3\r\n\r\n{}',
    ],
    ['05 与 5 不同', 'POST / HTTP/1.1\r\nContent-Length: 05\r\nContent-Length: 5\r\n\r\n'],
    ['逗号列表 42, 42', 'POST / HTTP/1.1\r\nContent-Length: 42, 42\r\n\r\n'],
    ['正号', 'POST / HTTP/1.1\r\nContent-Length: +2\r\n\r\n{}'],
    ['空值', 'POST / HTTP/1.1\r\nContent-Length: \r\n\r\n'],
  ])('%s', (_name, text) => {
    expect(kind(text)).toBe('unframeable')
  })

  it('单独 LF 即刻判，不等头部收齐', () => {
    const framer = new RequestFramer(RECEIVE_LIMITS)
    expect(framer.push(Buffer.from('POST / HTTP/1.1\n'))).toEqual({ kind: 'unframeable' })
  })
})

describe('接收上界：恰在下限上照收，上界 + 1 即判（V-11；S-10）', () => {
  const headWithBlock = (size: number) => {
    // 头部块 = 请求行 + 一个填充头 + 结束空行，总字节数恰为 size
    const line = 'POST / HTTP/1.1\r\n'
    const fixed = line.length + 'X-Pad: \r\n'.length + 2
    return `${line}X-Pad: ${'a'.repeat(size - fixed)}\r\n\r\n`
  }

  it('头部块恰 8192 字节 ⇒ 能成帧；8193 ⇒ 超界', () => {
    expect(Buffer.byteLength(headWithBlock(8192), 'latin1')).toBe(8192)
    expect(kind(headWithBlock(8192))).toBe('complete')
    expect(kind(headWithBlock(8193))).toBe('exceeds-limit')
  })

  it('头部块已够上界仍未结束 ⇒ 超界，不等那一行结束', () => {
    const framer = new RequestFramer(RECEIVE_LIMITS)
    expect(framer.push(Buffer.from(`POST / HTTP/1.1\r\nX-Pad: ${'a'.repeat(9000)}`))).toEqual({
      kind: 'exceeds-limit',
    })
  })

  it('请求体恰 65536 字节 ⇒ 能成帧；Content-Length 65537 ⇒ 头部收齐即判超界，不读体', () => {
    const body = Buffer.alloc(65536, 0x20)
    expect(frame(`POST / HTTP/1.1\r\nContent-Length: 65536\r\n\r\n`, body)).toMatchObject({
      kind: 'complete',
    })
    expect(frame('POST / HTTP/1.1\r\nContent-Length: 65537\r\n\r\n')).toEqual({
      kind: 'exceeds-limit',
    })
    expect(frame('POST / HTTP/1.1\r\nContent-Length: 99999999999999999999\r\n\r\n')).toEqual({
      kind: 'exceeds-limit',
    })
  })
})

describe('接收上界与时限的取值不低于契约下限（S-10 下限表；V-2 钉住的那几项）', () => {
  it('头部块 ≥ 8192、请求体 ≥ 65536、嵌套 ≥ 64、成员数 ≥ 1024、接收时限 ≥ 30 s；读尽上界与请求体上界同值', () => {
    expect(RECEIVE_LIMITS.headerBlockBytes).toBeGreaterThanOrEqual(8192)
    expect(RECEIVE_LIMITS.bodyBytes).toBeGreaterThanOrEqual(65536)
    expect(RECEIVE_LIMITS.jsonDepth).toBeGreaterThanOrEqual(64)
    expect(RECEIVE_LIMITS.objectMembers).toBeGreaterThanOrEqual(1024)
    expect(RECEIVE_LIMITS.receiveTimeoutMs).toBeGreaterThanOrEqual(30_000)
    expect(RECEIVE_LIMITS.drainBytes).toBe(RECEIVE_LIMITS.bodyBytes)
    expect(Object.isFrozen(RECEIVE_LIMITS)).toBe(true)
  })
})
