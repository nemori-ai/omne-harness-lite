# @omne-harness-lite/clock

[English](README.md)

供必须使用同一时间源的操作使用的统一时钟服务。通过 `Clock.now(): Instant | 'unavailable'` 返回 Unix epoch 毫秒，先持久化租约，再返回租约范围内的时刻。墙钟回拨时返回 `'unavailable'`，直到墙钟追上，而不返回更小的时刻。

本包当前是私有、尚未发布的 ESM workspace 成员。构建检出后，从 workspace 消费者通过公开包名导入；目前没有可用的 npm 发布版本。Node 与 pnpm 工具链见[开发指南](../../../docs/development.md)。提供者使用共享[存储协议](../../core/storage/README.md)；示例使用 [storage-sql](../storage-sql/README.md) 和可丢弃的 SQLite 文件。

## 公开 API

| 用途           | 导出                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| 直接提供者     | `LeaseClock`, `LeaseClockOptions`, `ClockLogger`                                         |
| 时间源注入     | `TimeSources`, `systemTimeSources`                                                       |
| 启动回拨检测   | `ClockRollbackDetected`, `isRolledBack`                                                  |
| 本包拥有的结构 | `clockMigrations`, `clockLeaseMigration`, `CLOCK_LEASE_TABLE`, `ClockLeaseTable`         |
| 租约设置       | `LEASE_WIDTH_MS` (10,000), `RENEW_PERIOD_MS` (3,333)                                     |
| Cordis 接入    | `clockPlugin`, `ClockConfig`, `CLOCK_SERVICE` (`'clock'`)                                |
| 只读核对       | `clockPreflight`, `CLOCK_PREFLIGHT_CHECK`, `clockSnapshotCheck`, `CLOCK_SNAPSHOT_TABLES` |

## 使用提供者与可控时间源

这个例子运行真实 SQLite 存储，并控制时间读数，以展示默认系统时间源使用的同一条回拨路径。`upgrade: false` 用于这份可丢弃夹具；生产存储应使用属主升级守卫。

```ts
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LeaseClock, clockMigrations, type TimeSources } from '@omne-harness-lite/clock'
import { composeMigrations } from '@omne-harness-lite/storage'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'

const directory = await mkdtemp(join(tmpdir(), 'omne-clock-example-'))
let storage: SqlStorage | undefined
let clock: LeaseClock | undefined
let wall = 1_900_000_000_000
const sources: TimeSources = { wall: () => wall, monotonic: () => 0n }
try {
  storage = await openStorage({
    dialect: 'sqlite',
    file: join(directory, 'clock.sqlite'),
    migrations: composeMigrations(clockMigrations),
    upgrade: false,
  })
  clock = new LeaseClock({ storage, sources })
  assert.equal(clock.now(), 'unavailable')
  await clock.start()
  assert.equal(clock.now(), wall)
  wall -= 100
  assert.equal(clock.now(), 'unavailable')
  wall += 100
  assert.equal(clock.now(), wall)
  console.log(clock.now())
} finally {
  await clock?.close()
  await storage?.close()
  await rm(directory, { recursive: true, force: true })
}
```

直接使用 `LeaseClock` 时，调用者拥有 `start()` 和 `close()` 生命周期。先关时钟，再关存储：关闭会清掉续约定时器，等待定时续约，并尝试收回它最后写入的租约；不会关闭传入的存储。每个实例只使用一轮启动/关闭生命周期，手工调用 `renew()` 时应在关闭前等待它完成。

## 通过 Cordis 提供时钟

将时钟迁移与应用迁移合并，先加载存储，再加载时钟。例子使用已采用的 Cordis 4.0.4 生命周期 API，明确先撤时钟，再撤存储。

```ts
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { CLOCK_SERVICE, clockMigrations, clockPlugin } from '@omne-harness-lite/clock'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { composeMigrations } from '@omne-harness-lite/storage'
import { createUpgradeGuard, storageSqlPlugin } from '@omne-harness-lite/storage-sql'

const directory = await mkdtemp(join(tmpdir(), 'omne-clock-plugin-example-'))
const ctx = new Context()
const guard = createUpgradeGuard()
let storageFiber: Fiber | undefined
let clockFiber: Fiber | undefined
try {
  storageFiber = ctx.plugin(storageSqlPlugin, {
    dialect: 'sqlite',
    file: join(directory, 'clock.sqlite'),
    migrations: composeMigrations(clockMigrations),
    upgrade: { checks: [], guard },
  })
  await storageFiber
  clockFiber = ctx.plugin(clockPlugin, {})
  await clockFiber
  const clock = ctx.get(CLOCK_SERVICE) as Clock | undefined
  assert.ok(clock)
  const now = clock.now()
  assert.notEqual(now, 'unavailable')
  const confirmation = await guard.confirm()
  assert.ok(!confirmation.snapshotTaken || confirmation.snapshotRemoved)
  console.log(now)
} finally {
  await clockFiber?.dispose()
  await storageFiber?.dispose()
  // Cordis logs disposer failures; retain the fixture if recovery is pending.
  assert.equal(await guard.pending(), 'clear')
  await rm(directory, { recursive: true, force: true })
}
```

`clockPlugin` 必需依赖 `storage` 服务，只在启动成功后提供 `clock`。存储缺席时 fiber 保持 pending；启动异常使加载失败。提供者替换时 Cordis 撤除并重载依赖插件。运行期间，`'unavailable'` 是时钟返回值，不会移除服务或撤除插件。撤除插件会移除其提供的服务，保留的旧引用返回 `'unavailable'`。

## 可用性与持久化边界

每次 `now()` 都现读墙钟。单个运行实例的成功读数不会递减，也不会超过它确知已持久化的租约。`monotonic` 仍是 `TimeSources` 的注入字段，但当前实现不用它推算时刻。`systemTimeSources` 读取环境，不保证环境墙钟准确。

启动时，墙钟读数早于持久化的 `written_at` 会抛 `ClockRollbackDetected`。进程非正常重启后，时钟可能保持不可用，直到墙钟追上旧租约，通常最多等待租约宽度。墙钟前跳超过租约时，在续约前不可用；随后校正回退可能导致长得多的等待。

定时续约失败通过 `logger` 和 `onRenewFailure` 报告。暂时存储失败可能耗尽租约；`StorageDefect` 会将时钟闩为不可用并停掉定时器。显式 `renew()` 失败直接拒绝给调用者。关闭时收回租约失败通过同一诊断面报告。调用者须按操作的失败政策处理 `'unavailable'`，并让发出和过期判定使用同一时钟。

重启保证依赖持久化租约确实存活。SQLite 默认 `synchronous: 'normal'` 不承诺最近提交在 OS 崩溃或断电后仍存活。`full` 只有在存储栈兑现同步请求时才强化持久性；物理断电行为未验证。本提供者不提供真实时间准确度上界，也不提供独立运行时钟实例或分布式节点间的顺序保证。它拥有一行存储级租约，没有租户专属时钟身份；租户隔离与消费者政策归应用。

`clockPreflight()` 提供迁移启动前的只读核对：表或行缺席通过，确定回拨拒绝。`clockSnapshotCheck` 检查 SQLite 快照的时钟表和持久化下界，不授权应用从快照重新开放。

开发本包时运行该成员的 `build`、`typecheck` 和 `test` 脚本。本版租约时间固定，`ClockConfig` 只接受 `{}`。
