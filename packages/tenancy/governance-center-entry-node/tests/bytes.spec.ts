import { project } from '../src/routing/route-wire.ts'
import { decisionStorage } from './support/decision-storage.ts'
const storage = decisionStorage()
// T-2 的固定字节快照（入口节点 T-2「version-mismatch 与公开体检的字节有快照，改动即红」；绑定 V-1、S-13、S-15）
// 与体的写出规则逐例（绑定 V-9、examples §7）。
// **快照不另抄一份**：直接读传输绑定的 examples.md（消费提交 c8baf30 的候选；ccd39d9 字节未变），把每一份的转义文本与
// 十六进制各还原成字节，先核两种写法、总字节数与 SHA-256 自洽，再与本包产出的字节逐字节比较。
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isOk } from '@omne-harness-lite/identity-values'
import { type Instant, instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import { fullHealthBody } from '../src/ops/health.ts'
import { formatInstant, responseBytes } from '../src/ops/wire.ts'
import {
  entryAnswerBytes,
  publicHealthBytes,
  routeFailureBytes,
  routeSuccessBytes,
} from '../src/routing/answers.ts'
import { decide } from '../src/routing/decide.ts'
import { ROUTE_IDS } from '@omne-harness-lite/governance-center-entry'
import { routeFor } from '../src/routing/routes.ts'
import { RequestFramer } from '../src/ops/http1.ts'
import { RECEIVE_LIMITS } from '../src/index.ts'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import { StubParticipants } from './support/stubs.ts'

const EXAMPLES = join(
  import.meta.dirname,
  '../../../../.meta_harness/design/spec/compositions/governance-center-entry-https-json/v2/examples.md',
)

interface Example {
  readonly heading: string
  readonly total: number
  readonly sha256: string
  readonly escaped: Buffer
  readonly hex: Buffer
}

/** 按页面约定还原：转义文本去掉排版换行、`\r\n` 还原为 CR LF；十六进制去掉空白。 */
function parseExamples(markdown: string): Example[] {
  const examples: Example[] = []
  const lines = markdown.split('\n')
  let heading = ''
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (
      line.startsWith('## ') ||
      line.startsWith('### ') ||
      line.startsWith('**请求**') ||
      line.startsWith('**答复**')
    ) {
      heading = line
    }
    const summary = /^总\s*(\d+)\s*字节.*SHA-256 `([0-9a-f]{64})`/.exec(line)
    if (summary === null) continue
    const blocks: string[] = []
    let j = i + 1
    while (blocks.length < 2 && j < lines.length) {
      if (lines[j] === '```text') {
        const content: string[] = []
        j += 1
        while (lines[j] !== '```') {
          content.push(lines[j] ?? '')
          j += 1
        }
        blocks.push(content.join('\n'))
      }
      j += 1
    }
    const [escaped, hex] = blocks
    if (escaped === undefined || hex === undefined)
      throw new Error(`examples: incomplete block after ${line}`)
    examples.push({
      heading,
      total: Number(summary[1]),
      sha256: summary[2] ?? '',
      escaped: Buffer.from(escaped.split('\n').join('').replaceAll('\\r\\n', '\r\n'), 'utf8'),
      hex: Buffer.from(hex.replace(/\s+/g, ''), 'hex'),
    })
    i = j - 1
  }
  return examples
}

const examples = parseExamples(readFileSync(EXAMPLES, 'utf8'))
function example(index: number): Buffer {
  const found = examples[index]
  if (found === undefined) throw new Error(`examples: no item ${index}`)
  return found.hex
}
// 页面上的次序：§1、§2 请求、§2 答复、§3.1、§3.2、§3.3、§4、§5
const VERSION_MISMATCH = 0
const HEALTH_REQUEST = 1
const HEALTH_REPLY = 2
const LOGIN_STATE_REJECTED = 3
const UNAVAILABLE = 4
const INVALID_INPUT = 5
const ROUTE_RESULT = 6
const FULL_HEALTH = 7

const CENTER_ID = '3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60'

function instant(ms: number): Instant {
  const parsed = instantFromEpochMs(ms)
  if (!isOk(parsed)) throw new Error('not an instant')
  return parsed.ok
}

describe('examples.md 自洽（前提：页面上的两种写法是同一串字节）', () => {
  it('恰 8 份；每份转义文本与十六进制逐字节相同，总字节数与 SHA-256 与页面所写一致', () => {
    expect(examples).toHaveLength(8)
    for (const item of examples) {
      expect(item.escaped, item.heading).toEqual(item.hex)
      expect(item.hex.length, item.heading).toBe(item.total)
      expect(createHash('sha256').update(item.hex).digest('hex'), item.heading).toBe(item.sha256)
    }
  })
})

describe('T-2：四种入口答复与 examples §1、§3 逐字节相同', () => {
  it.each([
    ['version-mismatch', VERSION_MISMATCH, 133],
    ['login-state-rejected', LOGIN_STATE_REJECTED, 137],
    ['unavailable', UNAVAILABLE, 128],
    ['invalid-input', INVALID_INPUT, 130],
  ] as const)('%s', (answer, index, total) => {
    const bytes = entryAnswerBytes(answer)
    expect(bytes).toEqual(example(index))
    expect(bytes.length).toBe(total)
    // 同一个值每一次都是同一份字节
    expect(entryAnswerBytes(answer)).toBe(bytes)
  })

  it('没有 Date 头，也没有四个头之外的任何头', () => {
    for (const answer of [
      'version-mismatch',
      'login-state-rejected',
      'unavailable',
      'invalid-input',
    ] as const) {
      const head = entryAnswerBytes(answer).toString('latin1').split('\r\n\r\n')[0] ?? ''
      expect(
        head
          .split('\r\n')
          .slice(1)
          .map(line => line.split(':')[0]),
      ).toEqual(['Content-Type', 'Cache-Control', 'Content-Length', 'Connection'])
    }
  })
})

describe('T-2：公开体检（examples §2）', () => {
  it('答复：标识与版本代成 examples 的值后逐字节相同', () => {
    expect(isGovernanceCenterId(CENTER_ID)).toBe(true)
    if (!isGovernanceCenterId(CENTER_ID)) return
    expect(publicHealthBytes(CENTER_ID, '0.1.0')).toEqual(example(HEALTH_REPLY))
  })

  it('请求：examples §2 的请求字节经成帧器与判定次序，得到的就是公开体检答复', async () => {
    const framer = new RequestFramer(RECEIVE_LIMITS)
    const step = framer.push(example(HEALTH_REQUEST))
    expect(step.kind).toBe('complete')
    if (step.kind !== 'complete' || !isGovernanceCenterId(CENTER_ID)) return
    const publicHealth = publicHealthBytes(CENTER_ID, '0.1.0')
    const decision = await decide(step.body, {
      services: new StubParticipants().entryServices(),
      publicHealth,
      storage: storage(),
    })
    expect(decision.bytes).toEqual(example(HEALTH_REPLY))
  })
})

describe('T-2：路由结果与完整体检的形状（examples §4、§5）', () => {
  it('§4：列出登录状态的两项，经路由表的投影与写出后逐字节相同（含 .25Z）', () => {
    const route = routeFor('capability.account-identity/v3#S-37')
    expect(route).toBeDefined()
    if (route === undefined) return
    const at = Date.UTC(2026, 8, 23, 8, 0, 0)
    const wire = project(
      route.schema,
      [
        {
          loginStateId: 'b8f7117646179c7f8f923b56e9735b1a337d0cf67c7a5d63d3d2f4896ec0dd8e',
          issuedAt: at,
          lastActivityAt: at,
          absoluteExpiresAt: at + 28800000,
          idleExpiresAt: at + 3600000,
        },
        {
          loginStateId: 'c3ff21f9237e63ee18a0748b3d2b963355c7a77e9269c186325ad75abccf87aa',
          issuedAt: at + 250,
          lastActivityAt: at + 250,
          absoluteExpiresAt: at + 28800250,
          idleExpiresAt: at + 3600250,
        },
      ],
      {},
    )
    expect(routeSuccessBytes(wire)).toEqual(example(ROUTE_RESULT))
  })

  it('§5：完整体检按 FullHealthReply 的书写次序写出，代入 examples 的值后逐字节相同', async () => {
    const body = await fullHealthBody(
      {
        // 这个桩不跑查询，直接给出探针那次读的返回值 true（真实存储上的现探见 ops.spec.ts）
        storage: {
          read: async <T>() => true as T,
          write: async () => {
            throw new Error('not used')
          },
        },
        clock: { now: () => instant(Date.UTC(2026, 8, 23, 9, 0, 0)) },
        deploymentKey: { present: true, complete: true },
        deploymentParameters: {
          unactivatedRetention: 604800000,
          invitationTtlDefault: 1209600000,
          affiliationRequestTtlDefault: 1209600000,
          copyNoticeTtlDefault: 604800000,
          sharingInvitationTtlDefault: 604800000,
        },
        reportProbeDefect: () => undefined,
      },
      { centerId: CENTER_ID, version: '0.1.0', startedAt: instant(Date.UTC(2026, 8, 23, 8, 0, 0)) },
      0,
    )
    expect(responseBytes(body)).toEqual(example(FULL_HEALTH))
  })
})

describe('V-2：任何别的答复的体都不等于 "version-mismatch" 那 18 个字节', () => {
  it('四种入口答复里只有它一份；每个可透传的具名失败与各路由成功值都不是它', () => {
    const versionBody = Buffer.from('"version-mismatch"')
    const bodyOf = (bytes: Buffer) => bytes.subarray(bytes.indexOf('\r\n\r\n') + 4)
    for (const answer of ['login-state-rejected', 'unavailable', 'invalid-input'] as const) {
      expect(bodyOf(entryAnswerBytes(answer)).equals(versionBody)).toBe(false)
    }
    for (const name of [
      'identifier-taken',
      'credential-rejected',
      'interrupted',
      'notAuthorized',
      'login-state-not-found',
    ]) {
      expect(bodyOf(routeFailureBytes(name)).equals(versionBody)).toBe(false)
    }
    expect(bodyOf(routeSuccessBytes('version-mismatch')).equals(versionBody)).toBe(false)
    expect(ROUTE_IDS).toHaveLength(31)
  })
})

describe('V-9：体的写出规则逐例（examples §7）', () => {
  it.each([
    ['a"b\\c', '22 61 5c 22 62 5c 5c 63 22'],
    ['\u0009', '22 5c 74 22'],
    ['\u0007', '22 5c 75 30 30 30 37 22'],
    ['\u001f', '22 5c 75 30 30 31 66 22'],
    ['é', '22 c3 a9 22'],
    ['/', '22 2f 22'],
    [' ', '22 e2 80 a8 22'],
    ['\u007f', '22 7f 22'],
    ['\ud800', '22 5c 75 64 38 30 30 22'],
  ])('字符串 %j', (value, hex) => {
    const bytes = routeSuccessBytes(value)
    const body = bytes.subarray(bytes.indexOf('\r\n\r\n') + 4)
    expect(body).toEqual(
      Buffer.concat([
        Buffer.from('{"result":'),
        Buffer.from(hex.replace(/ /g, ''), 'hex'),
        Buffer.from('}'),
      ]),
    )
  })

  it('时间点：UTC、Z，秒小数只在非零时写且取最少位数；不写 .000、不写偏移', () => {
    const at = Date.UTC(2026, 8, 23, 8, 0, 0)
    expect(formatInstant(at)).toBe('2026-09-23T08:00:00Z')
    expect(formatInstant(at + 250)).toBe('2026-09-23T08:00:00.25Z')
    expect(formatInstant(at + 123)).toBe('2026-09-23T08:00:00.123Z')
    expect(formatInstant(at + 100)).toBe('2026-09-23T08:00:00.1Z')
    expect(formatInstant(0)).toBe('1970-01-01T00:00:00Z')
    expect(formatInstant(Date.UTC(9999, 11, 31, 23, 59, 59, 999))).toBe('9999-12-31T23:59:59.999Z')
    expect(() => formatInstant(Date.UTC(10000, 0, 1))).toThrow(RangeError)
    expect(() => formatInstant(1.5)).toThrow(RangeError)
  })

  it('整数零写 0；TenantId 与没有上级的组织按 Schema 书写次序、缺席的可选成员不写', () => {
    expect(routeSuccessBytes(0).subarray(-12).toString()).toBe('{"result":0}')
    const tenantRoute = routeFor('capability.organization-governance/v2#S-25')
    const organizationRoute = routeFor('capability.organization-governance/v2#S-22')
    if (tenantRoute === undefined || organizationRoute === undefined)
      throw new Error('route missing')
    expect(
      JSON.stringify(
        project(tenantRoute.schema, { account: 'acc_7f3c91', organization: 'org_kf22' }, {}),
      ),
    ).toBe('{"organization":"org_kf22","account":"acc_7f3c91"}')
    expect(
      JSON.stringify(
        project(organizationRoute.schema, { parent: null, kind: 'team', id: 'org_kf22' }, {}),
      ),
    ).toBe('{"organization":"org_kf22","organizationKind":"team"}')
  })
})
