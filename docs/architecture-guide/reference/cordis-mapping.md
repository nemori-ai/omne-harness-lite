# Cordis 实现映射与来源

[指南首页](../README.md) · [本组索引](README.md)

## 目录

- [映射的地位](#映射的地位)
- [基础机制映射](#基础机制映射)
- [必须补足的契约](#必须补足的契约)
- [核对本项目的具体提供者](#核对本项目的具体提供者)
- [必要来源](#必要来源)

## 映射的地位

指南正文先定义语言无关的含义，本页记录其与具体内核机制的对应，供实现核对使用。它不把上游应用协议整体作为本项目设计，也不确定本项目最终采用的依赖版本。

研究依据固定为 DeepSeek 官方仓库提交 `c291e7961a515f6d7af9304e7fd1d257929aef26`。后续采用其他版本时，应重新核对相关语义；检索方法见 [Cordis 权威资料 skill](../../../.meta_harness/agents/skills/harness-design-handbook/canonical/references/source-check.md)。

## 基础机制映射

| 本指南概念 | 可对应的机制 | 仍需由能力契约确定 |
|---|---|---|
| 插件定义与运行实例 | 插件应用创建 Fiber，同一定义可多次应用 | 业务身份、实例职责和对外可用条件 |
| Context | 服务解析、事件和受管资源的运行入口 | 授权范围，以及哪些业务状态可以访问 |
| 服务与依赖 | 服务提供及声明式依赖注入 | 缺失时的业务响应、条目级绑定和在途使用政策 |
| 受管注册 | effect 和相应清理动作 | 异步任务是否已纳管，哪些资源需要有序结束 |
| 交互协议 | emit、parallel、serial、bail、waterfall | 是否等待、何时提交、谁决定结果及处理失败 |

这些对应关系由[官方 Primer](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-primer.md)和[Fiber API](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/fiber.md)说明。Fiber 的 uid 只表示该运行 Registry 内的实例身份，不能直接替代持久身份。

## 必须补足的契约

运行时等待所管理的清理，不会自动追踪未纳管的工作。当前实现会并发等待部分异步清理，并容纳部分清理异常；若业务要求先排空再关闭后端，需用明确的顺序和结果表达补足。[Fiber 源码](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/fiber.ts)

`waterfall` 是围绕后续处理的中间件组合，可以包装或短路；原始 `emit` 不等待返回的 Promise，也没有逐回调的通用异常隔离。业务要求的通知容错和提交语义由拥有操作的边界承担。[事件源码](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/events.ts)

贡献作用域、运行时不变量注册表和持久化协议属于可在内核之上实现的能力。上游 Scope 提供了父子贡献可见性与事件路由，但明确只适用于遵守该协议的接口，不是租户授权或安全沙箱。[Scope 文档](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/scope/README.md)

因此，采用 Cordis 不会自动获得租户隔离、状态迁移、可靠消息、跨进程写入权或规则证明。本指南相关专题规定应当说明的语义，再由合适的内核机制或其他成熟实现承载。

论文形式结果与组件作者义务的对应见[来源核对](../../research/cordis-proof-boundaries.md)。
使用理论结论时还需映射命题、观察范围和前提责任，不能将 effect API 的文档说明
当作实际提供者满足逆操作与交换条件的证明。项目证据门槛归[组合性质](../assurance/composability.md)。

## 核对本项目的具体提供者

本页提供通用映射与来源，不能替代某个包或应用的当前设计。具体正文位置和相互
导航由[组织规范](../../maintenance/organization.md#当前实现设计的归属)拥有。
按实际职责展开以下对应，纯数据或计算包无需描述不存在的 Fiber：

| 要解释的责任 | 具体设计中应能定位的对应 |
|---|---|
| 能力如何被提供或贡献 | 采用的精确契约、插件公共入口、服务键或注册目标，以及公共接口来源 |
| 消费者何时可工作 | 所需服务及条目、必需或可选条件、解析作用域、绑定时机、实际就绪及失效处理 |
| 谁拥有运行资源 | 挂载位置、Context/Fiber 所有者、注册与任务归属、清理责任及必要顺序 |
| 装载与卸载如何对应 | 实际建立的效应、对应撤除或交接、必须保留的事实、部分失败与清理完成判据 |
| 变化怎样影响在途工作 | 关闭准入、交接或结算、停止与释放分别由谁实现，失败后留下什么可观察事实 |
| 操作如何跨边界 | 服务调用或事件的输入、结果、提交与失败含义；应用如何选用提供者并完成启动与退出 |
| 用什么证据核对映射 | 实际发行物或 fork 身份、与研究来源的差异、公共产物及真实组合验证的范围 |

这里要求能找到责任，不要求复制一张统一表或预先固定每个内部函数。发现服务键
尚未确定，先判断消费者是否已经依赖它；发现撤除后的工作归属根本未定义，则回到
语义契约。不能用一份映射表补造缺失政策，也不能把全部框架细节塞入语言无关规格。

## 必要来源

上游使用源码内置的 Cordis 及 Loader 等基础库，并记录了影响生命周期和配置协调的本地修改。复用应核对实际源码与行为，而不仅比较版本号。[Vendored 清单与修改记录](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/README.md)

本指南采用的动态组合视角受 Context 范式启发。相关论文讨论空间、时间组合及其条件；其结论不是对任意业务插件和外部副作用的无条件保证。[A Programming Paradigm for Spatiotemporal Composability，v1](https://arxiv.org/pdf/2608.25512v1)

需要核对具体 API 时，再展开上述来源和对应源码、测试。不要为了理解指南正文而强制先阅读整个上游仓库；文档与实现不一致时，应明确报告差异，并确定当前设计依赖哪项已确认行为。
