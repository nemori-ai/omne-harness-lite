import type { EntryAnswer } from '@omne-harness-lite/governance-center-entry-https-json'
import { StorageUnavailable, type AtomicStorage } from '@omne-harness-lite/storage'
import {
  parseLoginStatePresentation,
  type PreparedCredentialChange,
} from '@omne-harness-lite/account-identity'
// 判定次序（入口契约 S-10）：一个请求体恰按下面的次序走，每一步只有「过」与「答」两个出口，没有回跳、没有并行的判定。
//   读 JSON（https-json/1 S-7）→ 0 公开体检 → ① 版本 → ①′ 信封 →（免认人：载荷 → ③）／（② 认人 → 载荷 → 推导 → 补授权 → ③）
// 任何一步判不了就停在那一步答 `unavailable`，永不改说成 `login-state-rejected`；不用查就判得了的照判。
// 参与方抛出、给出集合之外的值、与条款承诺矛盾的返回、结构上到不了的具名值 ⇒ `unavailable` 并记为缺陷（S-14）。
import {
  isOk,
  parseLoginIdentifier,
  parseMembershipStanding,
  parseTenantId,
  type TenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { type DuplicateMember, readJsonText } from '../json.ts'
import { RECEIVE_LIMITS } from '../ops/limits.ts'
import { entryAnswerBytes, routeFailureBytes, routeSuccessBytes } from './answers.ts'
import { type Authentication, type Caller, authenticate } from './caller.ts'
import {
  type Call,
  type Observed,
  type RequestRecord,
  accountCorrelation,
  tenantCorrelation,
  thrownValue,
} from './record.ts'
import {
  ACCEPTED_PROTOCOL_VERSIONS,
  PUBLIC_HEALTH_ROUTE,
} from '@omne-harness-lite/governance-center-entry'
import {
  type AuthenticatedRoute,
  type AuthenticatedServices,
  type ExemptRoute,
  type Payload,
  type ReplyShape,
  type Route,
  routeFor,
} from './routes.ts'
import type { EntryServices } from '../entry-dependencies.ts'
import { conformsTo } from './schema.ts'

export interface DecisionContext {
  readonly storage: AtomicStorage
  readonly services: EntryServices
  /** 启动时构造好的公开体检答复（一次运行期间固定）。 */
  readonly publicHealth: Buffer
}

export interface Decision {
  /** 整份答复字节；`undefined` ⇒ 关连接不写（请求体 JSON 超出嵌套或成员数上界）。 */
  readonly bytes: Buffer | undefined
  readonly record: RequestRecord
}

/** 信封恰这四个成员（S-4）。 */
const ENVELOPE_MEMBERS: ReadonlySet<string> = new Set([
  'protocolVersion',
  'presentedLoginState',
  'operation',
  'payload',
])

const JSON_LIMITS = { depth: RECEIVE_LIMITS.jsonDepth, members: RECEIVE_LIMITS.objectMembers }

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 信封顶层某个成员在请求体里出现的次数（读取器只保留第一次，其余报在重复里）。 */
function occurrences(
  envelope: Readonly<Record<string, unknown>>,
  duplicates: readonly DuplicateMember[],
  name: string,
): number {
  const present = Object.hasOwn(envelope, name) ? 1 : 0
  return present + duplicates.filter(d => d.path.length === 0 && d.name === name).length
}

/** 路由上的一次收场：一份答复字节 + 记录里的那几格。 */
interface Settled {
  readonly bytes: Buffer
  readonly answer: string
  readonly observed?: Observed
  readonly defect?: true
}

function entry(answer: EntryAnswer, observed?: Observed): Settled {
  return observed === undefined
    ? { bytes: entryAnswerBytes(answer), answer }
    : { bytes: entryAnswerBytes(answer), answer, observed }
}

function defect(call: Call, value: string): Settled {
  return {
    bytes: entryAnswerBytes('unavailable'),
    answer: 'unavailable',
    observed: { call, value },
    defect: true,
  }
}

export async function decide(body: Buffer, context: DecisionContext): Promise<Decision> {
  const reading = readJsonText(body, JSON_LIMITS)
  // 超出嵌套深度或成员数上界 ⇒ 关连接不写（S-7），不是 version-mismatch
  if (reading.kind === 'exceeds-limit')
    return { bytes: undefined, record: { stage: 'version', answer: 'none' } }
  // 看不懂的请求答 version-mismatch：不知道它是哪一版、要办哪件事（S-7 四级、S-10 ①）
  if (reading.kind === 'unreadable' || !isPlainObject(reading.value)) {
    return finish({ stage: 'version' }, entry('version-mismatch'))
  }
  const envelope = reading.value
  const duplicates = reading.duplicates
  const count = (name: string) => occurrences(envelope, duplicates, name)

  // 0 公开体检：恰一个 `operation` 成员且等于 S-18 的路由标识；其余成员一律不看（https-json/1 S-9）
  if (count('operation') === 1 && envelope['operation'] === PUBLIC_HEALTH_ROUTE) {
    return {
      bytes: context.publicHealth,
      record: { stage: 'public-health', answer: 'public-health' },
    }
  }

  // ① 版本：缺席、重复、不是字符串或不被接受 ⇒ version-mismatch；出示物一眼都不看
  const protocolVersion = envelope['protocolVersion']
  if (
    count('protocolVersion') !== 1 ||
    typeof protocolVersion !== 'string' ||
    !ACCEPTED_PROTOCOL_VERSIONS.includes(protocolVersion)
  ) {
    return finish({ stage: 'version' }, entry('version-mismatch'))
  }

  // ①′ 信封：`operation` 缺席、重复或不在路由表内，或有表外成员 ⇒ invalid-input（认人之前）
  const route = count('operation') === 1 ? routeFor(envelope['operation']) : undefined
  if (route === undefined || Object.keys(envelope).some(name => !ENVELOPE_MEMBERS.has(name))) {
    return finish({ stage: 'envelope' }, entry('invalid-input'))
  }

  const payload = payloadOf(route, envelope, duplicates, count('payload'))
  if (route.exempt) return exempt(route, payload, context.services)
  // Lookup-free rejection must not depend on starting a storage transaction.
  const presentations = count('presentedLoginState')
  const rejection =
    presentations === 0
      ? 'absent'
      : presentations > 1
        ? 'multiple'
        : !isOk(parseLoginStatePresentation(envelope['presentedLoginState']))
          ? 'malformed'
          : undefined
  if (rejection !== undefined)
    return finish(
      { stage: 'authenticate', route: route.id, rejection },
      entry('login-state-rejected'),
    )
  if (route.credentialChange)
    return changeCredential(route, envelope, presentations, payload, context)
  return committed(context, route, services =>
    authenticated(route, envelope, presentations, payload, services),
  )
}

/** Only the boundary owner can convert a rollback into a network decision. */
class RequestRollback extends Error {
  constructor(readonly decision: Decision) {
    super('request must roll back')
    this.name = 'RequestRollback'
  }
}

async function committed(
  context: DecisionContext,
  route: AuthenticatedRoute,
  work: (services: AuthenticatedServices) => Promise<Decision>,
): Promise<Decision> {
  let rolledBack: Decision | undefined
  try {
    return await context.storage.atomic(async unit => {
      try {
        const services: AuthenticatedServices = {
          accounts: context.services.accounts.participate(unit),
          logins: context.services.logins.participate(unit),
          organizations: context.services.organizations.participate(unit),
          memberships: context.services.memberships.participate(unit),
          offers: context.services.offers.participate(unit),
        }
        const decision = await work(services)
        if (decision.record.defect || decision.record.answer === 'unavailable')
          throw new RequestRollback(decision)
        return decision
      } catch (error) {
        // A participant may have poisoned the unit with its original exception.
        // Keep a prior observed defect for reporting after the rollback.
        if (error instanceof RequestRollback) rolledBack = error.decision
        throw error
      }
    })
  } catch (error) {
    if (rolledBack !== undefined) return rolledBack
    if (error instanceof StorageUnavailable)
      return finish(
        { stage: 'operation', route: route.id },
        entry('unavailable', { call: 'operation', value: 'storage-unavailable' }),
      )
    return finish({ stage: 'operation', route: route.id }, defect('operation', thrownValue(error)))
  }
}

async function changeCredential(
  route: AuthenticatedRoute,
  envelope: Readonly<Record<string, unknown>>,
  presentations: number,
  payload: Payload | undefined,
  context: DecisionContext,
): Promise<Decision> {
  const at = { stage: 'authenticate' as const, route: route.id }
  let recognized: Authentication
  try {
    recognized = await authenticate(
      envelope['presentedLoginState'],
      presentations,
      context.services.logins,
    )
  } catch (error) {
    return finish(
      at,
      error instanceof StorageUnavailable
        ? entry('unavailable')
        : defect('authenticate', thrownValue(error)),
    )
  }
  switch (recognized.kind) {
    case 'rejected':
      return finish({ ...at, rejection: recognized.rejection }, entry('login-state-rejected'))
    case 'unavailable':
      return finish(at, entry('unavailable', recognized.observed))
    case 'defect':
      return finish(at, defect(recognized.observed.call, recognized.observed.value))
    case 'caller':
      break
  }
  const base = {
    stage: 'payload' as const,
    route: route.id,
    account: accountCorrelation(recognized.caller.accountId),
  }
  if (payload === undefined) return finish(base, entry('invalid-input'))
  try {
    if (
      !isParsedOk(context.services.credentials.parse(payload['currentCredential'])) ||
      !isParsedOk(context.services.credentials.parse(payload['newCredential']))
    )
      return finish(base, entry('invalid-input'))
  } catch (error) {
    return finish(base, defect('credentials', thrownValue(error)))
  }
  let prepared: Awaited<ReturnType<EntryServices['logins']['prepareCredentialChange']>>
  try {
    prepared = await context.services.logins.prepareCredentialChange(
      recognized.caller.loginStateId,
      payload['currentCredential'],
      payload['newCredential'],
    )
  } catch (error) {
    return finish(
      base,
      error instanceof StorageUnavailable
        ? entry('unavailable')
        : defect('operation', thrownValue(error)),
    )
  }
  if (!isPlainObject(prepared)) return finish(base, defect('operation', 'malformed-preparation'))
  if ('failure' in prepared) return finish(base, mapFailure(route, prepared.failure, payload))
  if (!('ok' in prepared) || !isPlainObject(prepared.ok))
    return finish(base, defect('operation', 'malformed-preparation'))
  // Final stage starts with the owner's G check, never a second exchange.
  return committed(context, route, services =>
    authenticatedCaller(route, payload, services, recognized.caller, prepared.ok),
  )
}

/** 载荷那一步（S-10）：`payload` 恰一个、里面任意深度没有重复成员（https-json/1 S-8）、合 `Payload_<路由>`。 */
function payloadOf(
  route: Route,
  envelope: Readonly<Record<string, unknown>>,
  duplicates: readonly DuplicateMember[],
  payloadCount: number,
): Payload | undefined {
  if (payloadCount !== 1) return undefined
  if (duplicates.some(d => d.path[0] === 'payload')) return undefined
  const payload = envelope['payload']
  if (!isPlainObject(payload)) return undefined
  return conformsTo(`Payload_${route.schema}`, payload) ? payload : undefined
}

/** 免认人的两条路由（S-19）：出示物带了也不看；载荷不合格 ⇒ invalid-input、从不交进去。 */
async function exempt(
  route: ExemptRoute,
  payload: Payload | undefined,
  services: EntryServices,
): Promise<Decision> {
  const base = { stage: 'payload' as const, route: route.id }
  if (payload === undefined || !isOk(parseLoginIdentifier(payload['loginIdentifier']))) {
    return finish(base, entry('invalid-input'))
  }
  // 凭据材料的表示层用凭据方案 owner 的同一条解析规则（`credentials.parse`，只调它）
  let parsed: unknown
  try {
    parsed = services.credentials.parse(payload['credential'])
  } catch (error) {
    return finish(base, defect('credentials', thrownValue(error)))
  }
  if (!isParsedOk(parsed)) return finish(base, entry('invalid-input'))
  try {
    const settled = await invoke(route, payload, undefined, () => route.invoke(services, payload))
    return finish({ stage: 'operation', route: route.id }, settled)
  } catch (error) {
    return finish(
      { stage: 'operation', route: route.id },
      error instanceof StorageUnavailable
        ? entry('unavailable')
        : defect('operation', thrownValue(error)),
    )
  }
}

function isParsedOk(parsed: unknown): boolean {
  return isPlainObject(parsed) && Object.hasOwn(parsed, 'ok')
}

async function authenticated(
  route: AuthenticatedRoute,
  envelope: Readonly<Record<string, unknown>>,
  presentations: number,
  payload: Payload | undefined,
  services: AuthenticatedServices,
): Promise<Decision> {
  // ② 认人
  const recognized = await authenticate(
    envelope['presentedLoginState'],
    presentations,
    services.logins,
  )
  const at = { stage: 'authenticate' as const, route: route.id }
  switch (recognized.kind) {
    case 'rejected':
      return finish({ ...at, rejection: recognized.rejection }, entry('login-state-rejected'))
    case 'unavailable':
      return finish(at, entry('unavailable', recognized.observed))
    case 'defect':
      return finish(at, defect(recognized.observed.call, recognized.observed.value))
    case 'caller':
      break
  }
  return authenticatedCaller(route, payload, services, recognized.caller)
}

async function authenticatedCaller(
  route: AuthenticatedRoute,
  payload: Payload | undefined,
  services: AuthenticatedServices,
  caller: Caller,
  credentialChange?: PreparedCredentialChange,
): Promise<Decision> {
  const account = accountCorrelation(caller.accountId)

  // 载荷：认出人之后才看输入
  if (payload === undefined) {
    return finish({ stage: 'payload', route: route.id, account }, entry('invalid-input'))
  }

  // 身份推导：只有要行事 TenantId 的路由才现读 OG S-36
  let tenant: TenantId | undefined
  if (route.derivesTenant(payload)) {
    const derivation = await deriveTenant(services, caller)
    if (derivation.kind !== 'tenant') {
      return finish({ stage: 'derive', route: route.id, account }, derivation.settled)
    }
    tenant = derivation.tenant
  }
  if (payload['expectedTenant'] !== undefined) {
    const expected = parseTenantId(payload['expectedTenant'])
    if (!isOk(expected) || tenant === undefined)
      return finish(
        { stage: 'derive', route: route.id, account },
        defect('derive', 'missing-expected-identity'),
      )
    if (!tenantIdEquals(expected.ok, tenant))
      return finish(
        { stage: 'derive', route: route.id, account },
        {
          bytes: routeFailureBytes('expectedTenantMismatch'),
          answer: 'failure:expectedTenantMismatch',
        },
      )
  }
  if (route.requiresSuperAdministrator) {
    if (tenant === undefined)
      return finish({ stage: 'gate', route: route.id, account }, defect('gate', 'missing-tenant'))
    const standing = await services.memberships.standing(tenant)
    if ('failure' in standing) {
      return finish(
        { stage: 'gate', route: route.id, account },
        standing.failure === 'unavailable'
          ? entry('unavailable')
          : defect('gate', 'invalid-standing'),
      )
    }
    const parsed = parseMembershipStanding(standing)
    if (!isOk(parsed))
      return finish(
        { stage: 'gate', route: route.id, account },
        defect('gate', 'malformed-standing'),
      )
    if (parsed.ok.standing !== 'effective' || parsed.ok.role !== 'superAdministrator')
      return finish(
        { stage: 'gate', route: route.id, account },
        { bytes: routeFailureBytes('notAuthorized'), answer: 'failure:notAuthorized' },
      )
  }
  const identities =
    tenant === undefined ? { account } : { account, tenant: tenantCorrelation(tenant) }

  // 补授权：只对四条读路由，全部读完、不短路
  if (route.gate !== undefined) {
    let organizations: readonly unknown[]
    try {
      organizations = route.gate(payload)
    } catch (error) {
      return finish(
        { stage: 'gate', route: route.id, ...identities },
        defect('gate', thrownValue(error)),
      )
    }
    const verdict = await gate(services, caller, organizations)
    if (verdict !== undefined) {
      return finish({ stage: 'gate', route: route.id, ...identities }, verdict)
    }
  }

  // ③ 办事
  const input = {
    payload,
    caller,
    tenant,
    ...(credentialChange === undefined ? {} : { credentialChange }),
  }
  const settled = await invoke(route, payload, caller, () => route.invoke(services, input))
  if (settled.answer === 'result') {
    const finalized = await services.logins.finalizeActivity(caller.loginStateId)
    if (finalized !== 'ok')
      return finish(
        { stage: 'operation', route: route.id, ...identities },
        defect('operation', 'activity-finalization-invalid'),
      )
  }
  return finish({ stage: 'operation', route: route.id, ...identities }, settled)
}

type Derivation =
  | { readonly kind: 'tenant'; readonly tenant: TenantId }
  | { readonly kind: 'settled'; readonly settled: Settled }

/** S-12：现读 OG S-36，参数是认人所得 `LoginStateId`。 */
async function deriveTenant(services: AuthenticatedServices, caller: Caller): Promise<Derivation> {
  let reply: unknown
  try {
    reply = await services.memberships.currentTenant(caller.loginStateId)
  } catch (error) {
    if (error instanceof StorageUnavailable) throw error
    return { kind: 'settled', settled: defect('derive', thrownValue(error)) }
  }
  const normalized = normalize('outcome', reply)
  if (normalized.kind === 'malformed') {
    return { kind: 'settled', settled: defect('derive', 'outside-failure-set') }
  }
  if (normalized.kind === 'failure') {
    switch (normalized.name) {
      // 其间被撤销（S-33）：与在第 ② 步被拒逐字相同
      case 'loginStateNotValid':
        return { kind: 'settled', settled: entry('login-state-rejected') }
      case 'unavailable':
        return {
          kind: 'settled',
          settled: entry('unavailable', { call: 'derive', value: normalized.name }),
        }
      default:
        // `invalidInput` 本版到不了：交进去的是认人所得，错不在来者
        return { kind: 'settled', settled: defect('derive', normalized.name) }
    }
  }
  const tenant = parseTenantId(normalized.value)
  if (!isOk(tenant)) return { kind: 'settled', settled: defect('derive', 'malformed-tenant') }
  // 矛盾清单 ③：返回的 TenantId 的 account 分量不等于认人所得 AccountId
  if (tenant.ok.account !== caller.accountId) {
    return { kind: 'settled', settled: defect('derive', 'account-mismatch') }
  }
  return { kind: 'tenant', tenant: tenant.ok }
}

/**
 * S-13 补授权：对每个组织现读 OG S-26（(该组织, 认人所得 AccountId)），逐个 await、全部读完，
 * 按合成表行序取第一条成立的：任一缺陷 ⇒ 缺陷；任一判不了 ⇒ unavailable（哪怕另一个已读出无效）；
 * 任一无效 ⇒ `notAuthorized`、不调被投影的操作；全部有效 ⇒ 过（`undefined`）。
 */
async function gate(
  services: AuthenticatedServices,
  caller: Caller,
  organizations: readonly unknown[],
): Promise<Settled | undefined> {
  const verdicts: ('defect' | 'unavailable' | 'ineffective' | 'effective')[] = []
  let observedDefect: string | undefined
  for (const organization of organizations) {
    let reply: unknown
    try {
      reply = await services.memberships.standing({ organization, account: caller.accountId })
    } catch (error) {
      if (error instanceof StorageUnavailable) {
        if (observedDefect !== undefined) return defect('gate', observedDefect)
        throw error
      }
      // An escaping participant exception poisons this unit; no further reads.
      return defect('gate', observedDefect ?? thrownValue(error))
    }
    const verdict = standingVerdict(reply)
    verdicts.push(verdict)
    if (verdict === 'defect') observedDefect ??= 'outside-failure-set'
  }
  if (verdicts.includes('defect')) return defect('gate', observedDefect ?? 'outside-failure-set')
  if (verdicts.includes('unavailable'))
    return entry('unavailable', { call: 'gate', value: 'unavailable' })
  if (verdicts.includes('ineffective'))
    return { bytes: routeFailureBytes('notAuthorized'), answer: 'failure:notAuthorized' }
  return undefined
}

function standingVerdict(reply: unknown): 'defect' | 'unavailable' | 'ineffective' | 'effective' {
  if (isPlainObject(reply) && Object.hasOwn(reply, 'failure')) {
    // `invalidInput`：交进去的组织已按 IV 的形状核过，领域仍判它不合形状，错不在来者
    return reply['failure'] === 'unavailable' && Object.keys(reply).length === 1
      ? 'unavailable'
      : 'defect'
  }
  const standing = parseMembershipStanding(reply)
  if (!isOk(standing)) return 'defect'
  return standing.ok.standing
}

type Normalized =
  | { readonly kind: 'ok'; readonly value: unknown }
  | { readonly kind: 'failure'; readonly name: string }
  | { readonly kind: 'malformed' }

/** 把参与方的返回按它的约定归成「成功值／具名失败／集合外」；返回了却没有值也是集合外。 */
function normalize(shape: ReplyShape, reply: unknown): Normalized {
  switch (shape) {
    case 'terminal':
      if (typeof reply !== 'string') return { kind: 'malformed' }
      return reply === 'registered'
        ? { kind: 'ok', value: reply }
        : { kind: 'failure', name: reply }
    case 'ack':
      if (reply === 'ok') return { kind: 'ok', value: reply }
      return failureOf(reply)
    case 'standing':
      if (isPlainObject(reply) && Object.hasOwn(reply, 'standing'))
        return { kind: 'ok', value: reply }
      return failureOf(reply)
    case 'outcome':
      if (isPlainObject(reply) && Object.hasOwn(reply, 'ok'))
        return { kind: 'ok', value: reply['ok'] }
      return failureOf(reply)
  }
}

function failureOf(reply: unknown): Normalized {
  if (isPlainObject(reply) && typeof reply['failure'] === 'string') {
    return { kind: 'failure', name: reply['failure'] }
  }
  return { kind: 'malformed' }
}

/** ③：调被投影的那一个领域操作，按 S-14 映射它的答复。 */
async function invoke(
  route: Route,
  payload: Payload,
  caller: Caller | undefined,
  call: () => Promise<unknown> | unknown,
): Promise<Settled> {
  let reply: unknown
  try {
    reply = await call()
  } catch (error) {
    if (error instanceof StorageUnavailable) throw error
    return defect('operation', thrownValue(error))
  }
  const normalized = normalize(route.reply, reply)
  if (normalized.kind === 'malformed') return defect('operation', 'outside-failure-set')
  if (normalized.kind === 'failure') return mapFailure(route, normalized.name, payload)
  let wire: unknown
  try {
    wire = route.toWire(normalized.value, payload)
    // 矛盾清单 ③（只 OG S-36 一条路由有）
    if (
      !route.exempt &&
      caller !== undefined &&
      route.contradicts?.(normalized.value, caller) === true
    ) {
      return defect('operation', 'account-mismatch')
    }
  } catch {
    return defect('operation', 'result-contradicts-schema')
  }
  // 矛盾清单 ①：成功返回不合 `Result_<路由>`（含 OG S-27、AI S-37 的空列表——那两条 Schema 要求至少一项）
  if (!conformsTo(`Result_${route.schema}`, wire))
    return defect('operation', 'result-contradicts-schema')
  return { bytes: routeSuccessBytes(wire), answer: 'result' }
}

function mapFailure(route: Route, name: string, payload: Payload): Settled {
  const table = route.failures
  if (table.pass.includes(name))
    return { bytes: routeFailureBytes(name), answer: `failure:${name}` }
  if (table.rejected?.includes(name) === true) return entry('login-state-rejected')
  if (table.unavailable?.includes(name) === true) {
    return entry('unavailable', { call: 'operation', value: name })
  }
  if (table.representation?.includes(name) === true) {
    // 交给领域的输入里有来自载荷的项 ⇒ invalid-input；全是入口层产出的值 ⇒ 错不在来者，缺陷
    return Object.keys(payload).some(key => key !== 'expectedTenant')
      ? entry('invalid-input')
      : defect('operation', name)
  }
  // 结构上到不了的具名值，以及失败集合之外的任何名字
  return defect(
    'operation',
    table.unreachable?.includes(name) === true ? name : 'outside-failure-set',
  )
}

function finish(
  base: Omit<RequestRecord, 'answer' | 'observed' | 'defect'>,
  settled: Settled,
): Decision {
  const record: RequestRecord = {
    ...base,
    answer: settled.answer,
    ...(settled.observed === undefined ? {} : { observed: settled.observed }),
    ...(settled.defect === true ? { defect: true } : {}),
  }
  return { bytes: settled.bytes, record }
}
