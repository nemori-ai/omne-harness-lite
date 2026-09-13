# 来源与维护范围

源仓库 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，
固定 commit `c291e7961a515f6d7af9304e7fd1d257929aef26`；
dsh-agent 源版本 `0.1.5-rc.2`。本包是选择性源码导入，不是整个上游 Git 仓库的镜像，
也不跟踪自动更新。后续修改由 OMNE 负责，按自己的接受契约演进。

`upstream/` 保存选定原件，不编译、不打包；[来源清单](provenance.json)记录原路径、
原始 SHA-256、活动路径与改动。许可文件 [LICENSE](LICENSE) 保留
`Copyright (c) 2026 DeepSeek` 和完整 MIT 文本，随 tarball 分发。
后续贡献继承该文件的许可；来源记录不能替代实际版权声明。

## 导入与差异

| 活动文件 | 来源与处置 |
|---|---|
| `src/index.ts` | 保留 index 的登记、公告/撤除、factory 追踪和 initiator 算法；去除 Typert 桥接与附属导出，接口引用本包窄类型；工厂 JSDoc 限定为实际委托保证 |
| `src/types.ts` | 由原 index/types/runtime-types 投影机制必需接口；不复制 Session 日志、Loop/inbox、LLM 或序列化类型，不声称 SessionRef/AgentRef |
| `src/dispatch.ts` | 保留 emit/serial/waterfall 和 subject/carrier 耦合，改为内部 scope；去除 system-prompt 装配 helper；明确自带 carrier 的匹配前提 |
| `src/scope.ts` | 复用同 commit 的 scope/index.ts 作为共享源辅助；本批补齐 store 导出并公开 scope-baseline，不声明目标 scope 产品契约 |
| `tests/agent.spec.ts` | 16 个原测试中保留 14 个；删去 Typert 桥接和 Agent.cancel 类型用例，因为相应接口未导入。身份 fixture 不再实例化 DSH Session；Loop 事件换为测试局部声明 |
| `tests/agent-initiator.spec.ts` | 保留全部 12 个案例，调整包名及窄身份 fixture |
| `tests/scope.spec.ts` | 保留全部 11 个案例，只调整为本包内部构建产物入口 |
| `tests/dispatch-integration.spec.ts` | OMNE 新增：waterfall 路由/故障、实际 caller owner 卸载 |

源测试中的预期不改成目标 v1 的语义。后续实现差异以
[目标映射](../../docs/proposals/agent-runtime/v1/source-mapping.md)为准；
保留测试的数量不是产品规格覆盖率。源基线检查表与原模型继续按原身份保存。

## 官方依赖

直接使用官方 Cordis 4.0.2，tarball URL、registry 完整性与下载 SHA-256 记录在来源清单，
实际依赖树由根 pnpm-lock.yaml 固定；不修改 Cordis，不使用 vendored alias。
Cordis 的必要发行依赖 cosmokit 与 Standard Schema 随正常依赖闭包安装；没有引入
DSH Session、LLM、Typert、preset、loop 或 Cordis 的可选 loader/include。

## 复核方式

`pnpm --filter @omne-harness-lite/agent check` 检查保留原件的 SHA-256，
与已有源 baseline 的交集再作比对。新增 scope 原件已按固定 commit 官方源码核对；
差异可直接比较 `upstream/` 与 `src/` 或 `tests/`。当前编译投影的具体选择由
[初次已评审计划](../../docs/proposals/agent-runtime/fork/plan.md)解释，不能自动扩展为下一阶段设计。

本批 scope/store 增量按 [核心来源计划](../../docs/proposals/core-capabilities/fork/plan.md)
接受，source-baseline 唯一活动 scope 同时供 agent 与新源码模块消费；保留 store
原算法及原测试，仅重定位导入。包检查器的来源路径同步至此前已迁移的 source-baseline。
