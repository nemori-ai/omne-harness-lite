# w2-mcp-core 第 1 轮评审（head 16ec8f018，基线 b0f2ec7fb）

## 设计与实践（只读子代理）

主干与规格一致：两个类只做状态转移；四个服务是工厂；关口/连接表/发现分开；只有 `as const`；品牌只在 `gate.ts` 的 `grant` 一处授予；判别联合都穷尽。

- **D1 阻断**：S1 关口有四份实现（`gate.ts` 的 `admit` 生产不用，只被 `gate.spec` 测；`guard.ts` 的 `refusalOf`/`admitForUse`/`stillEligible`；`status.ts` 的 `inspect`/`list` 各内联一份）。MC2-4 的证据测的是生产不走的入口；README「给下一波」把 W3 指向 `admit`/`admitWithoutEligibility`，会绕过不变式 6 的自动关闭。处置：只留一份 S1（`admit` 返回带裁决的结果，其余在其上组合），`gate.spec` 改测生产入口，README 写 `admitForUse`/`stillEligible`。
- D2：`Connection` 有两个写者（`discovery.settleConnection` 直接 `degrade`/`ready`；`Ensured.connection` 交出可变聚合；用例直接 `lose`）。处置：表上提供 `settle`/`degrade`/`recover`，`Ensured` 只交只读视图。
- D3：`PreparedSettings` 不是判别联合，`table.ts:337/340/366` 出现同义判断与不可达分支。处置：按 `transport.kind` 分两变体，凭据按 `auth` 分两变体。
- D4：`SettingsRefusal` 用整个 `Refusal`（只会产出三种）；`EnsureFailure` 是 `reason × catalog` 乘积但实际配对出现。处置：`{ stage: 'settings' } | { stage: 'connect', catalog }`。`Ensured` 五字段（规格三字段），README 写明是快照。
- D5：连接表四个结构、`lingering` 与 `residuals` 记同一事实、三步 teardown 在四处重复、`residuals` 声明在使用之后。处置：`lingering: { handle, confirmed }[]` 上 Entry，抽 `teardown(entry)`。
- D6：`canonical.ts` 复制契约 `json.ts`（已登记 W3 退出条件，SPEC 要写成偏离）；`in-flight.ts` 的 `textOf` 重写 `tenantTextOf`；`connections.ts` 内联 `Extract` 即 `GateRefusal`。
- D7：正文在三处各自解析（`settings.ts:42/87`、`status.ts:30`）；处置：关口解析一次，`AdmittedEndpoint` 带 `definition`。
- D8：公开根偏离已定事项 1（`McpDiscovery`、`RefreshRequest`、`McpCoreOptions`/`{ now }`），原因成立且已登记，但成员 SPEC 没记成偏离与退出条件。
- D9：测试大体断言行为；`tests/doubles/core.ts` 复制装配并暴露 `table`，`release.spec` 用 `table.stateOf` 断言内部状态（应走 `status.inspect`）；`scripted-transport` 用手写字符串列表判失败种类（应 `satisfies Record<kind,true>`），`open` 步缺席时照样成功且文件头没写。
- D10：成员 SPEC 的 MC-1、2、4、8–13 没有反例与变红；MC-2 指向生产不走的 `admit`。
- D11：README「给下一波」缺 `ConnectionKey` 的算法入口（`readAccountOf`）、聚合状态转移的约定、`UnavailableMark`/`CatalogMark` 取值。
- 无发现：`config.ts`、`connection.ts`、`in-flight.ts`、`store/memory.ts`（小：直接写 `{ ok }` 字面量而非 `succeed`/`fail`）、`inspection.ts`。

## 交付边界（只读子代理）

- 验收 14 条：13 达到、MC2-6 部分（`stale-revision` 来源在 refresh 里不可达，写者裁定 15 推理正确）；写范围无越界；5 提交署名与 trailer 正确。
- 17 条自定裁定：都在授权内或以 SPEC 为准；与已定事项的冲突项：1、2（公开根多导出与第三参，对已定事项 1）、3（`ensure` 失败带 `catalog`，对闭包签名与已定事项 6.4）、4（S4 在复用查找前，对已定事项 6 次序）、8（自动关闭只在未采用/被挡下，收窄已定事项 11）。
- **阻断 A1**：连接时限没有覆盖 `credentials.acquire` 与 `landing.start`（`table.ts:339-347,382` 裸 await），违反已定事项 6.5 与不变式 5；成员 SPEC MC-5 过度声明。
- 建议/待裁：调用方中止建连会标记清单且单飞共享 promise 使同键并发一起失败；页读取不受连接时限（组页不变式 5 vs 已定事项 6.5）；服务实际走的关口没被 MC2-4 变异守住（同设计 D1）；释放次序没进 trace。

## reduce 裁定（第 2 轮输入）

- 阻断 A1、设计 D1 进修复轮。
- 调用方中止：`refresh` 的 `signal` 不进单飞的建连（单飞只受连接时限约束）；调用方在等待建连或分页时中止 → `refresh` 答 `kept(cancelled)`，不标记清单，不影响同键的并发调用方；连接时限超时才是 `connection-unavailable` + 标记。
- 分页阶段按组页不变式 5 也受连接时限约束：listing 阶段另起同一上界的时限；超时按该页 `no-answer` 处理（`kept(listing-incomplete, page-failed)` + `degraded(list-failed)`）。已定事项 6.5 相应修正。
- 接受裁定 1、2（W3 prep 回写契约，SPEC 写成偏离并给退出条件）、3（但形状按设计 D4 收窄）、4、8（已定事项 11 改为「未采用或被挡下时关闭；`not-eligible`/`unknown` 不关闭」）、15（MC2-6 部分可接受）。
- 释放次序进 trace（S9：进程句柄在 `stop()` 返回后释放），用例断言次序。

## L3 逐行（implementation-reviewer，9 个探针实跑）

- **B1** 发布边界三项核对不紧挨写入：`await stillEligible` 期间换代/中止，gen1 结果仍发布（探针 A 输出 `published revision 1`，存储 basis.generation 1，当前 gen 2）。
- **B2** 旧代际迟到的 `not-sent` 页把重建后的新连接打成 `lost`：`table.lose` 不带代际，`lost` 重建沿用同一 `Connection` 对象（探针 B2）。
- **B3** 取页阶段无时限、`signal` 无效（探针 E：50 ms 时限 + 已中止仍 pending 400 ms）。
- **B4** `close` 与同键 `ensure` 竞争：活连接被 `forget`，进程不停、句柄不释放、`closeAll` 答空（探针 C）。
- **B5** 连接时限不覆盖 `acquire` 与 `landing.start`；`release` 跟着永远挂起（探针 D）。
- N1 端口 reject/抛出时条目停在 `preparing`，之后每次 `ensure` 抛 `TypeError`，句柄先于进程停止释放（探针 F）。N2 = 设计 D1。
- O1 一个主体被挡下会关掉同租户其他主体的连接（探针 G）；O2 旧采用修订的令牌 `ensure` 会关掉新修订连接并在旧材料上建连（探针 H）；O3 调用方中止把共享清单写成 `connection-unavailable`。
- 无问题：`gate.ts` 次序与品牌；`text.ts` 键文本单射；`table.ts` 无并发路径的次序；`discovery.ts` 的 basedOn/current 同读；`status.ts` 无披露；`store/memory.ts` 隔离。

## reduce 裁定（O1–O3）与第 2 轮

- O1：`disabled` 与 `local-command-not-enabled` 是接入点设置（契约 UE3「被设置挡下」、S1 末句「被禁用后关闭它的连接」），自动关闭按接入点级是对的；`not-eligible` 是主体级，不关闭。内存替身按主体设 block 是替身的近似，用例改用接入点级的设置来触发关闭，并在成员 SPEC 写明粒度。
- O2：`ensure` 不信任令牌里的采用修订：建连前重读 `AdoptionView.endpoint`，修订与令牌不同时答 `Refusal unknown`（「答复无法证明」，R1）并不建连、不关别的连接；`closeOthers` 只关修订不等于**当前读到的**修订的键；发布边界加第四项核对：清单所在连接的采用修订仍等于当前采用修订，否则 `kept(superseded)`。
- O3：同前裁定——调用方 `signal` 不进单飞建连，调用方中止只答 `kept(cancelled)`，不标记清单。
- B1–B5、N1、D1–D7、D9（公开状态口断言）、D10、D11、释放次序进 trace 进第 2 轮；D8 写成偏离与退出条件。

