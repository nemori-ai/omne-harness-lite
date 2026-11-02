# Cordis 集成

本包是 `module` 变体，没有 `src/cordis.ts`，不依赖 `@deepseek-ai/cordis`。

## 适用性

本包不需要 Cordis 集成。它只提供两个纯工厂与静态材料，不持有资源，不提供服务。把它接进插件树是 `tool-records` 行的职责：该行在 `tool-host-local` 的 `./cordis` 里构造记录仓、账本与启动协调器（D2 候选第 5 节），随波 B 交付。`documentation.json` 把本文件记为 `not-applicable`。
