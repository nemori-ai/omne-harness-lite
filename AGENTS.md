# `omne-harness-lite` 开发约定

## 项目心智模型

`omne-harness-lite` 是一个更轻量化、更高性能的 OMNE harness 系统，以
DeepSeek 提出的 Cordis 为内核，同时保留和遵循原
`omne-next/omne_harness` 的核心设计理念和最佳实践，旨在提供一个能够超长期
待机、稳定运行、持续进化的个人智能助手所需的全部能力。Cordis 只提供内核
机制；Agent Loop、Harness 层、工具协议、治理和其他子系统由本项目自行实现。
不要把 DeepSeek Harness 当作本项目的实现，也不要把本项目称为 Cordis Harness。

当前处于设计阶段。设计应保持编程语言无关，能够作为未来严格验证和跨语言
复现的规格依据。实现是规格的一个实现，不是规格的替代品。

第一版完整交付是单机系统；设计阶段必须确保关键机制、模块和子系统具备清晰的边界，使其未来可以独立扩展为分布式、异构物理节点和微服务化部署，而不改变领域语义。

从第一天起支持租户隔离；关键聚合根必须显式携带租户身份，所有跨租户访问默认拒绝。租户建模沿用 `omne-next/omne_harness` 已定义的双层结构。所有模型请求统一经 OpenRouter 发送。

项目目前处于快速迭代和实验性演进阶段，尚未正式上线或对外提供生产服务。只要有明确的设计和验证依据，应接受合理的大胆重构，不为旧版本保留未经要求的实现兼容层。

建模时站在 DSH Cordis 的视角：把可替换的能力表达为有生命周期、作用域和所有权的插件或服务，通过 Context、依赖注入和类型化事件组合；把领域不变量、身份和状态转移保留在语言无关的领域契约中，不把 Cordis 的运行时对象直接当作领域模型。

## 研发品味

- 先保护不变量，再选择抽象；抽象必须隔离真实变化或承载明确契约。
- 先做最小的正确模型，再按真实需求扩展；不要为想象中的未来预埋框架。
- 复杂度必须有收益证据。没有可重复的瓶颈测量，不引入优化性复杂度。
- 让状态、所有权、生命周期、失败和副作用显式可见；不依赖隐藏的全局状态或隐式顺序。
- 一个概念只保留一个权威来源；规格、实现、测试和文档冲突时先解决归属。
- 全系统共享同一套领域建模；表达同一事物的领域结构、值对象和契约必须复用其权威定义，即使跨越 bounded context 也不得无理由重定义。只有语义确实不同，或只是面向外部边界的投影、传输形状时，才允许使用不同表示，并明确映射关系。
- 优先组合和直接表达，删除没有独立行为、契约或边界价值的包装层。
- 在满足规格、边界和可验证性的前提下，优先复用成熟实现或第三方库；只有现有实现无法满足要求时才从零构建。
- 外部 emission 不因被运行时调用就变得可逆；恢复、补偿、幂等和撤销必须区分。
- 让错误尽早暴露；禁止静默吞错、假成功和无法解释的默认行为。

详细的反模式与防御原则见 [`docs/defensive-patterns.md`](docs/defensive-patterns.md)。需要判断设计是否过度、实现是否偏离这些品味时，使用
[`engineering-taste`](.agents/skills/engineering-taste/SKILL.md) skill。

## 信息来源与边界

- Cordis 特性、生命周期和 API 语义优先查阅
  [DeepSeek Harness 官方文档](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs)，并记录具体页面或版本。
- 官方资料未覆盖的内容必须标记为假设，并通过源码、测试或小型验证补足证据。
- 不把模型检查、测试通过、论文结论或实现经验表述为无条件的形式化证明。
- 用户明确的新要求优先于历史交接文档或过时的研究草稿。

## 文档地图

- [`docs/architecture.md`](docs/architecture.md)：当前架构投影和系统不变量。
- [`docs/defensive-patterns.md`](docs/defensive-patterns.md)：运行时、并发、生命周期和资源边界的防御性原则。
- [`spec/`](spec/)：语言无关的 TLA+、Alloy、JSON Schema 和验收场景。
- [Cordis 资料 skill](.agents/skills/cordis-authoritative-docs/SKILL.md)：权威资料检索约定。
- [`write-agents-md`](.agents/skills/write-agents-md/SKILL.md)：需要编写或审查 AGENTS.md 时按需展开的提示治理方法。

AGENTS.md 只保留项目心智模型、地图、品味、红线和导航；具体领域契约、操作流程和工具命令归其专属文档或 skill。
