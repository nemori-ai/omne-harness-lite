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
- [host-plugin.spec.ts](host-plugin.spec.ts)：装载、逐项缺席时的 PENDING、配置错误时的 FAILED、换提供者重跑与插件体结束
- [ordered-stop.spec.ts](ordered-stop.spec.ts)：有序停止 `quiesceAll`：无实例 settled，drained 后卸载贡献 fiber，unresolved、抛出、生产工厂的 unavailable 与超过截止时 incomplete 并点名，停止开始后 `acquire` 被拒
- [provision.spec.ts](provision.spec.ts)：实例取得的符合性套件对宿主真件、回收保护点、quiesce 失败与 unresolved、预约、发布与撤除
- [recovery.spec.ts](recovery.spec.ts)：恢复入口与无活体控制入口的读回、核验、跨租户拒绝、takeover 与突然失去依赖
- [control-entry.spec.ts](control-entry.spec.ts)：控制入口对本宿主仍在运行的 runtime 的执行推进取消，Loop 不再发 Model 请求，重试不再写入，主体核验仍拒绝；守卫拒绝时不推进，Journal 收不到该主体的读写
- [stage-ports.spec.ts](stage-ports.spec.ts)：局部依赖端口的现取与缺席
- [line-through/](line-through/)：一条真实 Cordis 根上的线内组合用例与它的世界
  - `world.ts`、`cp3.spec.ts`：CP3，Session 输入到 Model 结果保存
  - `cp3-rollbacks.ts`、`cp3-rollbacks.spec.ts`：CP3 对只有 Session 参加的回滚的判定（R2-D152）与它的快层用例
  - `cp3-repro-loop.sh`、`cp3-repro-delay.sh`：CP3 连跑与加宽 AD-02 窗口的复现脚本（KL-146）
  - `w2-world.ts`、`w2-measure.ts`：波 2 的组合世界，每轮计数与测量事件记录器
  - `w2-rounds.spec.ts`：J1 三轮对话与 J2 工具结果进入下一轮请求
  - `w2-control.spec.ts`：J3 取消 Run 与 J4 只中断一个调用
  - `w2-handoff-restart.spec.ts`：J5 杀进程后按原身份读回准入记录
  - `w2-counts.spec.ts`：J6 固定轮数的读写计数与测量事件；默认 20 轮，`OMNE_J6_ROUNDS=200` 才跑 200 轮与增长判定，何时跑见 [README](README.md#j6-的两种轮数)
  - `growth.ts`、`growth.spec.ts`：增长判定的纯函数与快层单测（含负控），常量与 `tools/e9/metrics.mjs` 逐项相等
- [fixtures/](fixtures/index.md)：测试固定输入
