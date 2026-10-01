# D4 后继独立验收：历史绑定与等待状态

结论：本次明确派发的四项剩余义务均补到真实组合，新增 2 测通过；无确认产品缺陷。它补充而不重跑前次 9 测，不把 11 个测试数字本身当作完整 D4 的接受。最终完整 D4 的判定仍由 root 将前次逐门报告、此补充与 HUB 集成结果合并负责。

提交 `6abdc7087aa6b0b9dfda40d6a128445ddbe52975`，父提交 `d2cf6bcbfacb793c51e6fd7cd45f271cd5bd0843`。分支 `panqiwei/model-request-runtime-d4-acceptance`。唯一源码变更为新增 `examples/model-invocation-minimal-demo/tests/acceptance-d4-lifecycle.spec.ts`，不改产品、既有测试、规范或依赖。

## 精确依据

- 当前 HUB TODO T14 明列历史锚取得旧实现与三状态引用保持；DELIVERY-SCHEDULE-rev7 / IMPLEMENTATION D4 的新调用新绑定、旧调用固定 lease、实际停止排空、配置历史/租户隔离沿前次报告。
- RT10 `contract.md` SHA256 `add7ff23a73a6ad5a749f40f6707f408f60d33b6032080ad6ba4751f10d5695c`，实际字节与当前 HUB 相同。S-53 第 1～5 款、S-28/S-29、S-33、S-49/S-73；既有 S-54/56/58/61/64 门沿首批逐项报告。
- runtime v13 acquire realization SHA256 `777ae873be40ef1c6661a69036b91c034c7e809ebe65d3ebaafc05a4114f306c`，与 HUB 相同。D100/D101/D107、transport v9/v10/v11/v12 和 UCT-V8 的接受依据沿 adopted-inputs.json，不采用历史 candidate 段。没有增加提供者保证或改口径。

## 已有证据对账（只读，没有重跑）

| 既有位置 | 真正证明的内容 | 不足以关闭的本次义务 |
| --- | --- | --- |
| runtime tests/service-calls.spec.ts:406/493/541 | 实际日志夹具中的续接分支；acquire 三分返回映射 | `forceResumable` 构造历史、transport stub lease，不能当实际进程丢失与旧贡献重新取得 |
| runtime tests/service-dispatch.spec.ts:254/278/451/462/646 | reply_pending 与 release 计数的运行时组合 | release 是 stub 计数，不证明生产 registry 退役在等待状态被阻止 |
| demo tests/model-service-retry-control.spec.ts:122 | 实际目录/JSONL/TLS：503 → awaiting_decision → retry → reply_pending → consumed | 没有旧贡献退役与 registry 引用观察 |
| demo tests/model-transport-service.spec.ts:170 起 | 真 Cordis Pro → Flash 热更新，活动 reader 持旧引用，实际停止后清理 | 非显式三等待状态与历史 resume 证明 |
| demo tests/model-recovery-host.spec.ts:31/110；cold-supervisor.spec.ts:81/129 | 实际 host 停止、JSONL 认回、SIGKILL 冷恢复 | 未换代或移除旧定义后显式续接；正常 host stop 走 S-36 interrupted，不能冒充 resumable |

## 新增精确承诺 → 结果

| 必经门 | 独立真实路径 / oracle | 结果 |
| --- | --- | --- |
| awaiting_decision 保留原引用 | lifecycle:206；真实 503 结算后 readAttempts 明确 awaiting_decision、生产 registry refs=1/executions=0；注册 B 后 dispose A，retiring=1/regs=2，dispose 尚未完成；沿原调用 dispatchAgain 实际仍发 A | Pass |
| reply_pending 保留原引用与结算后释放 | 同用例；实际完成 SSE 并 readAttempts 明确 reply_pending，A 仍 refs=1/retiring=1/executions=0；settleReply consumed 后 dispose 才完成、regs=1/refs=0；同处置重复返回原 complete，引用不变 | Pass |
| 历史锚恢复不加载/代换实现 | lifecycle:342；真实生产 supervisor 子进程，在 TLS 接收请求后、发送任何响应头前 SIGKILL；waitWorkerExit 实际 exit+close、server socket close；新进程只装载 B（Flash）和原实际 SQLite/JSONL；reconcile 得唯一 resumable、refs=0、总请求仍 1。把当前选择切 B 后用原 callId 续接，因 A 缺失 unavailable，日志全体不变、refs=0、零新 HTTP | Pass |
| 显式续接重新取得旧精确实现 | 同用例；通过真实 Cordis createModelPlugin 恢复原 A 定义与合法 meter；openCall 返回原 callId/resumable。随后真实发送仍 A，即使当前选择 B。两条耐久 dispatched 的完整 adaptation 与 profileSnapshot 相等，且明断原 A modelId、definition revision、implementation | Pass |
| resumable 保留原引用 | 同用例恢复 A 后 readAttempts 明确 resumable、refs=1/executions=0；dispose A 停新准入并等待；原调用仍可 dispatch，reply_pending 仍持有 A；settleReply 后 dispose 完成、refs=0/executions=0/retiring=0 | Pass |

冷恢复的 trusted owner 范围明确：测试独占创建的数据根只交给该实际 supervisor worker；新 owner 的 observeExit 只认那个精确 workerIdentity，且以真实 exit+close 观测为条件，其他 identity 返回 unknown。covered 由这次实际退出观测生成。没有 PID 猜测，没有为任意历史 writer 返回恒真，没有模拟历史、生产 waiting owner 或 Run。

## 命令、原始证据与限制

在本 spoke，使用此前已建的本树最小依赖闭包与独立 dist；没有再次 build、没有跑前次 9 测。

```bash
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo exec vitest run tests/acceptance-d4-lifecycle.spec.ts --maxWorkers=1
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run typecheck
pnpm exec prettier --check examples/model-invocation-minimal-demo/tests/acceptance-d4-lifecycle.spec.ts
```

`lifecycle-final.log` 2/2，exit 0；`lifecycle-types-final.log` exit 0；`lifecycle-format-check.log` exit 0。原始真实 SQLite、JSONL、生成的本地 TLS 测试密钥和诊断在 `waiting-states-*` 与 `historical-*`。只有受控 TLS，无收费调用或生产凭据。

失败也保留：`lifecycle-1.log` 第一用例在 model stage activate 之前取 provider，fixture 时序错；第二真实 cold 用例已通过。`lifecycle-types-1.log` 是测试从 JSON 取出的 string 没经 prepareSession 获得 branded SessionRef，后续改为真实返回值。`lifecycle-2.log` 最后重复 settleReply 错预期 alreadyEnded；核 RT10 S-49/S-73 同处置认回必须返回原结果后，修正测试为严格原 `{callId,state:complete}`。此前所有等待引用断言与 cold 用例均通过，未放宽产品 oracle。

## 最终必经未覆盖清单

本次指定的历史锚与三等待状态：**无剩余未覆盖项**。这些义务已由上述真实组合逐项覆盖，而非测试名称推断。

整项 D4 在 root 接受之前仍必经：

1. 将本后继精确提交合入当前 HUB，按实际整合版本运行新增文件，并复用 root 对首批提交 `78ffcbeb` 的真实 7+2 结果；若相关 provider/runtime 再变，复验受影响 oracle。本 spoke 的 Pass 不能替代 HUB 组合结果。
2. root 对首批 README 逐门与此补充进行最终范围对账/接受。首批 D4-C 的 reader 限制仍如实保留：共享既有 reader 实现，没有任意 JS reader 热补丁场景或独立 reader 注入口；实际旧 plan/reader/phi/binding固定及跨代际 phi 两个负控已在首批证明。本补充不新增“任意模块在线替换”保证。

未新增必需产品接口缺口。37 模型逐个认证属于 D7；外域 Run、通用 assets/平台、D6 全实例治理与任意 writer 恢复不是本 D4 model vertical 验收声明。历史非法配置映射的输入拒绝已有前次真实新调用三分证据；本次没有篡改合法耐久锚制造非法配置，也不把这个不存在的历史变体猜成产品缺陷。

所有本次测试和 typecheck 进程已退出，真实 child 已 exit+close，TLS 已 close；不需保留空进程。该 spoke 与 own tmp 可在 root 保全所有独有证据并完成读取后退休。
