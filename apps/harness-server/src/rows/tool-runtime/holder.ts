// Tool 运行时组的按运行共享状态（B 段，R2-D66、L-TOOL 事实清单 §3）：`createLocalToolRuntimePlugins` 只能建一份
// bundle，五行（`tool-records`、`tool-runtime`、`tool-executor`、`tool-instances`、`tool-environments`）安装同一个
// bundle 的插件。行之间没有服务键可以交接 bundle，所以按 Cordis 根上下文（`ctx.root`）各存一份：同一次运行的
// 行与入口对象共用它，不同运行互不相通，不留进程级状态（先例：`entry/execution-wiring.ts` 按 `env` 的 WeakMap）。
// 这里只保存：
// - 一个 Tool 时钟。`toolClock` 入口对象与 bundle 用同一个实例，时钟铸的令牌只有铸它的实例认得。
// - 当前的 SQL 端口与会话工作主体读口。它们由 `tool-records` 行在自己的受信上下文里交来，行撤除时收回；
//   bundle 拿到的是逐次读这里的窄代理，缺席时答 `unavailable`。
// - 调用见证：记录记录仓读到的原调用与它的来源证据，`toolPublicationAuthority` 只用它同步核对实例发布。
// - bundle 本身：由 `tool-records` 行按运维者配置建一次，其余四行等它建好再装自己的插件。
import type { Context } from '@deepseek-ai/cordis'
import { canonicalDigest, type ToolLedgerStore } from '@omne-harness/tool'
import type {
  ToolClock,
  ToolMessageContentBlock,
  ToolOutputCustody,
} from '@omne-harness/tool-contract/provider'
import { createLocalToolClock } from '@omne-harness/tool-host-local'
import type { createLocalToolRuntimePlugins } from '@omne-harness/tool-host-local/cordis'
import type { SessionWorkPrincipals } from '@omne-harness/session-contract'
import type { Principal } from '@omne-harness/identity'
import type { SchemaProvider } from '@omne-harness/schema-provider'
import type { EnvironmentGuardedHostCommit } from '@omne-harness/tool-host-local'

export type ToolRuntimeBundle = ReturnType<typeof createLocalToolRuntimePlugins>

/** `tool-records` 行在自己的受信上下文里建出的 SQL 端口。 */
export type ToolSqlPorts = Readonly<{
  store: ToolLedgerStore<ToolMessageContentBlock>
  custody: ToolOutputCustody<unknown>
  guarded: EnvironmentGuardedHostCommit
}>

type Witnessed = { execution: string; sources: Set<string> }

export type ToolRuntimeHolder = {
  readonly clock: ToolClock
  /** 当前 SQL 端口；`tool-records` 行不在时为 null。 */
  sql: ToolSqlPorts | null
  /** 执行域的 schema-provider；`tool-environments` 行装载时交来，撤除时收回。 */
  schemaProvider: SchemaProvider | null
  /** 当前会话工作主体读口；`tool-records` 行不在时为 undefined。 */
  workPrincipals: () => SessionWorkPrincipals<Principal> | undefined
  /** bundle 与建它所用配置的摘要；未建时为 null。 */
  bundle: Readonly<{ value: ToolRuntimeBundle; configDigest: string }> | null
  /** 建好 bundle 时兑现。 */
  readonly ready: Promise<ToolRuntimeBundle>
  readonly resolve: (bundle: ToolRuntimeBundle) => void
  /** 记录仓读到的原调用：键是 (tenant, call) 的摘要。只在本进程内，不是耐久事实。 */
  readonly witnessed: Map<string, Witnessed>
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
    clock: createLocalToolClock(),
    sql: null,
    schemaProvider: null,
    workPrincipals: () => undefined,
    bundle: null,
    ready,
    resolve,
    witnessed: new Map(),
  }
  holders.set(root, created)
  return created
}

const unavailableRead = (diagnostic: string) => ({ kind: 'unavailable' as const, diagnostic })

/**
 * 交给 bundle 的耐久记录仓：逐次读当前 SQL 端口，缺席答 `unavailable`（不是空记录）。读到的原调用记进见证。
 * 声明 `durable`：它只转交给 SQL 记录仓，从不在内存里保存记录。
 */
export function lateStore(holder: ToolRuntimeHolder): ToolLedgerStore<ToolMessageContentBlock> {
  return Object.freeze({
    durability: 'durable' as const,
    async read(domain) {
      const sql = holder.sql
      if (sql === null) return unavailableRead('tool-records: no SQL ledger store is installed')
      const answer = await sql.store.read(domain)
      if (answer.kind === 'complete')
        for (const row of answer.records)
          if (row.kind === 'call' && row.call.execution !== null) {
            const key = canonicalDigest([row.call.tenant, row.call.call])
            const execution = canonicalDigest(row.call.execution)
            const old = holder.witnessed.get(key)
            const current =
              old?.execution === execution ? old : { execution, sources: new Set<string>() }
            current.sources.add(canonicalDigest(row.call.state.source))
            holder.witnessed.set(key, current)
          }
      return answer
    },
    async commit(input) {
      const sql = holder.sql
      if (sql === null) return unavailableRead('tool-records: no SQL ledger store is installed')
      return sql.store.commit(input)
    },
  } satisfies ToolLedgerStore<ToolMessageContentBlock>)
}

const custodyUnavailable = {
  failure: {
    kind: 'unavailable' as const,
    dependency: 'tool-records',
    diagnostic: 'no SQL output custody is installed',
  },
}

/** 交给 bundle 的输出保管：逐次读当前 SQL 保管，缺席答 `unavailable`。 */
export function lateCustody(holder: ToolRuntimeHolder): ToolOutputCustody<unknown> {
  return Object.freeze({
    preserve: input => holder.sql?.custody.preserve(input) ?? Promise.resolve(custodyUnavailable),
    inspect: input => holder.sql?.custody.inspect(input) ?? Promise.resolve(custodyUnavailable),
    retainResult: input =>
      holder.sql?.custody.retainResult(input) ?? Promise.resolve(custodyUnavailable),
  } satisfies ToolOutputCustody<unknown>)
}

/** 交给 bundle 的守护宿主提交：逐次读当前 SQL 端口，缺席答 `unavailable`。 */
export function lateGuarded(holder: ToolRuntimeHolder): EnvironmentGuardedHostCommit {
  return Object.freeze({
    commit: input =>
      holder.sql?.guarded.commit(input) ??
      Promise.resolve(unavailableRead('tool-records: no SQL guarded commit is installed')),
  })
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
