# 回填清单：各节点「证据义务」逐行 → 本 run 的承担者

给主线回填 `bindings.yaml` 与各 `verification.md`「实际执行」用。**本页只做对应，不判断义务本身是否合理，也不判断承担者是否完整兑现了那一行**。

读法：

- **承担者**写成「文件 › describe › it」；同一 describe 下全部用例都相关时只写到 describe，并注明条数。未注明方言的都是 **sqlite 一侧**；标 **（pg）** 的在 pg 一侧。
  文件路径相对仓库根；同一节点内的文件省略公共前缀，前缀写在该节标题下。
- 只登记**本 run 跑过且通过**的用例（逐条状态见 [`cases.tsv`](cases.tsv)）。本 run 跳过的写「**跳过**（原因）」；找不到承担者的写「**无**」。
- 一行义务里点名了几件事、而只有其中几件找得到同名用例时，在「对应说明」里**列出找得到的与找不到的**，不下「够不够」的结论。
- 静态检查的承担者分两半：`tools/ts-checks/tests/` 里那条规则的「故意违反就失败」自测（本 run 通过），与 `pnpm run lint:rules` 在真实源码上的扫描（本 run `PASS`，20 条规则、扫 `packages/` 与 `apps/`，[原文](output/_lint-rules.log)）。
- 形式工件行：模型检查不是本 run 的内容，写出对应的形式 run 目录。

---

## `packages/core/identity-values`

测试前缀 `packages/core/identity-values/tests/`；义务表：[verification.md](../../../realization/packages/core/identity-values/verification.md#证据义务)。

| 义务行 | 承担者 | 对应说明 |
|---|---|---|
| V-1 形状校验（`examples.md` 第 1～11 节正反实例 ＋ Schema 副本逐字节） | `schema.spec.ts` › `V-1：examples.md 第 1～11 节的正反实例`（173 条）；`schema.spec.ts` › `Schema 副本`（2 条） | 副本逐字节另有本 run 的[独立核对](README.md#二入口契约-schema三份副本与-examplesmd-的样例)（`1d1f5743…`） |
| S-5／S-7／S-13 值判定 | `values.spec.ts` › `TenantId（S-5 / S-7）`（4 条）、`sameAccountDistinctTenants（S-13）`（2 条） | — |
| S-14／S-15 定义式（含「一个组织与它自己的上级」） | `predicates.spec.ts` › `ancestorChain（S-14）`（4 条）、`shareAncestor（S-15）`（5 条，含 `祖先与后代为真——曾经的反例「一个组织与它自己的上级」`） | 「对着 `Affiliation.als` 逐字核对」是人工对照，没有用例 |
| S-35 本模块能证的三条性质（四类反例） | `handoff-warrant.spec.ts` › `交接凭证（S-35）`（9 条：正例、反例 1～6、非规范 base64url、重放） | — |
| V-2 静态检查 SC-1／SC-2／SC-9 的规则 | **无** | `tools/ts-checks` 的 20 条规则里没有这三条。义务行里提到的 SC-3「编译期挡」一形：`types.spec-d.ts` › `编译期挡住的条款` › `S-2：登录标识与 AccountId 类型不相容` |

## `packages/core/offer-expiry`

测试前缀 `packages/core/offer-expiry/tests/`；义务表：[verification.md](../../../realization/packages/core/offer-expiry/verification.md#证据义务)。

| 义务行 | 承担者 | 对应说明 |
|---|---|---|
| S-8 判定式与求值次序 | `derive.spec.ts` › `deriveState（S-8 判定式与求值次序）` › `终结记录优先…`、`严格不等号…`、`指向对象不存在 ⇒ expired…` | — |
| S-20 不可用 ≠ 不存在 | `derive.spec.ts` › `deriveState（S-8 …）` › `S-20：now 或 target 不可用 ⇒ unavailable…`、`S-20 与终结记录的次序…` | 消费者侧的故障注入见 organization-governance 节 |
| S-13 三值同一个 `false` | `derive.spec.ts` › `acceptable（S-13）` › `pending 为真；三种来路同一个 false` | — |
| S-4／S-14 `timingFrom`／`parseOfferTtl` | `derive.spec.ts` › `timingFrom / parseOfferTtl（S-4 / S-14）`（4 条） | — |
| S-22 形状（副本逐字节 ＋ 正反实例） | `schema.spec.ts` › `Schema 副本` › `与 spec 目录的规范工件逐字节相同`；`schema.spec.ts` › `Schema 自带的 examples 与 x-counterexamples 逐条核对`（10 条）；`time.spec.ts`（6 条） | 副本逐字节另有本 run 的独立核对（`63a8ccb4…`） |
| SC-OE-1～3 三条 lint 规则 | SC-OE-1：`tools/ts-checks/tests/consumer-rules.spec.ts` › `sc-oe-1`（3 条）；SC-OE-2：同文件 › `sc-oe-2`（3 条）；SC-OE-3：`tools/ts-checks/tests/rules.spec.ts` › `no-wall-clock`（1 条）；三条规则都在 `lint:rules` 里 | `no-wall-clock` 的自测用例名只点名 `Date.now()`；义务里的 `new Date()`、`performance.now` 没有同名用例 |

## `packages/core/storage`

测试前缀 `packages/core/storage/tests/`（协议与错误）；一致性套件由 `infra/storage-sql` 在两种方言上跑，文件 `packages/infra/storage-sql/tests/conformance.{sqlite,postgres}.spec.ts`，describe 分别是 `storage conformance · sqlite (node:sqlite)` 与 `storage conformance · postgres`。义务表：[verification.md](../../../realization/packages/core/storage/verification.md#证据义务)。

| 义务行 | 承担者 | 对应说明 |
|---|---|---|
| AI R-1／OG R-1（C-1a/C-1b/C-1c） | 套件 › `C-1a/C-1b 单次提交原子…`、`C-1c 正常返回 ⇒ 提交…`（sqlite；**pg** 同名） | — |
| AI R-2／OG R-2（C-2） | 套件 › `C-2 唯一冲突 ⇒ UniqueViolation…`、`C-2b 主键冲突…`（sqlite；**pg**） | — |
| 提交内重读（C-3） | 套件 › `C-3 语句级失败不废事务…`（sqlite；**pg**） | — |
| 空行并发创建（C-13） | 套件 › `C-13 两个并发创建者…`（sqlite；**pg**） | — |
| 行锁（C-4） | 套件 › `C-4 lockRow：两个实例并发读-让出-写…`（sqlite；**pg**） | — |
| 哨兵（C-5） | 套件 › `C-5 lockSentinel…`（sqlite；**pg**） | — |
| 提交内读写同源（C-6a/C-6b） | 套件 › `C-6a/C-6b 提交内读写同源…`（sqlite；**pg**） | — |
| 只读快照（C-7） | 套件 › `C-7 只读事务快照一致…`（sqlite；**pg**） | — |
| 持久（C-8） | 套件 › `C-8 持久：写入 → 关闭句柄 → 新实例读到`（sqlite；**pg**） | 跨进程重启归 AI S-32，见 account-identity 节 |
| 不可用可识别（C-9a/C-9b） | 套件 › `C-9a 关闭后 read/write ⇒ StorageUnavailable`、`C-9b 在途写事务期间从另一异步任务 close…`（sqlite；**pg**） | — |
| 缺陷那一半（C-7b、C-14、嵌套调用） | 套件 › `C-7b 只读事务里写 ⇒ StorageDefect…`、`C-14 缺陷不折成不可用…`、`C-15 嵌套调用 ⇒ StorageDefect…`（sqlite；**pg**） | 义务行说「嵌套调用无用例、本节点补」：套件里现有 `C-15` |
| AI R-6（C-10） | 套件 › `C-10 删除即释放…`（sqlite；**pg**） | — |
| 删除受限向（C-11） | 套件 › `C-11 删除被引用的父行 ⇒ ReferenceViolation delete-restricted…`（sqlite；**pg**） | 义务行要求「`foreign_keys` 关着时红」的负向运行：套件里没有；装配一侧有 `apps/tenancy-host/tests/migrations.spec.ts` › `assembly.fk-organization-owner-account…` 的 ③ 负向运行 |
| 缺失目标向（C-12） | 套件 › `C-12 插入指向不存在目标 ⇒ ReferenceViolation missing-target`（sqlite；**pg**） | — |
| P-12 进程内并发不互卡 | 由 C-4／C-5／C-13 覆盖（义务行原文如此），同上 | — |
| `mapStorageError` 只折 `StorageUnavailable` | `errors.spec.ts` › `mapStorageError 只折 StorageUnavailable`（3 条） | — |
| 协议面形状 | `types.spec-d.ts` › `storage 协议类型`（2 条）；另 `MigrationFragment 与 PreflightCheck 的形状`（2 条） | — |
| 套件自身「对故意做错的提供者会红」 | **无** | 没有找到把 `lockRow` 换成空操作之类的自测用例 |

## `packages/core/kernel-basis`

测试前缀 `packages/core/kernel-basis/tests/`；义务表：[verification.md](../../../realization/packages/core/kernel-basis/verification.md#证据义务)。

| 义务行 | 承担者 | 对应说明 |
|---|---|---|
| basis `isolate-hides-instances-not-data` | `basis/isolate-hides-instances-not-data.test.ts`（2 条） | 义务行自述「子 isolate 解析父标签服务抛错不回退」未断言；本 run 没有同名用例 |
| basis `async-control-not-bail` | `basis/async-control-not-bail.test.ts`（2 条） | — |
| basis `plugin-body-reruns-on-provider-change` | `basis/plugin-body-reruns-on-provider-change.test.ts`（1 条） | — |
| basis `effect-disposal-concurrent-not-ordered` | `basis/effect-disposal-concurrent-not-ordered.test.ts`（4 条） | — |
| `inject` 无可选形式 | `basis/inject-has-no-optional-form.test.ts`（2 条） | — |
| `ctx.provide` 经 effect 纳管 | `basis/provide-is-effect-managed.test.ts`（2 条） | — |
| 插件体或 config 抛出 ⇒ `FAILED` | `basis/plugin-throw-fails-fiber.test.ts`（3 条） | — |
| `ctx.fiber.state` 与 `FIBER_STATE` 镜像 | `basis/fiber-state-readable.test.ts` › `镜像数值与真实状态一致` | 义务行自述 `UNLOADING` 未观察到；本 run 没有同名用例 |
| `Outcome` 一族 | `testing.spec.ts` › `Outcome` › `成功与失败形状互斥` | — |
| `bootAssembly` 装卸配对 | `testing.spec.ts` › `bootAssembly`（2 条）、`bootAssembly · 清单错误`（1 条）、`bootAssembly · 部分失败先撤已装的`（1 条） | — |
| `./testing` 不被产品代码依赖 | `tools/ts-checks/tests/rules.spec.ts` › `no-testing-import` › `产品源码 import ./testing ⇒ 报出；测试文件豁免`；`lint:rules` 扫 `packages/` 与 `apps/` | — |

本 run 另有两个不对应义务行的 basis 探针：`basis/emit-listener-throw-propagates.test.ts`（2 条）、`basis/logger-level-order-error-lowest.test.ts`（3 条），均通过。

## `packages/infra/storage-sql`

测试前缀 `packages/infra/storage-sql/tests/`；「套件」即上节的一致性套件。义务表：[verification.md](../../../realization/packages/infra/storage-sql/verification.md#证据义务)。

| 义务行 | 承担者 | 对应说明 |
|---|---|---|
| P-1（C-1a/b/c） | 套件 C-1a/C-1b、C-1c（sqlite；**pg**） | — |
| P-11（C-2，含主键那一支） | 套件 C-2、C-2b（sqlite；**pg**） | 「迁移未命名 ⇒ `StorageDefect`」没有同名用例；装配一侧 `apps/tenancy-host/tests/migrations.spec.ts` › `assembly.constraint-names-resolve…` |
| P-2（C-3、C-13；pg 分支） | 套件 C-3、C-13（sqlite；**pg**） | 义务行写「pg 分支本程 skip」：本 run pg 一侧已跑 |
| P-4（C-4） | 套件 C-4（sqlite；**pg**） | — |
| P-5（C-5） | 套件 C-5（sqlite；**pg**） | — |
| P-3（C-6a/C-6b） | 套件 C-6a/C-6b（sqlite；**pg**） | — |
| P-6（C-7、C-7b） | 套件 C-7、C-7b（sqlite；**pg**） | — |
| P-7（C-8） | 套件 C-8（sqlite；**pg**） | — |
| P-8（C-9a、C-9b、缺陷不折成不可用） | 套件 C-9a、C-9b、C-14（sqlite；**pg**） | — |
| P-9（C-10） | 套件 C-10（sqlite；**pg**） | — |
| P-10（C-11、C-12） | 套件 C-11、C-12（sqlite；**pg**） | 同 core/storage 节 C-11 的说明 |
| P-12（C-4／C-7 并发分支） | 套件 C-4、C-7（sqlite；**pg**） | — |
| 方言切换 `dialect-switch` | **（pg）** `conformance.postgres.spec.ts` › `storage conformance · postgres`（19 条，同一套件）；`plugin.spec.ts` › `storage-sql 插件` › `方言切换只改配置：postgres 配置形状被接受（不连接）` | sqlite 一侧的 pg 占位**跳过**（缺 `OMNE_TEST_PG_URL`） |
| 错误码映射 `error-mapping.{sqlite,defect,postgres,cause}` | **无**（没有这四个名字的用例） | 相关断言散在套件 C-2／C-2b／C-11／C-12／C-14（类型、`kind`、`constraint`、`cause`）；「忙（异步重试超时）」「写句柄上 `SQLITE_READONLY` 仍是 `StorageUnavailable`」「用构造的 pg 错误对象测映射函数」没有找到同名用例 |
| `driver.transaction-kind` | **无** | — |
| `driver.busy-retry-yields` | **无** | 义务行自述「这条是 C-4 的机制级细化」；C-4 见上 |
| `driver.pg-savepoint` | **无** | — |
| 装卸配对 `lifecycle.dispose-drains`／`config-error-fails-load`／`open-failure-fails-load` | `plugin.spec.ts` › `storage-sql 插件` › `配置合法 ⇒ 迁移先跑、再 provide storage；撤除后 storage 不可用`、`:memory: 被拒 ⇒ 启动失败` | `lifecycle.dispose-drains`（在途写事务未完成时 dispose）与 `lifecycle.open-failure-fails-load`（文件不可写）没有同名用例 |
| 迁移在 `provide` 之前 | `plugin.spec.ts` › `storage-sql 插件` › `配置合法 ⇒ 迁移先跑、再 provide storage…`、`迁移失败 ⇒ 启动失败，不 provide` | — |
| 属主排他 `upgrade.exclusive-owner` | `upgrade.process.spec.ts` › `upgrade.exclusive-owner`（2 条，子进程） | — |
| R-U1 `upgrade.preflight-refuses-before-write` | `upgrade.spec.ts` › `upgrade.preflight-refuses-before-write`（4 条） | — |
| R-U2 `upgrade.registry-read` | `upgrade.spec.ts` › `upgrade.registry-read`（3 条）；另 `upgrade.registry-beyond-known`（1 条） | — |
| R-U3 `upgrade.snapshot-consistent` | `upgrade.spec.ts` › `upgrade.snapshot-consistent`（2 条） | — |
| R-U4 `upgrade.restore-on-migration-failure`／`restore-on-dispose` | `upgrade.spec.ts` › `upgrade.restore-on-migration-failure`（1 条）、`upgrade.restore-on-dispose`（2 条） | — |
| R-U5 `upgrade.leftover-restored` | `upgrade.process.spec.ts` › `upgrade.leftover-restored：真崩溃之后下一次启动先恢复`（2 条，子进程） | — |
| R-U6 `upgrade.confirm` | `upgrade.spec.ts` › `upgrade.confirm`（5 条）；pg 支 **（pg）** `upgrade.postgres.spec.ts` › `upgrade.confirm（pg 支）…` | pg 支在 sqlite 一侧**跳过**（缺 pg URL） |
| R-U6 `upgrade.guard-binding` | `upgrade.plugin.spec.ts` › `upgrade.guard-binding（交错 f；A-1 取证）`（7 条）；`upgrade.spec.ts` › `守卫的附着规则（直接打开）`（3 条） | — |
| R-U7 `upgrade.pg-single-transaction` | **（pg）** `upgrade.postgres.spec.ts` › `upgrade.pg-single-transaction…` | sqlite 一侧**跳过**（缺 pg URL） |
| R-U8 `upgrade.named-failures`／`dispose-restore-failure-visible` | `upgrade.spec.ts` › `upgrade.named-failures：五个阶段各触发一次`（5 条）；`upgrade.plugin.spec.ts` › `upgrade.dispose-restore-failure-visible`（1 条） | — |
| `lifecycle.upgrade-config-policy` | `plugin.spec.ts` › `lifecycle.upgrade-config-policy：带迁移时 upgrade 必须显式给出`（5 条） | — |

本 run 另有义务表之外的一条 pg 用例：**（pg）** `upgrade.postgres.spec.ts` › `upgrade.pg-close-once`（通过）。

## `packages/infra/clock`

测试前缀 `packages/infra/clock/tests/`；义务表：[verification.md](../../../realization/packages/infra/clock/verification.md#证据义务)。

| 义务行 | 承担者 | 对应说明 |
|---|---|---|
| `clock.step-back-fails-boot` | `clock.spec.ts` › `LeaseClock` › `clock.step-back-fails-boot…` | — |
| `clock.restart-respects-lease` | `clock.spec.ts` › `LeaseClock` › `clock.restart-respects-lease…` | — |
| `clock.write-failure-goes-unavailable` | `clock.spec.ts` › `LeaseClock` › `clock.write-failure-goes-unavailable…` | — |
| `clock.write-defect-latches` | `clock.spec.ts` › `LeaseClock` › `clock.write-defect-latches…` | — |
| `clock.monotonic-in-process` | `clock.spec.ts` › `LeaseClock` › `clock.monotonic-in-process…` | — |
| `clock.running-rollback-unavailable-until-caught-up` | `clock.spec.ts` › `LeaseClock` › 同名 | — |
| `clock.rollback-then-restart` | `clock.spec.ts` › `LeaseClock` › 同名 | — |
| `clock.forward-jump-bounded` | `clock.spec.ts` › `LeaseClock` › 同名 | — |
| `clock.no-self-dispose` | `plugin.spec.ts` › `clock.no-self-dispose：运行期的不可用只是返回值…`（3 条：运行中回拨、续约写失败、续约写缺陷） | — |
| `clock.startup-window-bounded` | `clock.spec.ts` › `LeaseClock` › 同名 | 入口层等钟那一半见 governance-center-entry T-18 与 tenancy-host `assembly.clock-ready-timeout` |
| `clock.preflight-readonly` | `preflight.spec.ts` › `clock.preflight-readonly`（5 条，含放进 storage-sql `upgrade.checks` 那一条） | — |
| 装卸配对 `lifecycle.dispose-reclaims-lease`／`dispose-with-inflight-renewal`／`storage-failure-fails-load` | `clock.spec.ts` › `LeaseClock · 装卸` › `lifecycle.dispose-reclaims-lease…`、`lifecycle.dispose-with-inflight-renewal…`；`plugin.spec.ts` › `clock 插件` › `lifecycle.storage-failure-fails-load（缺陷支）…`、`（不可用支）…` | — |
| `migration.clock-lease-idempotent` | `clock.spec.ts` › `migration.clock-lease-idempotent` › `同一迁移跑两次不报错…` | — |

## `packages/tenancy/credential-verification`

测试前缀 `packages/tenancy/credential-verification/tests/`；义务表：[verification.md](../../../realization/packages/tenancy/credential-verification/verification.md#证据义务)。

| 义务行 | 承担者 | 对应说明 |
|---|---|---|
| S-8 第 1 条（不含明文子串、盐不同） | `obligations.spec.ts` › `credential-verification · 证据义务` › `S-8 第 1 条：derive 的输出不含输入明文的任何子串…` | — |
| `verify` 三值 | 同 describe › `verify 三值：正确 ⇒ match；错误 ⇒ mismatch；scheme 不认识 ⇒ mismatch；参数损坏 ⇒ unavailable` | 类型层另有 `types.spec-d.ts` › `verify 恰三值` |
| S-26 政策 | 同 describe › `S-26：政策不合形状 ⇒ unavailable；不满足规则 ⇒ rejected 携理由；满足 ⇒ ok` | — |
| SC-CV-1 | `tools/ts-checks/tests/consumer-rules.spec.ts` › `sc-cv-1`（3 条）；`lint:rules` | 本包内同名占位**跳过**（归 W2-C） |
| 换代演练 | `apps/tenancy-host/tests/lifecycle.spec.ts` › `assembly.credentials-swap-no-rerun（CV 换代演练）` | 本包内同名占位**跳过**（归 W3-A） |

## `packages/tenancy/account-identity`

测试前缀 `packages/tenancy/account-identity/tests/`；义务表：[verification.md](../../../realization/packages/tenancy/account-identity/verification.md#证据义务)。本节点按 v2 实现，下列承担者都是**针对 v2 实现**的。

| 义务行 | 承担者 | 对应说明 |
|---|---|---|
| S-31 三种登录失败同值 | `scenarios.spec.ts` › `capability.account-identity v2 · 规范场景` › `S-31 三种登录失败反馈完全一致…` | 用的是真实 credential-verification（该文件夹具） |
| S-32 退出持久（含完整进程重启 ＋ 故障注入，两支都调 `exchange`） | `plugin.spec.ts` › `account-identity 插件` › `S-32 退出的持久性 + S-47 第 2 支：同一库文件两次装载（不是完整进程重启），verify 与 exchange 给同一个值；再注入存储读不到`；完整进程重启：`apps/tenancy-host/tests/process.spec.ts` › `AI S-32 的完整进程重启（另起一个 Node 进程打开同一库）`；同进程整装配重启：`apps/tenancy-host/tests/lifecycle.spec.ts` › `AI S-32「完整重启」支：boot() 可重入同一文件` | 本包内「完整进程重启」占位**跳过**（归 W2-A／W3-A）。tenancy-host 两条的用例名写的是「`logins.verify` 得 `login-state-rejected`」与「出示物换不出身份」（后者在 lifecycle 那条）；OS 进程那条的名字只写了 `verify` |
| S-33 只及一个 | `scenarios.spec.ts` › … › `S-33 退出的作用范围…` | — |
| S-16 撤销五支 | `scenarios.spec.ts` › … › `S-16 撤销（v2 改写：来源要求只及发起方）：目标以未标类型的字符串交进去，五支同一次里跑` | — |
| S-34 四路 ＋ 求值次序支 | `scenarios.spec.ts` › … › `S-34 同标识四路对比 + 求值次序支…` | — |
| S-40 列得全 ＋ 不返回空集 | `scenarios.spec.ts` › … › `S-40 有效登录状态列得全 + 读不到不返回空集…` | — |
| S-41 五支 | `scenarios.spec.ts` › … › `S-41 未激活记录到期释放标识：五支同一次里跑` | — |
| S-42 伪造依据三支 | `scenarios.spec.ts` › … › `S-42 伪造的依据两侧都被拒：用另一把密钥签…三支同一次里跑` | — |
| S-43 两支（前推支 ＋ 真并发支含两条交错） | 第 1 支：`scenarios.spec.ts` › … › `S-43 第 1 支（可操纵时间源）…`；第 2 支：`packages/tenancy/account-registration/tests/interleavings.spec.ts` › `ai#S-43 第 2 支 × ar 同一次演练：激活与清除链 ① 在同一条已过期记录上并发`（4 条，含交错 (a)、(b)）与 `架构评审点名的集成交错（I-1～I-4…）`（3 条）；**（pg）** `apps/tenancy-host/tests/pg.spec.ts` › `pg 首跑 · 交错 I-12（AR 包 I-1／I-2／I-4 在 pg 上重跑…）`（3 条） | 本包内第 2 支占位**跳过**（归 W2-A） |
| S-46 存储里翻不出能用的出示物（三支，含正对照；① 含快照） | `scenarios.spec.ts` › … › `S-46 存储里翻不出能用的出示物：①（库文件、预写日志、每一条记录的每一个字符串值，含正对照）②（诊断与事件）③（拿列表当凭证）同一次里跑`；快照部分：`apps/tenancy-host/tests/upgrade.spec.ts` › `AI S-46 ① 的快照部分：翻装配留下的升级快照，里面没有能用的出示物` | 本包内快照部分占位**跳过**（归 W2-A／W3-A） |
| S-47 派生恒等（① 外部已知答案向量 ＋ 独立重算；② 完整重启后仍通过） | ①：`scenarios.spec.ts` › … › `S-47 第 1 支：已知答案向量（外部工具算好）+ 每次登录的独立重算`、`S-47 第 1 支（向量对着被测派生函数）…含非 ASCII 一条`；②：`plugin.spec.ts` 上述 S-32 那条（同一库文件两次装载）与 `packages/tenancy/account-registration/tests/integration.spec.ts` › `I-8 同一库文件整装配重启（同进程 dispose 再 boot，不是 OS 进程重启）` › `S-32／S-47 的重启一支…` | ② 的承担者都是**同进程**重启；没有找到 OS 进程重启后核 `exchange` 得同一 `LoginStateId` 的同名用例 |
| S-44 求值与三个出口（①～⑥ ＋ 本节点 ⑦） | `scenarios.spec.ts` › … › `S-44 求值与三个出口：①–⑥ 同一次里跑，加本节点的第 ⑦ 支（不设捷径）` | — |
| S-35 静态检查（identity-values SC-2 对本包记录类型） | **跳过**（`scenarios.spec.ts` 占位：规则形式归 W2-C）；规则**无**（ts-checks 没有 SC-2） | 类型层一半：`types.spec-d.ts` › `记录结构（S-9、S-45「永不以可读形式保存」、S-35）` › `账号行只有一个 AccountId 列（S-11／S-35 的类型层）` |
| S-36 失败集合闭合（九个方法 ＋ `exchange` 同一类型 ＋ 参数类型表） | `types.spec-d.ts` › `S-36 失败集合逐字对契约（九个方法）`（10 条）、`参数类型：用来认人的是品牌 LoginStateId，其余收 unknown`（3 条） | 同名规则形式的占位**跳过**（归 W2-C）；ts-checks 没有对应规则 |
| 登录状态记录的结构（S-9、S-45） | `types.spec-d.ts` › `记录结构（S-9、S-45「永不以可读形式保存」、S-35）`（4 条） | — |
| S-45 熵下限（实现审阅 ＋ 两条文本规则） | 规则：`tools/ts-checks/tests/account-identity-rules.spec.ts` › `no-random-source-inline`（4 条）；`lint:rules` | 「实现审阅」不是测试，本 run 不承担；本包内同名占位**跳过**（归 W2-C） |
| 出示物的形状（43 个字符、base64url、无填充、过 `parseOpaqueIdentifier`） | `scenarios.spec.ts` › … › `S-45 出示物的形状：43 个 base64url 字符、无填充、过 IV S-31 与 S-45 的解析，且每次都不同` | 入口一侧（T-10）见 governance-center-entry 节 |
| S-27 随机源不可用 | `obligations.spec.ts` › `S-27 缺席时的默认答案：逐行注入` › `随机源不可用 ⇒ S-15 storage-unavailable，登录状态表没有新行…` | — |
| S-45 派生值碰撞（含真并发一支） | `obligations.spec.ts` › `S-45 派生值碰撞与 S-15 的提交点` › `随机源每次返回同一组字节…`、`两个并发的 issue 撞同一主键（真并发）…` | — |
| S-15 出示物只在提交成立之后交出 | `obligations.spec.ts` › `S-45 派生值碰撞与 S-15 的提交点` › `S-15「出示物只在提交成立之后交出」…` | — |
| S-30 新增五行（结构检查：十四行对照） | **无** | 义务行是 design 里的对照表与评审，不是测试 |
| S-30「进程外来的身份一律先过 S-44」（接收边界一侧静态检查） | `tools/ts-checks/tests/entry-rules.spec.ts` › `presentation-only-authn`（4 条）；`lint:rules`；本节点这一侧的品牌参数：`types.spec-d.ts` › `参数类型：…`（3 条）；运行期：`scenarios.spec.ts` › … › `S-30「只有 S-44 认出示物」：出示物交给 verify／listEffective／revoke 的发起方一律不认` | 本包内同名占位**跳过**（归 W2-C 与 W2-B） |
| 无场景号的注入义务（逐操作表示层、S-16 重复退出、S-38 同提交、S-27 逐行；S-39 由启动失败兑现） | `obligations.spec.ts` › `逐操作表示层注入（S-27 第 1 行）…`（1 条）、`S-27 缺席时的默认答案：逐行注入`（7 条）；`obligations.spec.ts` › `S-45 派生值碰撞与 S-15 的提交点` › `S-38 删记录与释放标识同提交…`；`plugin.spec.ts` › `account-identity 插件` › `config 校验：…⇒ 启动失败（S-39 参数缺席由启动失败兑现）` | 「S-16 重复退出 ⇒ `not-authorized`」：`S-27 … 逐行注入` › `发起方已失效：S-16 ⇒ not-authorized…` 与之相关；没有找到名字写「重复退出」的用例 |
| R-8 持锁段里没有 `credentials` 调用（两形） | 测试一形：`obligations.spec.ts` › `R-8 持锁段里没有 credentials 调用（测试一形…）`（2 条，含插桩自测）；文本规则一形：`tools/ts-checks/tests/account-identity-rules.spec.ts` › `ai-r8-no-credential-in-write`（3 条）；`lint:rules` | 本包内文本规则占位**跳过**（归 W2-C） |
| 凭据计算挪出写事务后的交错（①～④；② 在 sqlite 与 pg 各一次） | `obligations.spec.ts` › `凭据计算挪出写事务之后的交错…`（5 条：①、②、② 的变体、③、④）；② 的 pg 支 **（pg）** `apps/tenancy-host/tests/pg.spec.ts` › `pg 首跑 · 各包留给 pg 的支` › `AI「凭据计算挪出写事务之后的交错 ②」pg 支…` | 本包内 pg 支占位**跳过**（归 W3-A） |
| 出示物不作诊断输出的实参（类型一形 ＋ lint 一形） | 类型：`types.spec-d.ts` › `no-presentation-in-diagnostics（类型一形）…` › `诊断外观、错误构造与通知出口拒绝出示物`；lint：`tools/ts-checks/tests/account-identity-rules.spec.ts` › `no-presentation-in-diagnostics`（3 条）；`lint:rules` | 本包内 lint 一形占位**跳过**（归 W2-C） |
| S-22 第二处例外的装配纪律（`.produce(` 只在 AR） | `tools/ts-checks/tests/rules.spec.ts` › `restricted-call-sites` › `account-registration 之外调 accounts.produce( 或解析 organization-purge ⇒ 报出`；`lint:rules`；运行期：`scenarios.spec.ts` › … › `S-22 登录路径分辨不出账号存在性…` | — |
| 过期事实的落盘与单调（①～③） | `obligations.spec.ts` › `过期事实的落盘与单调…`（3 条） | — |

## `packages/tenancy/organization-governance`

测试前缀 `packages/tenancy/organization-governance/tests/`；义务表：[verification.md](../../../realization/packages/tenancy/organization-governance/verification.md#证据义务)。

| 义务行 | 承担者 | 对应说明 |
|---|---|---|
| S-17 ＋ 至少一位有效超管（TLC `Membership`） | 形式：[`2026-09-22-formal-tenant-domain-2`](../2026-09-22-formal-tenant-domain-2/README.md) 的 `organization-governance-v1-membership`（本 run 未重跑，输入与当前 `spec/` 逐字节相同，见[形式 run](../2026-09-23-formal-governance-center-entry/README.md#其余四个任务为什么不重跑)）；提供者那一半见 S-48 行 | 本 run 无测试承担模型性质 |
| S-32 判环、S-6／S-12（Alloy 三条 check；判环代码单元测试） | 单元测试：`organizations.spec.ts` › `S-32／S-33／S-34 隶属与上级链` › `S-32 判环两半…`、`S-32 判环的「child === newParent」那一半…（Alloy 曾给出的反例）`、`S-32 判环读不到部分链 ⇒ unavailable…` | Alloy 结果在 run `-2`，且**当前 `Affiliation.als` 与那次快照差一行注释**（见[形式 run 的异常](../2026-09-23-formal-governance-center-entry/README.md#异常)）；两个变异核对本 run 没有 |
| S-7 至多一个上级（静态检查） | `organizations.spec.ts` › `S-7 至多一个上级：静态检查`（2 条） | 是测试文件里的源码／存储形状检查，不在 `tools/ts-checks` |
| S-46 三收场 ＋ 第四支 | `scenarios.spec.ts` › `capability.organization-governance v1 · 规范场景` › `S-46 邀约的三种收场（邀请）…`、`S-46 邀约的三种收场（隶属请求）…` | — |
| S-47 | `scenarios.spec.ts` › … › `S-47 过期之后接受被拒，且没有中间状态…` | — |
| S-48 真并发 | `scenarios.spec.ts` › … › `S-48 并发移除／降级对方只有先成的一方成立（真并发：两个装配、两个存储连接、同一库文件）` | 只在 sqlite 一侧 |
| S-39 回来的是同一条记录 | `offers.spec.ts` › `S-25 接受邀请` › `S-39 回来的是同一个租户：解除后再邀请并接受 ⇒ 同一行、同一个 TenantId、有效性翻回，角色不继承` | `scenarios.spec.ts` 的占位写「本包那一半见 memberships.spec「S-39」」，实际用例在 `offers.spec.ts` |
| S-49 跨契约 | **跳过**（跨契约，资产 owner 一侧，本版不做） | — |
| S-50 跨契约 | **跳过**（跨契约，PF-015 会话契约尚无，本版不做） | — |
| S-51 | `scenarios.spec.ts` › … › `S-51 个人组织里没有这个动作：发起者是超管…` | — |
| S-52 | `scenarios.spec.ts` › … › `S-52 成员资格不可用时明确失败：S-26／S-28／S-37 都是 unavailable…` | — |
| S-54 八支（⑥⑦挨着跑） | ①～⑤、⑧：`scenarios.spec.ts` › … › `S-54 清除只对未激活账号成立` › `①～⑤、⑧同一次演练对比…`；⑥⑦：`packages/tenancy/account-registration/tests/interleavings.spec.ts` › `og#S-54 ⑥⑦（真实 AI S-38），挨着跑` | 本包内 ⑥、⑦ 两个占位**跳过**（归 W2-A） |
| S-53 依据 | `organizations.spec.ts` › `S-53 清除依据与 ②乙 两支（替身构造…）` › `依据只在 ok 路径产出…`；`scenarios.spec.ts` › … › `S-54 …` › `①～⑤、⑧…依据只在 ok 路径产出并绑定该 AccountId` | — |
| S-21 创建键五支 ＋ 注入 | `organizations.spec.ts` › `S-21 创建团队组织：创建键的幂等边界`（4 条，含 `五支同跑…`、`故障注入：键登记读不到…`） | — |
| S-23／S-30 时长两路、S-30 自环 | `offers.spec.ts` › `S-23／S-30 有效时长两路（同一次对比）`（2 条）；自环：`organizations.spec.ts` › `S-32／S-33／S-34 …` › `S-32 判环两半：…与 S-30 自环同一个值` | — |
| S-42 第 4 行（只由清除链调用；结构检查含自测） | `tools/ts-checks/tests/consumer-rules.spec.ts` › `og-s42-dynamic-resolve`（3 条）；`tools/ts-checks/tests/rules.spec.ts` › `restricted-call-sites`；`lint:rules`；本包：`organizations.spec.ts` › `S-42 第 4 行：S-53 单独一个服务名` | — |
| S-36／S-37 登录状态参数是品牌（类型 ＋ 运行期） | 类型：`types.spec-d.ts` › `E-4：S-36／S-37 的登录状态参数是 LoginStateId 品牌…`；运行期：`memberships.spec.ts` › `S-36／S-37 当前租户身份` › `E-4 运行期那一支：绕过类型送非法表示 ⇒ invalidInput（不是 loginStateNotValid／unavailable），且本节点没有读存储` | — |
| 「同一提交」的跨 owner 解释（真并发两条交错 ＋ R-6 注入） | 真并发：`packages/tenancy/account-registration/tests/interleavings.spec.ts` › `ai#S-43 第 2 支 × ar 同一次演练…`（4 条）；R-6 注入：`organizations.spec.ts` › `S-20 创建个人组织` › `R-6：读账号之后、写入之前账号行被删 ⇒ 引用约束拒绝插入…`；**（pg）** `apps/tenancy-host/tests/pg.spec.ts` › `交错 I-12`（3 条） | 义务行里「直接构造『组织行指着账号行』时 S-38 被拒、重扫后收敛」：`packages/tenancy/account-registration/tests/purge.spec.ts` › `S-34 清除链…` 有相关用例；没有找到逐字同名的一条 |

## `packages/tenancy/account-registration`

测试前缀 `packages/tenancy/account-registration/tests/`；义务表：[verification.md](../../../realization/packages/tenancy/account-registration/verification.md#证据义务)。

| 义务行 | 承担者 | 对应说明 |
|---|---|---|
| S-13／S-35／S-16／S-10／S-20／S-19（TLC crash、progress） | 形式：[`2026-09-22-formal-tenant-domain-2`](../2026-09-22-formal-tenant-domain-2/README.md) 的 `account-registration-v1-{crash,progress}`（本 run 未重跑，输入逐字节未变）；实现侧的 S-13／S-35：`faults.spec.ts` › `S-13／S-35 两个不可达状态：每一步之间注入失败`（3 条） | 模型性质本 run 无测试承担；`faults.spec.ts` 是实现的故障注入，不是模型证据 |
| S-5 四值闭合（lint） | `tools/ts-checks/tests/consumer-rules.spec.ts` › `terminal-outcome-closed`（4 条）；`lint:rules`；类型层：`types.spec-d.ts` › `account-registration 类型闭合` › `S-5 终结结果恰四值`、`register 的返回恰是四值终结结果…` | — |
| S-27 | `scenarios.spec.ts` › `S-27 中途失败后用同一标识重来`（3 条） | — |
| S-28 | `scenarios.spec.ts` › `S-28 在任意位置中断，没有第三种形态`（2 条） | — |
| S-29（装配期缺席与运行期 `unavailable` 两支） | `scenarios.spec.ts` › `S-29 参与方缺席时不放行`（3 条：装配期缺席、运行期不可用、在途时被撤） | — |
| S-30 | `scenarios.spec.ts` › `S-30 编排者被卸载，在途尝试等同崩溃` | — |
| S-31 真并发两支 | `scenarios.spec.ts` › `S-31 两个同标识并发注册`（3 条）；I-6 撞唯一约束那一支 **（pg）** `apps/tenancy-host/tests/pg.spec.ts` › `pg 首跑 · 各包留给 pg 的支` › `AR I-6 撞 account_login_identifier_unique 那一支的 pg 变体…` | `integration.spec.ts` 里 I-6 撞约束那一支的 sqlite 占位**跳过**（sqlite 下到不了，归 W3-A） |
| 清除链跨两步义务（跳过 ①、两步之间中断后重扫、与主链并发七格） | `purge.spec.ts` › `S-34 清除链（清扫经 purgeExpired 发起）`（6 条）、`S-34 两个发起者在同一条过期记录上并发`（2 条）；`interleavings.spec.ts` › `ar#S-34 与注册主链并发：交错表其余几格`（4 条）、`ai#S-43 第 2 支 × ar 同一次演练…`（4 条）、`og#S-54 ⑥⑦…`（1 条）；`integration.spec.ts` › `I-6 清除完成之前同一标识重新注册` › `清除链停在两步之间时…` | — |
| 主链就地清除再重跑 ① 只一次 | `purge.spec.ts` › `S-8 撞上已过期记录：本组合就地跑清除链，两步都 ok 才重跑 ① 一次`（7 条） | — |
| 缺陷记录可区分 | `scenarios.spec.ts` › `S-8 参与方失败值 → 终结结果（主链…）`（4 条）；`purge.spec.ts` 中「记组合缺陷」「记契约违反」的几条；类型：`types.spec-d.ts` › … › `缺陷记录三类、五个步骤位置` | — |

## `packages/tenancy/governance-center-entry`

测试前缀 `packages/tenancy/governance-center-entry/tests/`；义务表：[verification.md](../../../realization/packages/tenancy/governance-center-entry/verification.md#证据义务)。

| 义务行 | 承担者 | 对应说明 |
|---|---|---|
| 契约 V-1、V-2（TLC `EntryDecision.cfg`） | 形式：[`2026-09-23-formal-governance-center-entry`](../2026-09-23-formal-governance-center-entry/README.md)（同日） | 本 run 无测试承担模型性质 |
| T-1 路由表封闭 | `decide.spec.ts` › `T-1 路由表封闭（S-17、S-24；SC-3）`（3 条） | — |
| T-2 七次答复逐字节相同、表示层不合格三例、非法 UTF-8、无 `Date` 头、快照 | 桩：`decide.spec.ts` › `T-2 桩那一半：六种不认与其间撤销逐字节相同；表示层不合格不调 exchange`（3 条）；真实组合：`center.spec.ts` › `T-2 线上逐字节相同（真实组合）`（2 条）；快照：`bytes.spec.ts` › `T-2：四种入口答复与 examples §1、§3 逐字节相同`（5 条）、`T-2：公开体检（examples §2）`（2 条）、`T-2：路由结果与完整体检的形状（examples §4、§5）`（2 条） | 本 run 另有[独立字节核对](README.md#一入口层产出的答复字节-vs-传输绑定-examplesmd-15) |
| T-3 判定次序 | `decide.spec.ts` › `T-3 判定次序（桩那一半）`（7 条）；`center.spec.ts` › `T-3 判定次序（真实组合）`（2 条） | — |
| T-4 三个出口、`defectCount` | `center.spec.ts` › `T-4 三个出口不合并（真实组合 + 运维面）`；`decide.spec.ts` › `T-4 缺陷那一半` | — |
| T-5 句柄、撤销、备份 | `center.spec.ts` › `T-5 列表句柄、撤销与备份（真实组合）`（4 条，含 `备份那一半…`）；`decide.spec.ts` › `T-5 桩那一半：句柄、撤销与列表`（2 条） | — |
| T-6 身份推导与补授权 | `decide.spec.ts` › `T-6 身份推导与补授权（桩那一半）`（7 条）；`center.spec.ts` › `T-6 身份推导与补授权（真实组合）`（2 条） | — |
| T-7 δ = 0 | `center.spec.ts` › `T-7 δ = 0：每个请求现读（真实组合）` | — |
| T-8 中心标识 | `center-id.spec.ts` › `读或铸（S-28 ④）`（8 条，含 `真并发首启（sqlite）`）、`迁移前核对 governanceCenterPreflight（R-GC8；三支）`（3 条）、`T-8「表整个丢了」…`（3 条）；`lifecycle.spec.ts` › `T-8 经插件：中心标识的读或铸`（6 条）；pg 真并发 **（pg）** `apps/tenancy-host/tests/pg.spec.ts` › `pg 首跑 · 各包留给 pg 的支` › `入口层「真并发首启（pg）」…`；装配一侧「表丢了」：`apps/tenancy-host/tests/upgrade.spec.ts` › `assembly.upgrade-preflight-refuses…` › ③ 两条 | 本包内 pg 真并发占位**跳过**（归 W3-A） |
| T-9 两张面 | `center.spec.ts` › `T-9 客户端一面没有第三张面`；`ops.spec.ts` › `T-9、V-8 运维面的答复（S-21、S-26）`（2 条）、`V-8 运维面的承载（S-20）`（3 条） | — |
| T-10 路由映射 | `decide.spec.ts` › `T-10：每条路由的每个可达失败值 ⇒ 契约路由表所写（S-14、S-19～S-23）`（142 条）、`V-9 与 T-10 的成功那一支：27 条路由的成功返回`（28 条） | — |
| T-11 秘密不进任何输出 | `center.spec.ts` › `T-11 秘密不进任何输出（本文件全部答复、体检、工程记录）`；`decide.spec.ts` › `T-2 桩那一半…` › `工程记录分得出 absent／multiple／malformed／judged`；`lifecycle.spec.ts` › `T-14 …` › `全部日志与启动失败说明里没有私钥、没有 config 的值（目录路径）` | T-11 的搜索范围按用例名是「本文件（center.spec）全部输出」 |
| T-12 生命周期（含崩溃落在开闸之前） | `lifecycle.spec.ts` › `T-12 inject 缺一即 PENDING ⇒ 装配启动失败`（9 条）、`T-12 插件体抛出 ⇒ 启动失败且监听已关`（2 条）、`T-12 openSignal：就绪与开门分两步`（3 条通过）、`T-12 两张面同起同停；存储不可用时不卸载`（2 条）、`T-12 停机时的在途请求（S-34）`（2 条）；崩溃落在开闸之前：`apps/tenancy-host/tests/process.spec.ts` › `assembly.no-commit-before-open ②：确认之前 SIGKILL，没有任何答复见过被撤回的值`（2 条） | 本包内「崩溃落在开闸之前」占位**跳过**（归 W3-A） |
| T-13 迁移片段 | `center-id.spec.ts` › `T-13 迁移片段（M-1、M-3）`（3 条） | 用例名写「主键约束名…（sqlite；pg 随装配第二程）」；pg 上的约束名见 **（pg）** `apps/tenancy-host/tests/pg.spec.ts` › `assembly.pg-wiring：…外键两向与约束名同 sqlite` |
| T-14 配置错误一个政策 | `lifecycle.spec.ts` › `T-14 配置错误一个政策：各自 FAILED，没有运行期具名拒绝`（20 条） | 义务行里「残留套接字有人在听」：`ops.spec.ts` › `V-8 运维面的承载（S-20）` › `有人在听的残留套接字 ⇒ 起不来…` |
| T-15 重复成员 | `decide.spec.ts` › `T-15 重复成员落在它那一步（S-4；https-json/1 S-8）`（9 条）；`json.spec.ts` › `S-8 重复成员：报告每一处，不取其一…`（7 条） | — |
| T-16 不区别对待来者 | `center.spec.ts` › `T-16 不记住来访、不区别对待来者` | — |
| T-17 凭据表示层同源 | `decide.spec.ts` › `T-17 凭据表示层跟随 credentials.parse（S-19）`（2 条）；`credentials` 缺席 ⇒ `PENDING`：`lifecycle.spec.ts` › `T-12 inject 缺一即 PENDING…` › `拿掉 credentials…` | — |
| T-18 十项来源、两张面同起同停、等钟、换代演练 | `ops.spec.ts` › `T-18 两张面同起同停与十项的来源`（12 条，含两种次序的 `storage 换代演练`） | — |
| T-19 服务端认证 | `transport.spec.ts` › `V-7 与 T-19：只有 TLS、服务端认证、不收早期数据`（4 条） | 客户端一侧（`apps/cli`）**无**：那个提供者不存在 |
| G-10 传输绑定（冻结后 T-2 快照与工件逐字节一致） | `bytes.spec.ts` › `examples.md 自洽…` 与 `T-2：…`（对的是**候选**工件） | 冻结与否不在测试里 |

静态检查表：

| 义务行 | 承担者 | 对应说明 |
|---|---|---|
| 契约 SC-1（`.produce(`、`'organization-purge'`，另加四个方法） | `tools/ts-checks/tests/rules.spec.ts` › `restricted-call-sites`；`tools/ts-checks/tests/entry-rules.spec.ts` › `restricted-call-sites：入口 SC-1 新增的四个方法`（2 条）；`lint:rules` | — |
| 契约 SC-2（导入白名单 ＋ 事件订阅白名单） | `tools/ts-checks/tests/entry-rules.spec.ts` › `ops-import-whitelist`（5 条）、`ops-event-whitelist`（4 条）；`lint:rules` | — |
| 契约 SC-3 | 同 T-1（`decide.spec.ts` › `T-1 …` › `SC-3：本包源码不按名字解析服务或方法…`）与 T-9 | — |
| 只碰一张表 | `tools/ts-checks/tests/entry-rules.spec.ts` › `single-table-entry`（3 条）；`lint:rules` | — |
| 不读对端地址 | `tools/ts-checks/tests/entry-rules.spec.ts` › `no-peer-address`（1 条）；`lint:rules` | — |
| `credentials` 只调 `parse` | `tools/ts-checks/tests/entry-rules.spec.ts` › `credentials-parse-only`（1 条）；`lint:rules` | — |
| 只凭出示物认人 | `tools/ts-checks/tests/entry-rules.spec.ts` › `presentation-only-authn`（4 条）；`lint:rules`；`center.spec.ts` › `T-5 …`（拿句柄当出示物） | — |
| 网络监听只在本包（R-20） | `tools/ts-checks/tests/entry-rules.spec.ts` › `no-network-listen-in-tenancy`（2 条）；`lint:rules` | — |
| 包布局常量 | `tools/ts-checks/tests/entry-rules.spec.ts` › `ops-import-whitelist` › `入口层包不存在 ⇒ 静默通过；包在而运维面目录或事件声明模块缺席 ⇒ 报布局偏离`；`临时目录里造出入口层包：collectSources + CLI 真的会红`（2 条） | — |
| 现有三条（`no-bail-control`、`no-wall-clock`、`no-testing-import`） | `tools/ts-checks/tests/rules.spec.ts` › `no-bail-control`、`no-wall-clock`、`no-testing-import`；`lint:rules` | — |

## `apps/tenancy-host`

测试前缀 `apps/tenancy-host/tests/`；义务表：[verification.md](../../../realization/apps/tenancy-host/verification.md#证据义务)。

| 义务行 | 承担者 | 对应说明 |
|---|---|---|
| AI R-7 ⇔ OG R-6：`assembly.fk-organization-owner-account`（含负向运行） | `migrations.spec.ts` › `assembly.fk-organization-owner-account（S-35 孤儿不可达在存储层的唯一直接实证）`（1 条，①②③） | — |
| 迁移合成：`assembly.migration-composition`、`migrations-idempotent`、`constraint-names-resolve` | `migrations.spec.ts` › `assembly.migration-composition`（4 条，含 M-9 编号名快照）、`assembly.migrations-idempotent`（2 条）、`assembly.constraint-names-resolve…`（1 条） | — |
| R-U1、R-U2：`assembly.upgrade-preflight-refuses`（①②③） | `upgrade.spec.ts` › `assembly.upgrade-preflight-refuses：只读核对不过 ⇒ 不碰数据`（5 条，③ 两种情形各一条，另一条反向） | — |
| R-U3、R-U4：`assembly.upgrade-restore-on-boot-failure`（含首次启动支、撤除路径恢复失败支） | `upgrade.spec.ts` › `assembly.upgrade-restore-on-boot-failure…`（7 条） | — |
| R-U5：`assembly.upgrade-crash-recovery` | `process.spec.ts` › `assembly.upgrade-crash-recovery：启动途中崩溃`（2 条，子进程 `SIGKILL`） | — |
| R-U6：`assembly.upgrade-confirmed`（含交错守卫对象支） | `upgrade.spec.ts` › `assembly.upgrade-confirmed…`（4 条）与其 `显式守卫支（N-5）`（3 条） | — |
| R-U7（pg）：`assembly.pg-upgrade-atomic` | **（pg）** `pg.spec.ts` › `pg 首跑 · 装配（OMNE_TEST_PG_URL）` › `assembly.pg-upgrade-atomic…`；U-3 的现状：**（pg）** 同 describe › `U-3 在 pg 上的真形状…` | sqlite 一侧**跳过**（缺 pg URL） |
| 两步开闸：`assembly.no-commit-before-open`（①～⑤） | ①④：`lifecycle.spec.ts` › `assembly.no-commit-before-open 与 assembly.entry-loads-last`（3 条）；②：`process.spec.ts` › `assembly.no-commit-before-open ②…`（2 条）；③：`upgrade.spec.ts` › `assembly.upgrade-confirmed…` › `交错守卫对象…`、`断言支：确认报 snapshotTaken 而没删到快照…`；⑤：`slow.spec.ts` › `assembly.no-commit-before-open ⑤：确认之后等不到 serving（已接受的残余情形 U-4）` | — |
| 装载清单整体性：`assembly.missing-key-fails-boot`、`assembly.invalid-config-fails-boot` | `config.spec.ts` › `assembly.missing-key-fails-boot：四份部署密钥各五种坏法`（4 条）、`assembly.invalid-config-fails-boot…`（23 条） | — |
| 配对自检：`assembly.key-pairing-mismatch-fails-boot` | `config.spec.ts` › `assembly.key-pairing-mismatch-fails-boot…`（4 条，含反向） | — |
| `assembly.pending-is-manifest-error` | `lifecycle.spec.ts` › `assembly.pending-is-manifest-error：PENDING 是清单错误，同步判定、不等待`（2 条，含入口层支） | — |
| `assembly.entry-loads-last` | `lifecycle.spec.ts` › `assembly.no-commit-before-open 与 assembly.entry-loads-last`（3 条）；清单形状：`lifecycle.spec.ts` › `assembly.manifest-shape`（2 条）；入口层插件体抛出（端口被占）⇒ 回到启动前：`upgrade.spec.ts` › `assembly.upgrade-restore-on-boot-failure…` › `入口层端口被占…` | — |
| 时钟启动期失败：`assembly.clock-write-failure-fails-boot`、`assembly.clock-rollback-fails-boot`（两条路 ＋ 反向） | `lifecycle.spec.ts` › `assembly.clock-write-failure-fails-boot`；只读核对那条路：`upgrade.spec.ts` › `assembly.upgrade-preflight-refuses…` › `② clock_lease.written_at 在墙钟之后…`；插件那条路：`upgrade.spec.ts` › `assembly.upgrade-restore-on-boot-failure…` › `迁移之后 clock 启动时检出回拨（ClockRollbackDetected）…`；反向（快速重启）：`slow.spec.ts` › `assembly.clock-ready-timeout ②③ 与快速重启` › `③／快速重启…` | 没有名为 `assembly.clock-rollback-fails-boot` 的用例；上面是按内容对应的两条 |
| `assembly.clock-ready-timeout`（①②③） | ①：`config.spec.ts` › `assembly.invalid-config-fails-boot…` › `等钟上界缺…`、`等钟上界不大于租约宽度…`；②③：`slow.spec.ts` › `assembly.clock-ready-timeout ②③ 与快速重启`（2 条） | — |
| 撤除次序：`assembly.dispose-reverse-order`、`dispose-with-inflight`、`dispose-timeout` | `lifecycle.spec.ts` › `assembly.dispose-reverse-order 与 assembly.dispose-with-inflight`（2 条）；`slow.spec.ts` › `assembly.dispose-timeout`（1 条） | — |
| 私钥不经服务 store 可达：`assembly.keys-only-in-owner-config` | `lifecycle.spec.ts` › `assembly.keys-only-in-owner-config（窄形式：它不证同进程别的代码读不到）` | — |
| 密钥生成函数 | `config.spec.ts` › `密钥生成函数 generateKeyFiles（keygen）`（2 条）；进程入口：`process.spec.ts` › `进程入口（src/cli.ts）` › `keygen <dir>…` | — |
| AI S-30 第 8 行／S-22 方法级结构检查 | `tools/ts-checks/tests/rules.spec.ts` › `restricted-call-sites`；`lint:rules` | — |
| OG S-42 第 4 行结构检查 ＋ 装载清单那一半 | 结构：`tools/ts-checks/tests/consumer-rules.spec.ts` › `og-s42-dynamic-resolve`（3 条）、`tools/ts-checks/tests/rules.spec.ts` › `restricted-call-sites`；`lint:rules`；清单：`lifecycle.spec.ts` › `assembly.manifest-shape`（2 条） | — |
| CV 换代演练 | `lifecycle.spec.ts` › `assembly.credentials-swap-no-rerun（CV 换代演练）` | — |
| AI S-32「完整重启」支 | `lifecycle.spec.ts` › `AI S-32「完整重启」支：boot() 可重入同一文件`；OS 进程：`process.spec.ts` › `AI S-32 的完整进程重启（另起一个 Node 进程打开同一库）` | — |
| AI S-43 第 2 支、OG S-54 ⑥⑦ 的夹具 | 演练在 `packages/tenancy/account-registration/tests/interleavings.spec.ts`（见 account-identity、organization-governance 节）；**（pg）** `pg.spec.ts` › `交错 I-12`（3 条） | 本节点只提供夹具；夹具本身没有单独的用例 |
| AR S-29 | `packages/tenancy/account-registration/tests/scenarios.spec.ts` › `S-29 参与方缺席时不放行`（3 条，走 `bootAssembly`） | — |
| D-026 只改配置切 pg：`assembly.pg-wiring` | **（pg）** `pg.spec.ts` › `pg 首跑 · 装配（OMNE_TEST_PG_URL）` › `assembly.pg-wiring：同一份迁移与装载代码只改方言配置 ⇒ boot() 成功、答复、铸标识；重启标识不变；外键两向与约束名同 sqlite` | sqlite 一侧**跳过**（缺 pg URL） |
| 产品代码不 import `kernel-basis/testing` | `tools/ts-checks/tests/rules.spec.ts` › `no-testing-import`；`lint:rules`（扫描范围含 `apps/`） | 义务行写「受阻：现有三条规则不含它」——本 run 的规则集里有 `no-testing-import`，扫描目录含 `apps/` |
| 启动失败可观测：`assembly.boot-failure-log` | `lifecycle.spec.ts` › `assembly.boot-failure-log：每种启动失败落恰一条结构化记录，不含 PEM 与 config 值` › `config、密钥配对、清单、插件、只读核对各一次`；进程入口：`process.spec.ts` › `进程入口（src/cli.ts）` › `serve 启动失败 ⇒ 退出 1，标准错误流里恰一条 startup-failed` | 义务行点名的阶段还有遗留快照恢复、建快照、迁移、钟读不到、恢复快照：用例名只写了五种 |

本节点义务表之外、本 run 通过的 tenancy-host 用例：`process.spec.ts` › `交错 I-9：两进程属主排他，clock 租约在同一文件`（2 条）与其 **（pg）** 支 `交错 I-9 的 pg 支：属主排他（咨询锁）…`；`upgrade.spec.ts` › `运维约定的依据：直接打开快照文件会生附属文件`；`lifecycle.spec.ts` › `真实 clock 插件的组合…`；`process.spec.ts` › `进程入口（src/cli.ts）` › `serve：起来之后 SIGTERM ⇒ 逆序撤除、退出 0…`。

---

## `composition.governance-center-entry-https-json`：V-1～V-11

测试前缀 `packages/tenancy/governance-center-entry/tests/`；义务表：[spec verification](../../../spec/compositions/governance-center-entry-https-json/verification.md#证据义务)。

| 义务 | 承担者 | 对应说明 |
|---|---|---|
| **V-1** 四种入口答复与公开体检答复逐字节等于 examples；一次写出；场景 S-26 | `bytes.spec.ts` › `T-2：四种入口答复与 examples §1、§3 逐字节相同`（5 条）、`T-2：公开体检（examples §2）`（2 条）；`transport.spec.ts` › `V-1：每一份答复在连接上一次写出`；`center.spec.ts` › `T-2 线上逐字节相同（真实组合）`（2 条）；场景 S-26：`transport.spec.ts` › `V-5 只看请求体（规范场景 S-26）`（15 条） | 另有本 run 的[独立字节核对](README.md#一入口层产出的答复字节-vs-传输绑定-examplesmd-15)（函数级） |
| **V-2** 跨协议版本不改的两样（字节、形状、S-7 读法、TLS 参数、接收上界与时限下限钉在测试里） | `bytes.spec.ts` › `V-2：任何别的答复的体都不等于 "version-mismatch" 那 18 个字节`；`framing.spec.ts` › `接收上界与时限的取值不低于契约下限（S-10 下限表；V-2 钉住的那几项）`；`version-mismatch` 133 字节：`bytes.spec.ts` › `T-2：…` › `version-mismatch`；S-7 读法：`json.spec.ts` › `S-7 四级读法（examples §6）`（8 条）；TLS 最低版本：`transport.spec.ts` › `V-7 与 T-19：…` › `只提供 TLS 1.2 的客户端握不了手` | 「改 `accepted_protocol_versions`、加一条路由时这组测试都不许动」是对今后改动的约束，本 run 无法核 |
| **V-3** 请求体的读法（examples §6 第 1～8、15、16、18 行） | `json.spec.ts` › `S-7 四级读法（examples §6）`（8 条）、`S-7 JSON 值的读法`（6 条）；第 15、16 行：`decide.spec.ts` › `T-15 …` › `examples §6 #15、#16：offerTtl 9007199254740990.5 不是整数 ⇒ invalid-input；1e3 合形状、交给领域的是 1000` | 逐行对应哪一条用例，看 `json.spec.ts` 用例名里的 `#` 号 |
| **V-4** 重复成员（第 9～14、17、19 行；顶层四个成员；载荷里面；转义还原后比较） | `json.spec.ts` › `S-8 重复成员：报告每一处，不取其一（examples §6 #9～#14、#17、#19）`（7 条）；`decide.spec.ts` › `T-15 重复成员落在它那一步（S-4；https-json/1 S-8）`（9 条，含 `出示物重复（其一有效）…`、`operation 重复（第二个以转义写出）…`） | — |
| **V-5** 只看请求体、一连接一请求、不写 `1xx`、关闭次序、读尽上界 | `transport.spec.ts` › `V-5 只看请求体（规范场景 S-26）`（15 条）；`transport.spec.ts` › `读尽时限（S-5；两张面同一连接层）`（1 条） | — |
| **V-6** 问不到（开门之前、停机之后、成帧不了、超上界；停机时的在途） | `transport.spec.ts` › `V-6：开门之前问不到`（1 条）、`V-6 成帧不了与超界：收不到任何 HTTP 字节，也收不到 4xx`（10 条）；`framing.spec.ts` › `成帧不了（S-10）`（20 条）；停机：`lifecycle.spec.ts` › `T-12 停机时的在途请求（S-34）`（2 条） | — |
| **V-7** 只有 TLS、服务端认证、不收早期数据、私钥与原始请求不外泄 | `transport.spec.ts` › `V-7 与 T-19：只有 TLS、服务端认证、不收早期数据`（4 条）；`center.spec.ts` › `T-11 秘密不进任何输出…` | 客户端「确认不了就不交出登录状态」**无**：`apps/cli` 不存在 |
| **V-8** 运维面的承载与答复 | `ops.spec.ts` › `V-8 运维面的承载（S-20）`（3 条）、`T-9、V-8 运维面的答复（S-21、S-26）`（2 条）；「客户端一面不应答时运维面也不应答」：`ops.spec.ts` › `T-18 …`（serving 之前／stopped 之后不答）与 `transport.spec.ts` › `V-6：开门之前问不到`；接收时限：`slow.spec.ts` › `接收时限：…` › `运维面同一时限…` | — |
| **V-9** 体的写出规则（examples §7 每一行；27 条路由成功返回过 `Exchange`） | `bytes.spec.ts` › `V-9：体的写出规则逐例（examples §7）`（11 条）；`decide.spec.ts` › `V-9 与 T-10 的成功那一支：27 条路由的成功返回`（28 条） | — |
| **V-10** 客户端怎样读答复 | **无** | 受阻：`apps/cli` 的客户端代理不存在 |
| **V-11** 接收下限与各上界判的先后 | `framing.spec.ts` › `接收上界：恰在下限上照收，上界 + 1 即判（V-11；S-10）`（3 条）；`json.spec.ts` › `嵌套深度与成员数两个上界（S-7 表下、S-10；V-11）`（6 条）；接近 30 秒才发完：`slow.spec.ts` › `接收时限：下限 30 秒之内不被切，到了时限还没收齐就关闭不写`（3 条） | — |

返回[本次运行](README.md)。
