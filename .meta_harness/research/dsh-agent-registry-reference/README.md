# DSH AgentRegistry 的活引用与生命周期边界

核对官方 registry 的服务门面、身份解析、factory 委托及生命周期边界。调查由产品负责人明确提出；本包记录固定上游事实，不接受本项目架构，也不授权复用 DSH Agent。

- 调查对象：deepseek-ai/deepseek-harness `639ed015397290b3745d163aafe02ffee4aa3f84`；限定 agent 包的 index.ts、README、agent.spec.ts。
- 消费者：[模型调用引用与生命周期提案](../../design/record/proposals/model-runtime-reference-lifecycle/README.md)。
- 最近核对：2026-09-29；来源在 [source-manifest.json](source-manifest.json)。

## 准入核对

官方固定修订三份原文已取得；调查执行者核 raw Git blob SHA-1 与 contents API 相等。入库者重新取得三份 raw 并逐项核 SHA-256，复读本包依赖的门面、factory、登记/撤除、查询与销毁声明。没有运行上游测试、没有核实际 agent-loop factory；文档中的完整撤除顺序差异保留为未知。原文仅留私有临时取证，长期复核按固定 URL 与哈希重新取得。

## 按问题阅读

| 问题 | 正文 |
|---|---|
| 哪些事实成立、不能怎样推广 | [research.md](research.md) |
| 取得方式、精确来源、测试强度及冲突 | [evidence.md](evidence.md) |
| 源码修订、URL、字节哈希 | [source-manifest.json](source-manifest.json) |
