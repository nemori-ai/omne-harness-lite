# clock 验证与证据

契约侧的证据义务权威在 [`spec/data/offer-expiry/verification.md`](../../../../spec/data/offer-expiry/verification.md)；S-17 五行装配给保证在那里没有可跑的证据形式（offer-expiry 节点 [覆盖缺口](../../core/offer-expiry/verification.md#覆盖缺口)明写）。
本页登记的是**本节点作为「`now` 不后退」承接者自己能证的几条**，入口契约（`candidate`）经 tenancy-host 转交的运行中回拨、不自撤与启动窗口，tenancy-host 要的迁移前核对，加装卸配对。运行结果归 [record/evidence](../../../../record/evidence/README.md)，本页只引用并解释范围。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [S-17](../../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 第 5 行——回拨 | `clock.step-back-fails-boot`：第一个实例以墙钟 `t` 启动并写下 `written_at = t`，第二个实例以墙钟 `t − 5 s` 启动，断言 `start()` 以 `ClockRollbackDetected` 拒绝、实例 `now()` 为 `'unavailable'`（`tests/clock.spec.ts`「回拨 ⇒ start() 抛出」） | **已通过**（run `2026-09-23-tests-tenancy-leg-2`）：`clock.spec.ts` › `LeaseClock` › `clock.step-back-fails-boot…`；此前 2026-09-22 的「已通过」是终端转述 | 本节点；依赖 `storage-sql` 的 sqlite 临时文件库作夹具 |
| 同一行——重启后高水位生效 | `clock.restart-respects-lease`：实例 A 运行、返回若干值、**不走撤除直接丢弃**（模拟崩溃）；用同一存储装载实例 B，断言 B 的第一个非 `'unavailable'` 返回值 ≥ A 最后返回值；另一支：A 走撤除后再装 B，断言 B **立即**可服务（租约已收回）。崩溃分支正是「写在后的高水位」会红的地方——返回值未落盘即丢弃 | **已通过**（同 run）：`clock.spec.ts` › `LeaseClock` › `clock.restart-respects-lease…` | 本节点 |
| 同一行——写失败（瞬时） | `clock.write-failure-goes-unavailable`：装载后让 `storage.write` 开始抛 `StorageUnavailable`（关闭底层库或注入失败的 storage），断言在 `leaseUntil` 之前 `now()` 仍返回值、越过后返回 `'unavailable'`；恢复存储后一次续约周期内恢复返回值 | **已通过**（同 run）：`clock.spec.ts` › `LeaseClock` › `clock.write-failure-goes-unavailable…` | 本节点 |
| 同一行——写失败（缺陷） | `clock.write-defect-latches`：让续约写抛 `StorageDefect`（如删掉 `clock_lease` 表），断言 `now()` 立即且永久返回 `'unavailable'`、定时器不再发写、有一条 error 日志 | **已通过**（同 run）：`clock.spec.ts` › `LeaseClock` › `clock.write-defect-latches…` | 本节点 |
| 同一行——进程内不后退 | `clock.monotonic-in-process`：注入的墙钟前进、原地、后退各一段，紧密循环调用 `now()`，断言返回值（去掉 `'unavailable'`）非递减、且每个返回值都等于当时的墙钟读数——后一条在「按单调钟推算」的实现上会红 | **已通过**（同 run）：`clock.spec.ts` › `LeaseClock` › `clock.monotonic-in-process：墙钟前进、原地、后退各一段——返回值非递减，且每个都等于当时的墙钟读数`（已按修订后的形式重写） | 本节点 |
| [入口契约 S-36](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) 末行——运行中回拨 | `clock.running-rollback-unavailable-until-caught-up`：服务中把注入的墙钟调回 5 s ⇒ 下一次 `now()` 即 `'unavailable'`（零延迟，不等续约周期）；墙钟前推到回拨前最后返回值之前一毫秒仍 `'unavailable'`，到达它即恢复返回；进入与离开各一条结构化记录；这段时间里续约写不改小 `written_at`（读行断言）。**在按单调钟推算的实现上会红**（它照常返回） | **已通过**（同 run）：`clock.spec.ts` › `LeaseClock` › `clock.running-rollback-unavailable-until-caught-up…` | 本节点；消费者侧 `clockSane = false` 归 governance-center-entry 的 T-9 类测试 |
| 同上——运行中回拨之后重启 | `clock.rollback-then-restart`：服务中回拨、随即不走撤除丢弃实例、同一存储装新实例 ⇒ 新实例要么启动失败（确定回拨），要么在窗口里答 `'unavailable'` 直到墙钟追上旧 `lease_until`；另一支走撤除 ⇒ 撤除写的是 `max(hw, w)`，新实例以回拨后的墙钟启动即确定回拨 | **已通过**（同 run）：`clock.spec.ts` › `LeaseClock` › `clock.rollback-then-restart…` | 本节点 |
| 同上——墙钟向前跳 | `clock.forward-jump-bounded`：服务中墙钟前跳 1 min ⇒ `now()` 答 `'unavailable'` 至多一个续约周期，续约成功后返回新的墙钟读数（不是旧推算值）；另一支：前跳且至少续约一次之后再调回 ⇒ 答 `'unavailable'` 恰到墙钟追上前跳期间最后的返回值，其间丢弃实例、同一存储装新实例 ⇒ 启动判确定回拨（代价表「前跳后被校正回来」那一行） | **已通过**（同 run）：`clock.spec.ts` › `LeaseClock` › `clock.forward-jump-bounded…` | 本节点；代价行（[design.md 代价表](design.md#运行中回拨每次现读墙钟比对用过的最晚时刻)）的证据 |
| 入口契约 S-34「时钟不可用只表现为返回值」 | `clock.no-self-dispose`：经 `bootAssembly` 装 `storage-sql` + `clock`，依次制造运行中回拨、续约写失败、续约写缺陷（闩住）——每一种之后 `clock` fiber 仍 `ACTIVE`、服务仍解析得到，只是 `now()` 答 `'unavailable'` | **已通过**（同 run）：`plugin.spec.ts` › `clock.no-self-dispose：运行期的不可用只是返回值…`（3 条：运行中回拨、续约写失败、续约写缺陷） | 本节点 |
| 入口契约 S-34「启动成功以钟可读为条件」 | `clock.startup-window-bounded`：上一实例续约后崩溃，新实例以墙钟 = `written_at` 启动（最坏情形）⇒ `now()` 答 `'unavailable'` 恰到墙钟 = 旧 `lease_until` 为止（= `LEASE_WIDTH_MS`），之后可读；以墙钟 = `written_at` + 3 s 启动 ⇒ 等 L − 3 s。入口层以 `clockReadyTimeoutMs` 等钟的那一半归 governance-center-entry 与 tenancy-host | **已通过**（同 run）：`clock.spec.ts` › `LeaseClock` › `clock.startup-window-bounded…`；等钟那一半见 governance-center-entry T-18 与 tenancy-host `assembly.clock-ready-timeout` | 本节点 |
| tenancy-host R-U1 的时钟那一条 | `clock.preflight-readonly`：`tables` 不含 `clock_lease` ⇒ 通过；有表无行 ⇒ 通过；`written_at` 在墙钟之后 ⇒ `ok: false`、`check` 为回拨、`detail` 含两个时刻；三支都断言没有任何写（行与表不变）；与 `start()` 判定一致（同一组输入下 `start()` 抛出 ⇔ 核对不过） | **已通过**（同 run）：`preflight.spec.ts` › `clock.preflight-readonly`（5 条，含放进 storage-sql `upgrade.checks` 那一条） | 本节点；装进 storage-sql `upgrade.checks` 的那一半归 tenancy-host `assembly.upgrade-preflight-refuses` ② |
| 装卸配对（[design.md](design.md#成对的装载与撤除)） | `lifecycle.dispose-reclaims-lease`：撤除后 `clock_lease.lease_until` 与 `written_at` 都等于 `max(hw, 撤除时墙钟)` 而不是 `+L`（墙钟正落后时等于 `hw`）；`lifecycle.dispose-with-inflight-renewal`：续约写在途时撤除，断言定时器已清、写按自己那次提交收场、旧 `impl.now()` 返回 `'unavailable'`；`lifecycle.storage-failure-fails-load`：启动判定那次写失败（两型各一支）⇒ fiber `FAILED`、无 `clock` 服务 | **已通过**（同 run）：`clock.spec.ts` › `LeaseClock · 装卸` › `lifecycle.dispose-reclaims-lease…`、`lifecycle.dispose-with-inflight-renewal…`；`plugin.spec.ts` › `clock 插件` › `lifecycle.storage-failure-fails-load（缺陷支）…`、`（不可用支）…` | 本节点。「抛出 ⇒ `FAILED` 且不 provide」本身由 kernel-basis probe `plugin-throw-fails-fiber.test.ts` 在 4.0.4 上核过；本节点末条只证本插件在启动写失败时确实抛 |
| 迁移 | `migration.clock-lease-idempotent`：同一迁移跑两次不报错（sqlite 非事务 DDL 的幂等要求） | **已通过**（同 run）：`clock.spec.ts` › `migration.clock-lease-idempotent` › `同一迁移跑两次不报错…` | 本节点 |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 2026-09-22 包内测试 | `packages/infra/clock/tests/clock.spec.ts`（时间源注入：墙钟与单调钟都由测试推，存储是 sqlite 临时文件库 + 本包迁移）与 `tests/plugin.spec.ts`（`bootAssembly` 装 `storage-sql` + `clock`） | 8 条通过 | 终端输出（本行是主线转述，尚未登记 record/evidence run） |
| [`2026-09-23-tests-tenancy-leg-2`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md) | 源码提交 `c9b5850`；`tests/clock.spec.ts`（`LeaseClock` 直接构造，墙钟与单调钟都由测试注入，存储是 sqlite 临时文件库 + 本包迁移、`upgrade: false`）、`tests/plugin.spec.ts`（`bootAssembly` 装 `storage-sql` + `clock`）、`tests/preflight.spec.ts`（只读核对，含放进 storage-sql `upgrade.checks` 的一支）；Node v24.18.0、vitest 4.1.11，单进程 | build、typecheck 退出 0；25 条用例 **25 通过**、0 跳过、0 失败 | [`output/clock.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/clock.log)、[`json/clock.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json/clock.json)；义务对应 [`coverage.md`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/coverage.md#packagesinfraclock) |

**有限检查不写成无条件证明。** 上面的测试都在一个进程、一个 sqlite 文件库、常量 `L` 取候选值下成立；「回拨」「前跳」是通过注入墙钟读数模拟的，不是真的调系统时钟；「崩溃」是不走撤除直接丢弃实例，不是进程被杀或断电。真实 clock 插件与装配的组合在 `apps/tenancy-host` 那边另有用例（`lifecycle.spec.ts` › `真实 clock 插件的组合…`、`slow.spec.ts` 按真实租约宽度跑的几条），那是装配的证据。**通过不提升本节点的任何接受状态。**

## 覆盖缺口

按上面这次 run 的对应清单，义务表每一行都有通过的承担者；本节点还缺的是没有证据形式的几件：

- **跨进程的先后**没有证据形式，本版也不承诺（[design.md 并发](design.md#状态并发与失败映射)、投影 Q-8）。
- **租约表被外部删除**导致「不后退」失守，无法在本节点内检测，只能靠运维约定；无证据形式。owner：装配。
- **操作系统崩溃或断电之后的不后退**不承诺（[D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md)），无证据义务；窗口的量级（检查点才落盘、默认 1000 页、操作系统回写延迟）是待取证的假设，见 [design.md R-C2](design.md#对存储提供者的要求清单)。包内测试只模拟进程崩溃（丢弃实例），证不到这一层。
- **与真实时间的偏差**不在承诺内，无义务。
- **两条平台假设**（校时步进阈值、休眠恢复后计时器到期）只影响代价表的量级，没有证据形式；`clock.forward-jump-bounded` 用注入的墙钟模拟，不证真实休眠。
- 与 [bindings.yaml](bindings.yaml) 一致：本节点承接的三处「装配给」条款各有 `test:` 绑定，前提写在各条 `assumptions` 里。
