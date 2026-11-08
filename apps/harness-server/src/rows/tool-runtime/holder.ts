// Tool 运行时组的按运行共享状态（B 段，R2-D66、L-TOOL 事实清单 §3）：`createLocalToolRuntimePlugins` 只能建一份
// bundle，五行（`tool-records`、`tool-runtime`、`tool-executor`、`tool-instances`、`tool-environments`）安装同一个
// bundle 的插件。行之间没有服务键可以交接 bundle，所以按 Cordis 根上下文（`ctx.root`）各存一份：同一次运行的
// 行与入口对象共用它，不同运行互不相通，不留进程级状态（先例：`entry/execution-wiring.ts` 按 `env` 的 WeakMap）。
// 这里只保存：
// - 一个 Tool 时钟。`toolClock` 入口对象与 bundle 用同一个实例，时钟铸的令牌只有铸它的实例认得。
// - 当前的 SQL 端口与会话工作主体读口。它们由 `tool-records` 行在自己的受信上下文里交来，行撤除时收回；
//   bundle 拿到的是逐次读这里的窄代理，缺席时答 `unavailable`。
// - identity 的两个受信读口：核验器 `principalVerifier` 与当前资格 `tenantStanding`。入口对象 `toolClock` 安装时
//   交来经 `env.readTrusted` 逐次现取的读法（R2-D203 P-9），Tool 运行时组与 Tool 请求来源都从这里读，行不因此
//   看见受信名；没有交来时答 undefined，读方答 `unavailable`。
// - 调用见证：记录记录仓读到的原调用与它的来源证据，`toolPublicationAuthority` 只用它同步核对实例发布。
// - 结清通知：记录仓提交了某个调用的 `settled` 状态后，见证与执行环境的按调用表（origin、账本视图）删掉这个
//   调用，长跑进程里这些表只随在途调用数增长，不随累计调用数增长（L3 评审 N5）。
// - bundle 本身：由 `tool-records` 行按运维者配置建一次，其余四行等它建好再装自己的插件。
import type { Context } from '@deepseek-ai/cordis'
import { canonicalDigest, type LedgerRecord, type ToolLedgerStore } from '@omne-harness/tool'
import type {
  ToolClock,
  ToolMaterialClock,
  ToolMaterialStore,
} from '@omne-harness/tool-contract/provider'
import {
  createLocalToolClock,
  createLocalToolMaterialClock,
  type LocalToolForwarding,
} from '@omne-harness/tool-host-local'
import type { createLocalToolRuntimePlugins } from '@omne-harness/tool-host-local/cordis'

type EnvironmentGuardedHostCommit = LocalToolRuntimeInput['environment']['guarded']
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import type { SessionWorkPrincipals } from '@omne-harness/session-contract'
import type { SchemaProvider } from '@omne-harness/schema-provider'
import type { LocalToolRuntimeInput } from '@omne-harness/tool-host-local/cordis'

export type ToolRuntimeBundle = ReturnType<typeof createLocalToolRuntimePlugins>

/** `tool-records` 行在自己的受信上下文里建出的 SQL 端口。 */
export type ToolSqlPorts = Readonly<{
  store: ToolLedgerStore
  materials: ToolMaterialStore<unknown>
  guarded: EnvironmentGuardedHostCommit
}>

type Witnessed = { execution: string; sources: Set<string> }

export type ToolRuntimeHolder = {
  /** Late forwarding work is drained by the business shutdown before the runtime closes. */
  toolsForwarding: LocalToolForwarding<unknown> | null
  readonly clock: ToolClock
  readonly materialClock: ToolMaterialClock
  /** 当前 SQL 端口；`tool-records` 行不在时为 null。 */
  sql: ToolSqlPorts | null
  /** 执行域的 schema-provider；`tool-environments` 行装载时交来，撤除时收回。 */
  schemaProvider: SchemaProvider | null
  bodySchemas: NonNullable<LocalToolRuntimeInput['bodySchemas']> | null
  /** 当前会话工作主体读口；`tool-records` 行不在时为 undefined。 */
  workPrincipals: () => SessionWorkPrincipals<unknown> | undefined
  /** identity 的核验器，入口逐次现取；入口没有交来时为 undefined。 */
  verifier: () => PrincipalVerifier | undefined
  /** identity 的当前资格读口，入口逐次现取；入口没有交来时为 undefined。 */
  standing: () => TenantStandingSource | undefined
  /** bundle 与建它所用配置的摘要；未建时为 null。 */
  bundle: Readonly<{ value: ToolRuntimeBundle; configDigest: string }> | null
  /** 建好 bundle 时兑现。 */
  readonly ready: Promise<ToolRuntimeBundle>
  readonly resolve: (bundle: ToolRuntimeBundle) => void
  /** 记录仓读到的、未结清的原调用：键是 (tenant, call) 的摘要。只在本进程内，不是耐久事实。 */
  readonly witnessed: Map<string, Witnessed>
  /** 调用结清时调用；参数是 (tenant, call) 的摘要。执行环境在这里挂上删除自己按调用表的回调。 */
  readonly settled: Set<(call: string) => void>
  /** 本进程按调用表的当前大小（见证、origin、账本视图），诊断与用例读。 */
  readonly residents: Map<string, () => number>
}

/** 按调用表的键：(tenant, call) 的摘要。 */
export function callKeyOf(tenant: unknown, call: unknown): string {
  return canonicalDigest([tenant, call])
}

/** 调用已结清：删掉见证，通知各按调用表。一个回调抛出不影响其余的，也不影响提交的答复。 */
function settleCall(holder: ToolRuntimeHolder, call: string): void {
  holder.witnessed.delete(call)
  for (const forget of holder.settled)
    try {
      forget(call)
    } catch {
      // A table that cannot forget keeps the entry; the commit itself has already succeeded.
    }
}

const holders = new WeakMap<Context, ToolRuntimeHolder>()

/** 本次运行（Cordis 根）的共享状态；第一次取时建立。 */
export function toolRuntimeHolder(ctx: Context): ToolRuntimeHolder {
  const root = ctx.root
  const found = holders.get(root)
  if (found !== undefined) return found
  let resolve: (bundle: ToolRuntimeBundle) => void = () => {}
  const ready = new Promise<ToolRuntimeBundle>(done => {
    resolve = done
  })
  const created: ToolRuntimeHolder = {
    toolsForwarding: null,
    clock: createLocalToolClock(),
    materialClock: createLocalToolMaterialClock({
      wallMs: () =>
        /* wall-clock: clock-source -- Tool 材料时钟的墙钟输入，水位由原 call 域持久核验 */ Date.now(),
      monotonicMs: () =>
        /* wall-clock: clock-source -- Tool 材料时钟的同进程单调输入 */ performance.now(),
    }),
    sql: null,
    schemaProvider: null,
    bodySchemas: null,
    workPrincipals: () => undefined,
    verifier: () => undefined,
    standing: () => undefined,
    bundle: null,
    ready,
    resolve,
    witnessed: new Map(),
    settled: new Set(),
    residents: new Map(),
  }
  created.residents.set('witnessed', () => created.witnessed.size)
  holders.set(root, created)
  return created
}

const unavailableRead = (diagnostic: string) => ({ kind: 'unavailable' as const, diagnostic })

/**
 * 交给 bundle 的耐久记录仓：逐次读当前 SQL 端口，缺席答 `unavailable`（不是空记录）。读到的未结清原调用记进
 * 见证；读到调用已是 `settled`，或提交成功且写入了它的 `settled` 状态时，按调用表删掉这个调用（提交答 `unknown` 但实际已落盘的
 * 结清，由之后的读补上）。
 * 声明 `durable`：它只转交给 SQL 记录仓，从不在内存里保存记录。
 */
export function lateStore(holder: ToolRuntimeHolder): ToolLedgerStore {
  const observe = (row: LedgerRecord) => {
    if (row.kind !== 'call') return
    const key = callKeyOf(row.call.tenant, row.call.call)
    if (row.call.state.phase === 'settled') {
      // The record says the call ended: release it whatever way that commit reached this process.
      settleCall(holder, key)
      return
    }
    if (row.call.execution === null) return
    const execution = canonicalDigest(row.call.execution)
    const old = holder.witnessed.get(key)
    const current = old?.execution === execution ? old : { execution, sources: new Set<string>() }
    current.sources.add(canonicalDigest(row.call.state.source))
    holder.witnessed.set(key, current)
  }
  return Object.freeze({
    durability: 'durable' as const,
    async read(domain) {
      const sql = holder.sql
      if (sql === null) return unavailableRead('tool-records: no SQL ledger store is installed')
      const answer = await sql.store.read(domain)
      if (answer.kind === 'complete') for (const row of answer.records) observe(row)
      return answer
    },
    async readRecord(domain, key) {
      const sql = holder.sql
      if (sql === null) return unavailableRead('tool-records: no SQL ledger store is installed')
      const answer = await sql.store.readRecord(domain, key)
      if (answer.kind === 'complete' && answer.record !== null) observe(answer.record)
      return answer
    },
    async commit(input) {
      const sql = holder.sql
      if (sql === null) return unavailableRead('tool-records: no SQL ledger store is installed')
      const answer = await sql.store.commit(input)
      if (answer.kind === 'committed')
        for (const write of input.writes)
          if (
            write.kind === 'put' &&
            write.record.kind === 'call' &&
            write.record.call.state.phase === 'settled'
          )
            settleCall(holder, callKeyOf(write.record.call.tenant, write.record.call.call))
      return answer
    },
  } satisfies ToolLedgerStore)
}

export const TOOL_MATERIAL_PROVIDER = Object.freeze({
  owner: '@omne-harness/tool-storage-sql',
  name: 'tool-material',
  revision: '1',
  digest: 'sha256:tool-material/1',
})

export function lateMaterials(holder: ToolRuntimeHolder): ToolMaterialStore<unknown> {
  const unavailable = {
    failure: {
      kind: 'unavailable' as const,
      dependency: 'tool-records',
      diagnostic: 'no SQL material store is installed',
    },
  }
  return Object.freeze({
    write: input => holder.sql?.materials.write(input) ?? Promise.resolve(unavailable),
    inspect: input => holder.sql?.materials.inspect(input) ?? Promise.resolve(unavailable),
    read: input => holder.sql?.materials.read(input) ?? Promise.resolve(unavailable),
    erase: input => holder.sql?.materials.erase(input) ?? Promise.resolve(unavailable),
    inspectErase: input =>
      holder.sql?.materials.inspectErase(input) ?? Promise.resolve(unavailable),
  } satisfies ToolMaterialStore<unknown>)
}

/** 交给 bundle 的守护宿主提交：逐次读当前 SQL 端口，缺席答 `unavailable`。 */
export function lateGuarded(holder: ToolRuntimeHolder): EnvironmentGuardedHostCommit {
  const guarded: EnvironmentGuardedHostCommit = {
    commit: input =>
      holder.sql?.guarded.commit(input) ??
      Promise.resolve(unavailableRead('tool-records: no SQL guarded commit is installed')),
  }
  return Object.freeze(guarded)
}

/** 见证核对：这个原调用在记录仓里有这个执行与这份来源证据。 */
export function witnessed(
  holder: ToolRuntimeHolder,
  execution: unknown,
  source: unknown,
  key: readonly [unknown, unknown],
): boolean {
  const known = holder.witnessed.get(canonicalDigest(key))
  return (
    known?.execution === canonicalDigest(execution) && known.sources.has(canonicalDigest(source))
  )
}

/** 其余四行等 bundle 建好；`tool-records` 一直不装时停在等待，不答就绪。 */
export function awaitBundle(ctx: Context): Promise<ToolRuntimeBundle> {
  const holder = toolRuntimeHolder(ctx)
  return holder.bundle === null ? holder.ready : Promise.resolve(holder.bundle.value)
}
