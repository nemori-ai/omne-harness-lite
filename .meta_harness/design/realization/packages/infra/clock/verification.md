# clock 验证与证据

契约侧的证据义务权威在 [`spec/data/offer-expiry/verification.md`](../../../../spec/data/offer-expiry/verification.md)；S-17 五行装配给保证在那里没有可跑的证据形式（offer-expiry 节点 [覆盖缺口](../../core/offer-expiry/verification.md#覆盖缺口)明写）。
本页登记的是**本节点作为「`now` 不后退」承接者自己能证的三条**，加装卸配对。运行结果归 [record/evidence](../../../../record/evidence/README.md)，本页只引用并解释范围。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [S-17](../../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 第 5 行——回拨 | `clock.step-back-fails-boot`：第一个实例以墙钟 `t` 启动并写下 `written_at = t`，第二个实例以墙钟 `t − 5 s` 启动，断言 `start()` 以 `ClockRollbackDetected` 拒绝、实例 `now()` 为 `'unavailable'`（`tests/clock.spec.ts`「回拨 ⇒ start() 抛出」） | 已通过（2026-09-22） | 本节点；依赖 `storage-sql` 的 sqlite 临时文件库作夹具 |
| 同一行——重启后高水位生效 | `clock.restart-respects-lease`：实例 A 运行、返回若干值、**不走撤除直接丢弃**（模拟崩溃）；用同一存储装载实例 B，断言 B 的第一个非 `'unavailable'` 返回值 ≥ A 最后返回值；另一支：A 走撤除后再装 B，断言 B **立即**可服务（租约已收回）。崩溃分支正是「写在后的高水位」会红的地方——返回值未落盘即丢弃 | 未开始 | 本节点 |
| 同一行——写失败（瞬时） | `clock.write-failure-goes-unavailable`：装载后让 `storage.write` 开始抛 `StorageUnavailable`（关闭底层库或注入失败的 storage），断言在 `leaseUntil` 之前 `now()` 仍返回值、越过后返回 `'unavailable'`；恢复存储后一次续约周期内恢复返回值 | 未开始 | 本节点 |
| 同一行——写失败（缺陷） | `clock.write-defect-latches`：让续约写抛 `StorageDefect`（如删掉 `clock_lease` 表），断言 `now()` 立即且永久返回 `'unavailable'`、定时器不再发写、有一条 error 日志 | 未开始 | 本节点 |
| 同一行——进程内单调 | `clock.monotonic-in-process`：紧密循环调用 `now()` N 次，断言非递减；把系统墙钟无关化（`Date.now` 只在锚定时被调一次——用 spy 断言调用次数为 1） | 未开始 | 本节点 |
| 装卸配对（[design.md](design.md#成对的装载与撤除)） | `lifecycle.dispose-reclaims-lease`：撤除后 `clock_lease.lease_until` 等于撤除时刻而不是 `+L`；`lifecycle.dispose-with-inflight-renewal`：续约写在途时撤除，断言定时器已清、写按自己那次提交收场、旧 `impl.now()` 返回 `'unavailable'`；`lifecycle.storage-failure-fails-load`：启动判定那次写失败（两型各一支）⇒ fiber `FAILED`、无 `clock` 服务 | 未开始 | 本节点。「抛出 ⇒ `FAILED` 且不 provide」本身由 kernel-basis probe `plugin-throw-fails-fiber.test.ts` 在 4.0.4 上核过；本节点末条只证本插件在启动写失败时确实抛 |
| 迁移 | `migration.clock-lease-idempotent`：同一迁移跑两次不报错（sqlite 非事务 DDL 的幂等要求） | 未开始 | 本节点 |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 2026-09-22 包内测试 | `packages/infra/clock/tests/clock.spec.ts`（时间源注入：墙钟与单调钟都由测试推，存储是 sqlite 临时文件库 + 本包迁移）与 `tests/plugin.spec.ts`（`bootAssembly` 装 `storage-sql` + `clock`） | 8 条通过 | 终端输出（本行是主线转述，尚未登记 record/evidence run） |

**有限检查不写成无条件证明。** 上面的测试都在一个进程、一个 sqlite 文件库、常量 `L` 取候选值下成立；「回拨」是通过注入墙钟读数模拟的（第二个实例的墙钟小于第一个实例写下的 `written_at`），不是真的调系统时钟。

## 覆盖缺口

- **跨进程的先后**没有证据形式，本版也不承诺（[design.md 并发](design.md#状态并发与失败映射)、投影 Q-8）。
- **租约表被外部删除**导致「不后退」失守，无法在本节点内检测，只能靠运维约定；无证据形式。owner：装配。
- **与真实时间的偏差**不在承诺内，无义务。
- **本节点自己的测试全部未开始**；它们依赖的内核语义（basis 三条、kernel-basis 两条 probe）已在 4.0.4 上通过，不再是缺口。
- 与 [bindings.yaml](bindings.yaml) 一致：空表。
