import { expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { definePlugin, isSuccess, type Ack, type Outcome } from '@omne-harness-lite/kernel-basis'
import {
  type AccountId,
  type LoginIdentifier,
  type MembershipStandingResult,
  type OrganizationId,
  type Parsed,
  type ScopeLayerIdentity,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import {
  type Clock,
  type Instant,
  type OfferState,
  type OfferTiming,
  type SettledState,
} from '@omne-harness-lite/offer-expiry'
import {
  type PreflightCheck,
  type PreflightResult,
  type ReadTx,
  type ReferenceViolationKind,
  type Storage,
  type StorageInstance,
  type WriteTx,
  narrow,
} from '@omne-harness-lite/storage'
import {
  type BlockId,
  type CallId,
  type ContentBlock,
  type JsonNumber,
  type Modality,
  type OpaqueJson,
  type ToolCallBlock,
  type ToolResultBlock,
  LosslessNumber,
} from '@omne-harness-lite/content-blocks'
import type { Kysely } from 'kysely'

test('w1.types.kernel.outcome-public', () => {
  const inferred = definePlugin({
    name: 'public-type-consumer',
    Config: z.object({ ttl: z.number() }),
    apply(_ctx, config) {
      expectTypeOf(config).toEqualTypeOf<{ ttl: number }>()
      // @ts-expect-error Standard Schema 推导的配置没有任意属性
      config.unknown
    },
  })
  expectTypeOf(inferred).toBeObject()
  const narrowResult = (result: Outcome<number, 'unavailable' | 'interrupted'>) => {
    if (isSuccess(result)) {
      expectTypeOf(result.ok).toEqualTypeOf<number>()
      // @ts-expect-error 在成功支不可读取失败
      result.failure
    } else {
      expectTypeOf(result.failure).toEqualTypeOf<'unavailable' | 'interrupted'>()
      // @ts-expect-error 在失败支不可读取成功
      result.ok
    }
  }
  expectTypeOf(narrowResult).toBeFunction()
  // @ts-expect-error 失败集合不含未知值
  const unknown: Outcome<number, 'unavailable'> = { failure: 'unknown' }
  // @ts-expect-error Ack 的成功是字面 ok，不能填对象成功值
  const wrongAck: Ack<'unavailable'> = { ok: 1 }
  void [unknown, wrongAck]
})

test('w1.types.identity.brands', () => {
  const brandCheck = (account: AccountId, organization: OrganizationId, login: LoginIdentifier) => {
    // @ts-expect-error 登录标识不是账号引用键
    const accountFromLogin: AccountId = login
    // @ts-expect-error 组织标识不是账号引用键
    const accountFromOrganization: AccountId = organization
    // @ts-expect-error 外部字符串必须先过解析器
    const rawAccount: AccountId = 'account'
    // @ts-expect-error TenantId 两个分量均必填
    const missing: TenantId = { account }
    // @ts-expect-error TenantId 不包含角色
    const role: TenantId = { account, organization, role: 'member' }
    void [accountFromLogin, accountFromOrganization, rawAccount, missing, role]
  }
  expectTypeOf(brandCheck).toBeFunction()
  expectTypeOf<keyof TenantId>().toEqualTypeOf<'account' | 'organization'>()
})

test('w1.types.identity.in-band-results', () => {
  expectTypeOf<ScopeLayerIdentity['layer']>().toEqualTypeOf<'organization' | 'tenant'>()
  // @ts-expect-error 未实现的会话层不能凭空成为变体
  const session: ScopeLayerIdentity = { layer: 'session', session: 's' }
  // @ts-expect-error 表示层非法不是效力判定结果
  const invalid: MembershipStandingResult = { invalidInput: 'bad' }
  // @ts-expect-error 成员不可用不是表示层拒绝
  const failure: Parsed<TenantId> = { failure: 'unavailable' }
  // @ts-expect-error effective 必须给出角色
  const missingRole: MembershipStandingResult = { standing: 'effective' }
  void [session, invalid, failure, missingRole]
})

test('w1.types.offer.derived-state-and-clock', () => {
  expectTypeOf<SettledState>().toEqualTypeOf<'accepted' | 'withdrawn'>()
  expectTypeOf<OfferState>().toEqualTypeOf<'pending' | 'accepted' | 'withdrawn' | 'expired'>()
  expectTypeOf<ReturnType<Clock['now']>>().toEqualTypeOf<Instant | 'unavailable'>()
  // @ts-expect-error 派生 expired 不是持久终结状态
  const stored: SettledState = 'expired'
  // @ts-expect-error 时间点是品牌化数值
  const instant: Instant = 1
  const readonlyTiming = (timing: OfferTiming) => {
    // @ts-expect-error 只读属性；不声称 runtime 深冻结
    timing.expiresAt = timing.issuedAt
  }
  expectTypeOf(readonlyTiming).toBeFunction()
  void [stored, instant]
})

test('w1.types.storage.protocol-and-preflight', () => {
  expectTypeOf<keyof Storage>().toEqualTypeOf<'read' | 'write'>()
  expectTypeOf<keyof StorageInstance>().toEqualTypeOf<'read' | 'write' | 'close'>()
  expectTypeOf<keyof WriteTx>().toEqualTypeOf<'db' | 'lockRow' | 'lockSentinel'>()
  expectTypeOf<ReferenceViolationKind>().toEqualTypeOf<'missing-target' | 'delete-restricted'>()
  const readonlyTx = (tx: ReadTx) => {
    // @ts-expect-error 锁面只归写事务
    tx.lockRow('table', { key: 'x' })
    expectTypeOf(narrow<{ consumer: { value: string } }>(tx)).toEqualTypeOf<
      Kysely<{ consumer: { value: string } }>
    >()
  }
  expectTypeOf(readonlyTx).toBeFunction()
  const check: PreflightCheck = async ({ tables, appliedMigrations }) => {
    expectTypeOf(tables).toEqualTypeOf<ReadonlySet<string>>()
    expectTypeOf(appliedMigrations).toEqualTypeOf<readonly string[]>()
    return { ok: false, check: 'consumer-check', detail: 'consumer detail' }
  }
  expectTypeOf(check).returns.resolves.toEqualTypeOf<PreflightResult>()
  // @ts-expect-error 核对失败必带 check/detail
  const unnamed: PreflightResult = { ok: false }
  void unnamed
})

test('w1.types.content.opaque-and-call-forms', () => {
  expectTypeOf<BlockId>().not.toEqualTypeOf<CallId>()
  expectTypeOf(new LosslessNumber('1.10')).toExtend<JsonNumber>()
  const inspect = (opaque: OpaqueJson, block: ContentBlock) => {
    // @ts-expect-error 不透明值不暴露 JSON 内容成员
    opaque.signature
    // @ts-expect-error 不透明值不能按字符串索引
    opaque['signature']
    // @ts-expect-error 块的可见性只读
    block.visibility.toModel = true
  }
  expectTypeOf(inspect).toBeFunction()
  // @ts-expect-error 原始 JSON 对象须经过显式 opaque 边界
  const rawOpaque: OpaqueJson = { signature: 'x' }
  // @ts-expect-error 没有第五个模态
  const noModality: Modality = 'none'
  const shapes = (id: BlockId, callId: CallId) => {
    const mixed = {
      id,
      callId,
      kind: 'tool_call',
      complete: true,
      tool: 't',
      visibility: { toHuman: true, toModel: true },
      arguments: null,
      rawArguments: '',
      unparseable: true,
    } as const
    // @ts-expect-error 已解析与解析不了的参数形状互斥
    const call: ToolCallBlock = mixed
    // @ts-expect-error 转后台结果必须带匹配原因
    const result: ToolResultBlock = {
      id,
      callId,
      kind: 'tool_result',
      outcome: 'backgrounded',
      blocks: [],
      visibility: { toHuman: true, toModel: true },
    }
    void [call, result]
  }
  expectTypeOf(shapes).toBeFunction()
  void [rawOpaque, noModality]
})
