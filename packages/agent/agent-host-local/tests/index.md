# tests 索引

<!-- documentation:placeholder -->

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

<!-- documentation:placeholder -->

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：公开入口的测试
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：`./cordis` 只导出 `agentHostPlugin` 与 `createAgentHostLocalPlugin`，及前者的名称与 inject 数组
- [host-support.ts](host-support.ts)：宿主测试的真实 Cordis 世界、依赖替身与 runtime 停用义务的测试包装
- [measure-plugin.spec.ts](measure-plugin.spec.ts)：`createAgentHostLocalPlugin({ measure })` 把观察者交给宿主建出的 runtime，经真实宿主的一次 invoke 发出受理段
- [tool-requests-plugin.spec.ts](tool-requests-plugin.spec.ts)：`createAgentHostLocalPlugin({ toolRequests })` 把 Tool 请求来源交给宿主建出的 runtime，Model 建议的 Tool 动作经来源 describe、prepare 后 invoke 一次；不传时 Tool 不被调用
- [host-plugin.spec.ts](host-plugin.spec.ts)：装载、逐项缺席时的 PENDING、配置错误时的 FAILED、`maxRunSteps` 原样交给 Agent 工厂（缺省时不另给值）、换提供者重跑与插件体结束
- [reception.spec.ts](reception.spec.ts)：Model 结果接收方登记在 Agent 的 consumer owner 下，推送的回复让 execution 越过 M1；供应方 400 的失败结果保存后 execution 以 no-reply 失败结束；有序停止撤销登记；宿主停机期间推送的结果在插件体恢复后只保存一次；outlet 答 `scope-unresolved` 时照样答 saved，维护驱动稍后送达账目（R2-D237）；时钟读不到一次后继续、等待加倍封顶、denied 停止并记 warn、插件体重跑后接续待办、被拒推送不覆盖 Access（R2-D250）
- [tool-reception.spec.ts](tool-reception.spec.ts)：Tool 结果接收方由子插件登记在 Agent 的 consumer owner 下，宿主在没有 Tool 两键时就绪；推送把 Tool 消费位置的 execution 作为路由交给目标查询；有序停止、目标查询撤除与宿主卸载都撤销登记（R2-D273）
- [ordered-stop.spec.ts](ordered-stop.spec.ts)：有序停止 `quiesceAll`：无实例 settled，drained 后卸载贡献 fiber，生产工厂的空闲实例 settled，unresolved、抛出与超过截止时 incomplete 并点名，停止开始后 `acquire` 被拒
- [run-failure.spec.ts](run-failure.spec.ts)：运行失败：Journal 对 I0 的提交答 unavailable，宿主写一条具名 warn，有序停止答 incomplete 并写出 execution、节点与失败种类（R2-D282、R2-D285）
- [provision.spec.ts](provision.spec.ts)：实例取得的符合性套件对宿主真件、回收保护点、quiesce 失败与 unresolved、预约、发布与撤除
- [recovery.spec.ts](recovery.spec.ts)：恢复入口与无活体控制入口的读回、核验、跨租户拒绝、takeover 与突然失去依赖
- [control-entry.spec.ts](control-entry.spec.ts)：控制入口对本宿主仍在运行的 runtime 的执行推进取消，Loop 不再发 Model 请求，重试不再写入，主体核验仍拒绝；守卫拒绝时不推进，Journal 收不到该主体的读写
- [stage-ports.spec.ts](stage-ports.spec.ts)：局部依赖端口的现取与缺席
- [line-through/](line-through/)：一条真实 Cordis 根上的线内组合用例与它的世界
  - `world.ts`、`cp3.spec.ts`：CP3，Session 输入到 Model 结果保存
  - `cp3-rollbacks.ts`、`cp3-rollbacks.spec.ts`：CP3 对只有 Session 参加的回滚的判定（R2-D152）与它的快层用例
  - `cp3-repro-loop.sh`、`cp3-repro-delay.sh`：CP3 连跑与加宽 AD-02 窗口的复现脚本（KL-146）
  - `w2-world.ts`、`w2-measure.ts`：波 2 的组合世界，每轮计数与测量事件记录器
  - `w2-rounds.spec.ts`：J1 三轮对话与 J2 工具结果进入下一轮请求；J2 另有一条：Tool 请求来源答 unavailable 时动作被拒，拒绝消息进入下一次请求，Run 以 completed 结束；还有一条（R2-D268）：动作被拒以后，第二步的模型结果带 reasoning_state，Agent 被唤醒、读到结果，回复只含文本块，Run 以 completed 结束。Model 替身的 sealed 校验不支持 reasoning_state，所以这一块由 W2 世界的 `modelDelivery` 在送达真实接收方之前加入
  - `w2-control.spec.ts`：J3 取消 Run 与 J4 只中断一个调用
  - `w2-handoff-restart.spec.ts`：J5 杀进程后按原身份读回准入记录
  - `w2-publication-bytes.spec.ts`：同一 Run 连做 20 轮 Tool 调用，经 session-adapters 的 `report` 比较第 5 轮与第 20 轮的最大一次发布（不超过加 8 KiB）；现在跳过，等终态 JO-4 后启用（R2-D294）
  - `w2-counts.spec.ts`：J6 固定轮数的读写计数与测量事件；默认 20 轮，`OMNE_J6_ROUNDS=200` 才跑 200 轮与增长判定，何时跑见 [README](README.md#j6-的两种轮数)
  - `growth.ts`、`growth.spec.ts`：增长判定的纯函数与快层单测（含负控），常量与 `tools/e9/metrics.mjs` 逐项相等
- [fixtures/](fixtures/index.md)：测试固定输入
