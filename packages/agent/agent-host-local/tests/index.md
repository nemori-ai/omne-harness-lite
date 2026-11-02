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
- [provision.spec.ts](provision.spec.ts)：实例取得的符合性套件对宿主真件、回收保护点、quiesce 失败与 unresolved、预约、发布与撤除
- [recovery.spec.ts](recovery.spec.ts)：恢复入口与无活体控制入口的读回、核验、跨租户拒绝、takeover 与突然失去依赖
- [control-entry.spec.ts](control-entry.spec.ts)：控制入口对本宿主仍在运行的 runtime 的执行推进取消，Loop 不再发 Model 请求，重试不再写入，主体核验仍拒绝
- [stage-ports.spec.ts](stage-ports.spec.ts)：局部依赖端口的现取与缺席
- [fixtures/](fixtures/index.md)：测试固定输入
