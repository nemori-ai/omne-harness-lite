# tests 索引

<!-- documentation:placeholder -->

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

<!-- documentation:placeholder -->

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：公开入口的测试
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：`./cordis` 只导出 `agentHostPlugin`，及其名称与 inject 数组
- [host-support.ts](host-support.ts)：宿主测试的真实 Cordis 世界、依赖替身与 runtime 停用义务的测试包装
- [host-plugin.spec.ts](host-plugin.spec.ts)：装载、逐项缺席时的 PENDING、配置错误时的 FAILED、换提供者重跑与插件体结束
- [provision.spec.ts](provision.spec.ts)：实例取得的符合性套件对宿主真件、回收保护点、quiesce 失败与 unresolved、预约、发布与撤除
- [recovery.spec.ts](recovery.spec.ts)：恢复入口与无活体控制入口的读回、核验、跨租户拒绝、takeover 与突然失去依赖
- [stage-ports.spec.ts](stage-ports.spec.ts)：局部依赖端口的现取与缺席
- [fixtures/](fixtures/index.md)：测试固定输入
