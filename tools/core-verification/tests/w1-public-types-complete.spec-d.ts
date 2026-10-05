import { expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import type {
  Parsed,
  Branded,
  OpaqueIdentifier,
  AccountId,
  OrganizationId,
  LoginStateId,
  LoginIdentifier,
  OrganizationKind,
  TenantRole,
  TenantId,
  MembershipStanding,
  MembershipStandingResult,
  ScopeLayerIdentity,
  ParentSnapshot,
  ChainResult,
  ShareAncestorResult,
  SchemaDefName as IdentitySchemaDefName,
  SchemaValidation as IdentitySchemaValidation,
  HandoffWarrant,
  WarrantPurpose,
  HandoffKeyPairPem,
  SigningKey,
  VerificationKey,
  WarrantVerification,
} from '@omne-harness-lite/identity-values'
import type {
  Instant,
  Duration,
  Clock,
  OfferTiming,
  SettledState,
  OfferState,
  TargetExistence,
  DeriveStateInput,
  SchemaDefName as OfferSchemaDefName,
  SchemaValidation as OfferSchemaValidation,
} from '@omne-harness-lite/offer-expiry'
import type { Outcome, Ack } from '@omne-harness-lite/kernel-basis'
import type { FiberStateValue, PluginDefinition } from '@omne-harness-lite/kernel-basis/cordis'
import type {
  ReferenceViolationKind,
  StorageFailure,
  UntypedDb,
  ReadTx,
  WriteTx,
  Storage,
  StorageInstance,
  MigrationFragment,
  PreflightInput,
  PreflightResult,
  PreflightCheck,
  AtomicStorage,
  StorageUnit,
  SnapshotFailureKind,
  SnapshotColumn,
  SnapshotIndex,
  SnapshotForeignKey,
  SnapshotTable,
  SnapshotStructure,
  SnapshotView,
  SnapshotCheck,
  SnapshotInput,
  SnapshotInspectionSession,
  SnapshotSession,
  SnapshotRunOptions,
  SnapshotMaintenance,
  SnapshotInspection,
} from '@omne-harness-lite/storage'
import type {
  JsonNumber,
  JsonValue,
  JsonArray,
  JsonObject,
  OpaqueJson,
  JsonReadResult,
  BlockId,
  CallId,
  MediaType,
  InlineBytes,
  ModelToolName,
  Modality,
  ExecutionOutcome,
  ToolCallOutcome,
  AdmissionDenialCode,
  ActionDenialReason,
  PlaceholderReason,
  Visibility,
  CapabilityId,
  AttachmentRef,
  BlockBase,
  OriginTag,
  DerivedRendering,
  RenderingBlock,
  MediaDerivation,
  InlineData,
  TextBlock,
  ThinkingBlock,
  VoiceBlock,
  ImageBlock,
  FileBlock,
  ToolCallBlock,
  IncompleteToolCallBlock,
  ToolResultReason,
  ToolResultBlock,
  ResultContentBlock,
  ContentBlock,
  ContentBlockRejection,
  ContentBlockJudgment,
  SchemaDefName as ContentSchemaDefName,
  SchemaValidation as ContentSchemaValidation,
} from '@omne-harness-lite/content-blocks'
import { FIBER_STATE, definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import {
  generateHandoffKeyPair,
  issueHandoffWarrant,
  loadSigningKey,
  loadVerificationKey,
  verifyHandoffWarrant,
  validate as validateIdentity,
} from '@omne-harness-lite/identity-values'
import { deriveState, validate as validateOffer } from '@omne-harness-lite/offer-expiry'
import { composeMigrations } from '@omne-harness-lite/storage'
import { judgeContentBlock, validate as validateContent } from '@omne-harness-lite/content-blocks'

// 只经根 exports 消费声明。完整名单由独立库存测试对 dist/index.d.ts 核对；
// 以下是类型可用性与关键约束的编译场景，不执行这些数据夹具来声称运行行为。
test('w1.types.complete.kernel-named-protocol', () => {
  const definition: PluginDefinition<{ ttl: number }> = {
    name: 'public-complete-types',
    Config: z.object({ ttl: z.number() }),
    apply(_ctx, config) {
      expectTypeOf(config).toEqualTypeOf<{ ttl: number }>()
    },
  }
  expectTypeOf(definePlugin(definition)).toBeObject()
  const active: FiberStateValue = FIBER_STATE.ACTIVE
  // @ts-expect-error D-025 4.0.4 的状态镜像没有第七种状态
  const invented: FiberStateValue = 6
  const result: Outcome<number, 'unavailable'> = { ok: 1 }
  const ack: Ack<'unavailable'> = 'ok'
  void [active, invented, result, ack]
})

test('w1.types.complete.identity-six-brand-directions', () => {
  const directions = (
    account: AccountId,
    organization: OrganizationId,
    loginState: LoginStateId,
  ) => {
    // @ts-expect-error OrganizationId 不能作 AccountId
    const accountFromOrganization: AccountId = organization
    // @ts-expect-error LoginStateId 不能作 AccountId
    const accountFromLoginState: AccountId = loginState
    // @ts-expect-error AccountId 不能作 OrganizationId
    const organizationFromAccount: OrganizationId = account
    // @ts-expect-error LoginStateId 不能作 OrganizationId
    const organizationFromLoginState: OrganizationId = loginState
    // @ts-expect-error AccountId 不能作 LoginStateId
    const loginStateFromAccount: LoginStateId = account
    // @ts-expect-error OrganizationId 不能作 LoginStateId
    const loginStateFromOrganization: LoginStateId = organization
    void [
      accountFromOrganization,
      accountFromLoginState,
      organizationFromAccount,
      organizationFromLoginState,
      loginStateFromAccount,
      loginStateFromOrganization,
    ]
  }
  expectTypeOf(directions).toBeFunction()
  expectTypeOf<OpaqueIdentifier<'AccountId'>>().toEqualTypeOf<AccountId>()
  expectTypeOf<Branded<string, 'LoginStateId'>>().toEqualTypeOf<LoginStateId>()
  expectTypeOf<LoginIdentifier>().not.toEqualTypeOf<AccountId>()
})

test('w1.types.complete.identity-values-and-snapshots', () => {
  const identity = (organization: OrganizationId, account: AccountId) => {
    const kind: OrganizationKind = 'personal'
    const role: TenantRole = 'member'
    const tenant: TenantId = { organization, account }
    const standing: MembershipStanding = { standing: 'effective', role }
    const result: MembershipStandingResult = standing
    const layer: ScopeLayerIdentity = { layer: 'tenant', tenant }
    const parsed: Parsed<TenantId> = { ok: tenant }
    const parent: ParentSnapshot = () => null
    const chain: ChainResult = { ok: [organization] }
    const shared: ShareAncestorResult = { failure: 'unavailable' }
    // @ts-expect-error unavailable 是读失败，不能伪装为上级快照的空串
    const unreadable: ParentSnapshot = () => ''
    // @ts-expect-error 上级链失败集合没有默认缺席状态
    const invented: ChainResult = { failure: 'absent' }
    return { kind, result, layer, parsed, parent, chain, shared, unreadable, invented }
  }
  expectTypeOf(identity).toBeFunction()
})

test('w1.types.complete.identity-warrant-and-schema', () => {
  expectTypeOf<ReturnType<typeof generateHandoffKeyPair>>().toEqualTypeOf<HandoffKeyPairPem>()
  expectTypeOf<ReturnType<typeof loadSigningKey>>().toEqualTypeOf<Parsed<SigningKey>>()
  expectTypeOf<ReturnType<typeof loadVerificationKey>>().toEqualTypeOf<Parsed<VerificationKey>>()
  expectTypeOf<ReturnType<typeof issueHandoffWarrant>>().toEqualTypeOf<HandoffWarrant>()
  expectTypeOf<ReturnType<typeof verifyHandoffWarrant>>().toEqualTypeOf<WarrantVerification>()
  const purpose: WarrantPurpose = 'activation'
  // @ts-expect-error S-35 本版只批准 activation 与 purge
  const invented: WarrantPurpose = 'expire'
  const schema: IdentitySchemaDefName = 'AccountId'
  const result: IdentitySchemaValidation = validateIdentity(schema, undefined)
  expectTypeOf(result.valid).toEqualTypeOf<boolean>()
  void [purpose, invented]
})

test('w1.types.complete.offer-time-and-input', () => {
  const consume = (instant: Instant, duration: Duration, timing: OfferTiming, clock: Clock) => {
    const state: SettledState = 'accepted'
    const target: TargetExistence = 'unavailable'
    const input: DeriveStateInput = { timing, settled: state, target, now: clock.now() }
    const derived: OfferState | 'unavailable' = deriveState(input)
    // @ts-expect-error 时间点与正时长有不同品牌
    const badDuration: Duration = instant
    // @ts-expect-error 正时长不能冒充时间点
    const badInstant: Instant = duration
    // @ts-expect-error 外部裸数值要经正时长解析，不直接构造
    const unparsed: Duration = 1
    return { derived, badDuration, badInstant, unparsed }
  }
  expectTypeOf(consume).toBeFunction()
  const schema: OfferSchemaDefName = 'OfferTiming'
  const result: OfferSchemaValidation = validateOffer(schema, undefined)
  expectTypeOf(result.valid).toEqualTypeOf<boolean>()
})

test('w1.types.complete.storage-types', () => {
  expectTypeOf<ReadTx['db']>().toEqualTypeOf<UntypedDb>()
  expectTypeOf<WriteTx>().toExtend<ReadTx>()
  expectTypeOf<StorageInstance>().toExtend<Storage>()
  expectTypeOf<StorageFailure>().toExtend<Error>()
  const kind: ReferenceViolationKind = 'missing-target'
  const fragment: MigrationFragment = { name: 'public-consumer', migration: { up: async () => {} } }
  expectTypeOf(composeMigrations([fragment])).toBeObject()
  const check: PreflightCheck = async (input: PreflightInput): Promise<PreflightResult> => {
    expectTypeOf(input.tx).toEqualTypeOf<ReadTx>()
    // @ts-expect-error 提供者传入的表集合只读
    input.tables.add('invented')
    return { ok: false, check: 'consumer', detail: 'type fixture only' }
  }
  expectTypeOf(check).parameter(0).toEqualTypeOf<PreflightInput>()
  void kind
})

test('w1.types.complete.storage-atomic-and-maintenance', () => {
  expectTypeOf<AtomicStorage>().toExtend<Storage>()
  expectTypeOf<StorageUnit>().not.toExtend<Storage>()
  expectTypeOf<StorageUnit['assertStorage']>().parameter(0).toEqualTypeOf<Storage>()
  expectTypeOf<StorageUnit['afterCommit']>().parameter(0).toEqualTypeOf<() => void>()
  expectTypeOf<SnapshotFailureKind>().toEqualTypeOf<
    'busy' | 'unavailable' | 'capacity' | 'invalid-data' | 'cancelled'
  >()
  expectTypeOf<SnapshotTable['columns']>().toEqualTypeOf<readonly SnapshotColumn[]>()
  expectTypeOf<SnapshotTable['indexes']>().toEqualTypeOf<readonly SnapshotIndex[]>()
  expectTypeOf<SnapshotTable['foreignKeys']>().toEqualTypeOf<readonly SnapshotForeignKey[]>()
  expectTypeOf<SnapshotView['structure']>().toEqualTypeOf<SnapshotStructure>()
  expectTypeOf<SnapshotCheck>().parameter(0).toEqualTypeOf<SnapshotView>()
  expectTypeOf<SnapshotCheck>().returns.toEqualTypeOf<Promise<PreflightResult>>()
  expectTypeOf<SnapshotInput['chunks']>().toEqualTypeOf<AsyncIterable<Uint8Array>>()
  expectTypeOf<SnapshotSession>().toExtend<SnapshotInspectionSession>()
  expectTypeOf<SnapshotRunOptions['signal']>().toEqualTypeOf<AbortSignal | undefined>()
  expectTypeOf<SnapshotMaintenance>().not.toExtend<SnapshotInspection>()
  expectTypeOf<SnapshotInspection['close']>().returns.toEqualTypeOf<Promise<void>>()
  const rejectMisuse = (unit: StorageUnit, view: SnapshotView) => {
    // @ts-expect-error 同一事务单元没有独立提交操作
    unit.commit()
    // @ts-expect-error 临时快照视图不提供写入操作
    view.write(0, new Uint8Array())
  }
  expectTypeOf(rejectMisuse).toBeFunction()
})

test('w1.types.complete.storage-consumer-contract-does-not-transfer-physical-close', () => {
  expectTypeOf<Extract<keyof Storage, 'close'>>().toEqualTypeOf<never>()
  expectTypeOf<ReturnType<StorageInstance['close']>>().toEqualTypeOf<Promise<void>>()
})

test('w1.types.complete.denial-is-a-call-outcome-without-execution', () => {
  expectTypeOf<Extract<ToolCallOutcome, 'denied'>>().toEqualTypeOf<'denied'>()
  expectTypeOf<Extract<ExecutionOutcome, 'denied'>>().toEqualTypeOf<never>()
  expectTypeOf<AdmissionDenialCode>().toEqualTypeOf<
    | 'not_held'
    | 'permission_forbidden'
    | 'authorization_denied'
    | 'run_mode_never'
    | 'human_refused'
    | 'human_declined'
  >()
  type Denied = Extract<ToolResultBlock, { readonly outcome: 'denied' }>
  expectTypeOf<Denied['reason']>().toEqualTypeOf<ActionDenialReason>()
  expectTypeOf<Denied['offloaded']>().toEqualTypeOf<undefined>()
  const check = (
    base: Pick<ToolResultBlock, 'id' | 'visibility' | 'callId' | 'blocks'>,
    attachment: AttachmentRef,
  ) => {
    const reason: ActionDenialReason = {
      kind: 'admission',
      code: 'not_held',
      by: 'admission',
      conclusion: 'not held',
    }
    const denied: Denied = { ...base, kind: 'tool_result', outcome: 'denied', reason }
    // @ts-expect-error A denied result must carry its reason.
    const missingReason: Denied = { ...base, kind: 'tool_result', outcome: 'denied' }
    // @ts-expect-error An unexecuted call cannot reference offloaded execution output.
    const withOutput: Denied = { ...denied, offloaded: attachment }
    void [missingReason, withOutput]
  }
  expectTypeOf(check).toBeFunction()
})

test('w1.types.complete.content-json-and-schema', () => {
  const number: JsonNumber = 1
  const array: JsonArray = [number, null]
  const object: JsonObject = { array }
  const value: JsonValue = object
  const read: JsonReadResult = { ok: value }
  // @ts-expect-error 无损 JSON 数组的消费面是只读的
  array.push('mutation')
  // @ts-expect-error JSON 值不承载任意函数
  const nonJson: JsonValue = () => 1
  const schema: ContentSchemaDefName = 'ContentBlock'
  const validation: ContentSchemaValidation = validateContent(schema, undefined)
  expectTypeOf(validation.valid).toEqualTypeOf<boolean>()
  void [read, nonJson]
})

test('w1.types.complete.content-blocks-and-metadata', () => {
  const consume = (id: BlockId, callId: CallId, opaque: OpaqueJson) => {
    const visibility: Visibility = { toHuman: true, toModel: true }
    const mediaType: MediaType = 'image/png'
    const inline: InlineBytes = 'AA=='
    const tool: ModelToolName = 'public_tool'
    const modality: Modality = 'image'
    const capability: CapabilityId = { category: 'tool', name: tool }
    const attachment: AttachmentRef = { storage: 'files', key: 'a', mediaType }
    const origin: OriginTag = { kind: 'skill_body', skill: 'public_skill' }
    const text: TextBlock = { id, visibility, kind: 'text', text: 'text', origin }
    const thinking: ThinkingBlock = { id, visibility, kind: 'thinking', text: '', opaque }
    const rendering: RenderingBlock = text
    const derived: DerivedRendering = { producedBy: 'system', blocks: [rendering] }
    const derivation: MediaDerivation = { renderings: [derived], transcript: 'description' }
    const base: BlockBase = { id, visibility, ...derivation }
    const data: InlineData = { inline }
    const voice: VoiceBlock = { ...base, kind: 'voice', mediaType: 'audio/wav', data }
    const image: ImageBlock = { ...base, kind: 'image', mediaType, data: attachment }
    const file: FileBlock = { ...base, kind: 'file', attachment }
    // @ts-expect-error 有派生表示时 transcript 是必填，不静默补默认
    const partial: MediaDerivation = { renderings: [derived] }
    return { modality, capability, thinking, voice, image, file, partial, callId }
  }
  expectTypeOf(consume).toBeFunction()
})

test('w1.types.complete.content-call-result-and-judgment', () => {
  const consume = (id: BlockId, callId: CallId) => {
    const visibility: Visibility = { toHuman: true, toModel: true }
    const call: ToolCallBlock = {
      id,
      callId,
      visibility,
      kind: 'tool_call',
      complete: true,
      tool: 'public_tool',
      arguments: null,
    }
    const incomplete: IncompleteToolCallBlock = {
      id,
      kind: 'tool_call',
      complete: false,
      visibility: { toHuman: false, toModel: false },
      rawArguments: '{',
    }
    const code: PlaceholderReason = 'user_interrupted'
    const reason: ToolResultReason = { code, text: 'type fixture only' }
    const outcome: ExecutionOutcome = 'interrupted'
    const result: ToolResultBlock = {
      id,
      callId,
      visibility,
      kind: 'tool_result',
      outcome,
      blocks: [],
      reason: { code: 'user_interrupted', text: reason.text },
    }
    const resultContent: ResultContentBlock = result
    const content: ContentBlock = incomplete
    const rejection: ContentBlockRejection = 'incomplete_call_visible'
    const judgment: ContentBlockJudgment = judgeContentBlock(content)
    // @ts-expect-error 结果块内部不能包含工具调用
    const nestedCall: ResultContentBlock = call
    // @ts-expect-error 表示层拒绝不返回一份修补后的新状态
    const repaired: ContentBlockRejection = 'repaired'
    return { resultContent, judgment, rejection, nestedCall, repaired }
  }
  expectTypeOf(consume).toBeFunction()
})
