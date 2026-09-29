# @omne-harness-lite/session-log-jsonl

本地 JSONL 会话日志提供者，实现 session-log v3 的三项操作：带条件整批追加、按不透明键读取、从位置之后读取。一次提交占一行。载荷通过 core 的严格无损 JSON 边界；提供者不解释 Run 记录、模型响应或业务键。

包根入口公开 `checkAppendInput`、`judgeAppend`、`emptyLogState`、`foldCommit`、`encodeCommitLine`、`decodeLogBytes` 和 `openJsonlSessionLog`。这些函数及独立属主闭包不解析 Cordis。`./plugin` 公开 `Config`、`sessionLogJsonl` 和默认插件。`sessionLog` 服务恰有 `append`、`readByKey`、`readSince`；`close` 归物理属主。

## 纯构件

表示检查复制并冻结合法输入，其 `ok` 值可交给纯判定函数。自行提供状态不证明它就是实际日志当前的权威状态。逻辑位置和尝试序号使用 core `JsonNumber`，包括 `LosslessNumber`，不通过浮点比较。

```ts
import assert from 'node:assert/strict'
import {
  checkAppendInput,
  emptyLogState,
  judgeAppend,
  encodeCommitLine,
  decodeLogBytes,
} from '@omne-harness-lite/session-log-jsonl'

const checked = checkAppendInput('example-session', [{
  tenant: { organization: 'example-organization', account: 'example-account' },
  readKeys: ['example-record'],
  payload: { text: 'Hello' },
}], { kind: 'unfenced' }, { kind: 'tailEquals', tail: 0 })
if ('failure' in checked) throw new Error('invalid example input')
const decision = judgeAppend(emptyLogState(), checked.ok)
assert.deepEqual(decision, { positions: [1], tail: 1 })
const bytes = encodeCommitLine({ v: 1, session: checked.ok.session, first: 1, entries: checked.ok.entries })
const decoded = decodeLogBytes(bytes, checked.ok.session)
assert.ok(!('failure' in decoded))
assert.equal(decoded.commits.length, 1)
```

## 真实文件、幂等与尾冲突

`append(session, entries, fence, condition)` 必须有四个实参。显式选择 `unfenced` 或 `fenced`，以及 `unconditional` 或 `tailEquals`。缺参收 `invalidInput`，不为旧三参调用补兼容默认值。

```ts
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkAppendInput, openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'

const checked = checkAppendInput('example-session', [{
  tenant: { organization: 'example-organization', account: 'example-account' },
  dedupeKey: 'example-record', readKeys: ['example-record'], payload: { text: 'Hello' },
}], { kind: 'unfenced' }, { kind: 'unconditional' })
if ('failure' in checked) throw new Error('invalid example input')
const { session, entries, fence, condition } = checked.ok
// Create once at physical process startup; reuse across every open and fiber.
const processOwnership = {
  current: `example-physical-life:${randomUUID()}`,
  async observeExit(): Promise<'unknown'> { return 'unknown' },
}
const dir = await mkdtemp(join(tmpdir(), 'omne-session-log-example-'))
const owner = await openJsonlSessionLog({ dir, processOwnership, policy: { appendQueueLimit: 8, residentLogsLimit: 4 } })
try {
  assert.deepEqual(await owner.readSince(session, 0), { entries: [], tail: 0 })
  assert.deepEqual(await owner.append(session, entries, fence, condition), { positions: [1], tail: 1 })
  assert.deepEqual(await owner.append(session, entries, fence, condition), { failure: 'alreadyRecorded', keys: ['example-record'] })
  const fresh = [{ ...entries[0], tenant: entries[0]?.tenant, dedupeKey: 'fresh', readKeys: [], payload: null }]
  const freshInput = checkAppendInput(session, fresh, fence, { kind: 'tailEquals', tail: 0 })
  if ('failure' in freshInput) throw new Error('invalid example input')
  assert.deepEqual(await owner.append(session, freshInput.ok.entries, fence, freshInput.ok.condition), { failure: 'tailChanged', tail: 1 })
  const original = await owner.readByKey(session, 'example-record')
  if ('failure' in original) throw new Error('read unavailable')
  assert.deepEqual(original.entries[0]?.payload, { text: 'Hello' })
} finally {
  await owner.close()
  await rm(dir, { recursive: true, force: true })
}
```

合法请求依次判 `tenantMismatch`、`attemptSuperseded`、`alreadyRecorded`、`tailChanged`。每个拒绝只确认本次没有写业务条目。`alreadyRecorded` 交回撞键，不代表旧载荷等于这次整批。`unavailable` 表示没有权威答案或确认提交，先前调用可能仍未知；后一次冲突不能证明先前未知调用没提交。

`readSince(session, 0)` 交回同次快照的完整稠密确认前缀与尾。`readByKey` 只交匹配条目，它的尾不能把局部结果变成完整前缀。从未写过的会话读不建会话目录。载荷及返回快照是由本包拥有的不可变交换值。core opaque JSON 包装经其公开复制边界接受，领域校验仍归接收者。

## 健康关闭与重开

交接物理所有权前须等待 `close`。关闭先关新准入和旧引用，拒绝未开始的队列项，等待真实写、读及修复任务，关闭所有句柄，最后放根属主锁。不设写、确认或关闭超时。关闭拒绝或仍在等待，都不证明所有权已经交出；宿主期限不能脱离旧文件任务。

```ts
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkAppendInput, openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'

const checked = checkAppendInput('reopen-session', [{
  tenant: { organization: 'example-organization', account: 'example-account' },
  dedupeKey: 'stable', readKeys: ['stable'], payload: ['kept', { original: true }],
}], { kind: 'unfenced' }, { kind: 'unconditional' })
if ('failure' in checked) throw new Error('invalid example input')
// Create once at physical process startup; reuse across every open and fiber.
const processOwnership = {
  current: `example-physical-life:${randomUUID()}`,
  async observeExit(): Promise<'unknown'> { return 'unknown' },
}
const dir = await mkdtemp(join(tmpdir(), 'omne-session-log-reopen-'))
const first = await openJsonlSessionLog({ dir, processOwnership })
try {
  assert.deepEqual(await first.append(checked.ok.session, checked.ok.entries, checked.ok.fence, checked.ok.condition), { positions: [1], tail: 1 })
} finally { await first.close() }
const second = await openJsonlSessionLog({ dir, processOwnership })
try {
  const read = await second.readByKey(checked.ok.session, 'stable')
  if ('failure' in read) throw new Error('read unavailable')
  assert.equal(read.tail, 1)
  assert.equal(read.entries[0]?.position, 1)
  assert.deepEqual(read.entries[0]?.payload, ['kept', { original: true }])
} finally {
  await second.close()
  await rm(dir, { recursive: true, force: true })
}
```

## Cordis 插件

此入口需显式提供 Cordis 4.0.4。插件不 inject 服务、不发业务事件；配置在服务发布前校验。一份属主清理 effect 排空物理提供者，服务注册另由 Cordis 纳管。Cordis 将清理错误写入日志，因此单看 `fiber.dispose()` 已返回，不能证明失败的提供者关闭已经放锁。

```ts
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { checkAppendInput } from '@omne-harness-lite/session-log-jsonl'
import { sessionLogJsonl } from '@omne-harness-lite/session-log-jsonl/plugin'

// Create once at physical process startup; reuse across every open and fiber.
const processOwnership = {
  current: `example-physical-life:${randomUUID()}`,
  async observeExit(): Promise<'unknown'> { return 'unknown' },
}
const dir = await mkdtemp(join(tmpdir(), 'omne-session-log-plugin-'))
const ctx = new Context()
const fiber = await ctx.plugin(sessionLogJsonl, { dir, processOwnership })
try {
  const service = ctx.get('sessionLog')
  if (service === undefined) throw new Error('service unavailable')
  const checked = checkAppendInput('plugin-session', [{
    tenant: { organization: 'example-organization', account: 'example-account' },
    readKeys: [], payload: { plugin: true },
  }], { kind: 'unfenced' }, { kind: 'unconditional' })
  if ('failure' in checked) throw new Error('invalid example input')
  assert.deepEqual(await service.append(checked.ok.session, checked.ok.entries, checked.ok.fence, checked.ok.condition), { positions: [1], tail: 1 })
} finally {
  await fiber.dispose()
  await rm(dir, { recursive: true, force: true })
}
```

## 存储和部署边界

`dir` 必填且为绝对路径。初值是 `appendQueueLimit: 64`、`residentLogsLimit: 256`，均可配置为正整数，不声称初值已经测量为最优。队列上限包含当前追加。常驻表有上界，以空闲 LRU 逐出；全部忙时触碰新日志收 unavailable。可选 `diagnostic` 回调只收受限阶段、计数、会话摘要、恢复来源和 owner 观察状态，不交载荷、裸路径、原始错误、凭据或业务键正文。

`diagnostic(event): void` 是借用的同步输出。回调抛出的异常只在回调边界隔离，不改变已确认追加、遮蔽健康历史、打断恢复或阻止实际清理。真实 IO 和内部缺陷仍保留原失败行为；成功 close 仍要求实际清理完成后才放锁。宿主持有 sink，必须独立记录其输出失败和覆盖缺口（SYS-OBSERVABILITY.C5），包括默认 Cordis logger 的输出故障。本包不把故障递归交回同一个坏 sink、不把诊断变成持久业务记录，也不增加后台重试。这个同步端口未承诺返回 Promise 的异步 sink 的完成或健康；宿主必须拥有其执行和错误处理。

同一根只能有一个物理属主。钉住的 SQLite 句柄排他持有 `.owner-lock`，旁边可能有 SQLite 自己的 journal 文件；SQLite 不存日志业务状态。每个会话使用 SHA-256 目录，含 `entries.jsonl` 、派生 `index.jsonl` 与严格 `recovery.json`（最多一个 `.next` 暂存）。成功在整批 `datasync` 和首次必要目录同步后返回。部署需要 Linux 本地文件系统兑现采用的同步、稳定字节和文件锁前提；进程 kill 测试不是机器断电持久证明，也不是与其他数据库的共同原子持久证明。

健康打开使用派生索引并追补后缀。缺失、结构错误、半截或版本不符的索引从条目重建。索引内容正确仍依赖已采用的同一折叠版本和根不被外部改写前提：结构合法却漏一个判重键的索引可能放入重复条目，专门的 V1 反例展示这条边界。索引写失败只告警，不改变已经确认的整批。

**恢复与迁移：**D085 增加每本日志的耐久 `recovery.json` 门禁。提供者在改写任何业务文件前确认 `active`，仅在实际任务停止、句柄关闭和派生索引安全后写 `clean`。健康 close/LRU 保留原索引打开路径。不可信日志留下 `active`；即使 close 已放锁，同一物理进程重开仍不可用。不同 owner 必须可信确认旧物理进程实际退出，才能从字节 0 全扫恢复。取锁、卸载 fiber、查询 PID 或发出 kill 都不是退出事实。

`processOwnership` 是闭包及插件构造的必填本地生命周期依赖，不是租户配置或日志业务参数。`current` 标识一个实际物理进程的本次生命，提供者捕获不可变值；同进程所有 open 和 fiber 重跑必须相同。`observeExit(owner)` 返回 `exited`、`alive` 或 `unknown`，异常和非法返回按 unknown。示例只在物理进程启动时生成一次身份，对历史 owner 保守返回 unknown，演示健康使用而非生产进程观察器。主管可以保留实际子进程 exit 证据；主管自身重启后无法确认的历史仍是 unknown。生产宿主这项责任 RG-G1 尚未闭合。

旧 writer 的目录没有正式标记，只有可选 `observeLegacyExit(dir)` 能给出全部旧物理写进程退出证据时才迁移；缺席则拒绝。先停旧准入、排空所有写方并确认实际进程退出，再迁移四参数追加调用者、提供新宿主端口、打开旧数据。损坏正式标记保持不可用，不转成 legacy；遗留 `recovery.json.next` 永不作为权威。旧写器不能安全回开新布局。本包不等于完整 model-request-runtime 纵线交付，runtime v3 仍消费 session-log v2。

源码采用关系：[SL3](../../../.meta_harness/design/spec/capabilities/session-log/v3/contract.md)、[D083](../../../.meta_harness/design/record/decisions/session-log-tail-condition-adoption/decision.md)、[D084 投影](../../../.meta_harness/design/realization/packages/session/session-log-jsonl/v3-design.md)、[D085 恢复投影](../../../.meta_harness/design/realization/packages/session/session-log-jsonl/v3-recovery-design.md)。Run 解释、共同业务键 codec、合法读取权限、消费者重试策略和所有旧业务写方的实际停止，仍归各自 owner。

model-data 回归以当前 MS6/MR9 载荷验证追加和重开，包括响应自身的输入计量依据。日志只保存 JSON 值，不解释校准或修补业务非法载荷；这些判断归模型消费者。
