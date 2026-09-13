# 本批源码集合与采用边界

本批选择 **10 个主体来源包和 4 个限定支撑来源包**。这里的集合是允许计划复用的
DSH 源码来源，逐包名称均带上游前缀 `@deepseek-ai/`；不是直接安装这 14 个 npm
包，也不要求创建 14 个 OMNE 包。逐文件导入仍须经过所属能力的设计、源基线与
施工计划验收。[设计计划](design-plan.md)规定门槛，[来源](sources.md)固定证据。

## 主体来源

| 来源包 | 本批复用的责任与价值 | 必须按本项目重新定义的边界 |
|---|---|---|
| `dsh-scope` | 贡献可见范围、事件路由与随作用域撤回的基础代码 | 与 Cordis Context 配合；不承载通用会话状态，不以 scope 充当租户授权或执行隔离 |
| `dsh-agent` | Registry、精确 Handle、Factory、实例占用与释放的基础 | 实现已接受 live-agent v1；现有 `/baseline` 仅为源原语基线，补齐租户、incarnation、准备/退出和依赖所有权 |
| `dsh-session` | Session 历史事实、追加记录与内存模型 | 租户身份、生命周期、事实分类、运行附着；共享内容契约不由 LLM 运行时反向拥有 |
| `dsh-session-projection` | 从历史重建的状态视图和受管投影贡献 | 明确每项状态的权威、版本及重建条件；投影不是任意可变状态袋，也不要求全系统事件溯源 |
| `dsh-session-persistence` | 持久化能力边界、读写句柄及 flush 协作的基础 | Session 存储契约、独占写入、提交/耐久确认、恢复验证、租户边界与失败保留 |
| `dsh-session-persistence-jsonl` | 单机 append-only 日志后端的读写、排空和文件管理基础 | 定向取用普通 JSONL 路径，采用项目格式；重新设计截断尾部、损坏、锁/租约、同步落盘与退出失败；不导入旧格式迁移、Zstd/native 和 Windows 专用桥接 |
| `dsh-agent-loop` | 模型—工具迭代、输入消费和停止协作的可复用驱动代码 | Run/Step、耐久队列、精确控制、`interrupt_then_run`、后台工具与恢复组合按 OMNE 规格实现 |
| `dsh-system-prompt` | 动态提示词贡献、章节/变量与请求内容装配机制 | 项目上下文装配契约、必需 skill、工具可调用集合、预算和版本绑定；移除 DSH 身份及应用默认策略 |
| `dsh-tools` | 工具定义 DSL、贡献注册、调用流水线、输入输出处理基础 | **新工具系统架构**：多命令单槽位、tool–skill 依赖、授权、独立调用生命周期、过程帧、后台、HITL、恢复 |
| `dsh-llm` | 模型服务、adapter 注册、准备绑定、消息和流事件处理基础 | **新模型系统架构**：统一 OpenRouter 出口、请求准入、模型选择/切换、多模态能力判定、流和费用归因、取消/失败/恢复边界 |

Session 提供稳定会话与状态能力，agent 提供活体原语，loop 驱动一次工作；prompt
组装模型可见内容，tools 执行动作，LLM 执行模型请求。这些责任通过 Cordis 受管
服务、插件和类型化事件组合，持久身份与精确承诺由语言无关契约约束。

## 限定支撑来源

| 来源包 | 允许复用的部分 | 范围限制 |
|---|---|---|
| `dsh-brand` | 品牌化标识的类型辅助 | 映射项目唯一身份定义，不复制一套上游业务 ID |
| `dsh-util-values` | JSON 值、快照、冻结等纯值辅助 | 只取实际被上述能力消费的代码，不发展通用工具框架 |
| `dsh-timeout` | signal、超时与取消协作的底层辅助 | 超时值与取消后果由能力契约决定，不引入 DSH 工具超时政策 |
| `dsh-attachment` | 共享媒体引用、数据类型及必要错误辅助 | 不纳入完整附件服务、上传准入、存储后端或隐式授权；与 Session/LLM 共同落实唯一内容契约 |

这些来源可以合并进具有真实责任的目标模块。提取时保留逐文件来源与许可，不为
保持上游包形状制造空包装；一个辅助文件也算来源复用，不能绕过集合登记。

## 依赖处理

下表处理固定源码的清单依赖与源码引用中，集合之外的 DeepSeek 组件；这是裁剪
方向，不声称原包已经形成可安装闭包。完整文件裁剪、生成产物、构建配置、普通
第三方版本和 lockfile 在相应导入计划中给出，隔离构建验证最终闭包。

| 上游依赖或引用 | 本批处理 |
|---|---|
| `@deepseek-ai/cordis` | 直接消费官方发布包；当前 agent 基线为 4.0.2。其正常官方依赖闭包不作为 DSH fork 集合 |
| `dsh-typert-protocol` 及 Typert 生成桥接 | 删除远程管理 mixin、导出和类型耦合，使用原生 Cordis 服务入口；将来的跨进程协议另按真实需求设计 |
| `dsh-invariants` | 不搬上游全局检查与生成体系；保留有用源测试，目标保证由正式契约、实际操作约束及相称验证兑现 |
| `dsh-settings` | 不引入上游设置/UI 命名空间；消费本项目设置、定义及授权的既有要求，具体提供者契约必须先设计 |
| `@deepseek-ai/schemastery` | 不随源码导入；配置/参数适配采用项目 JSON Schema 契约与普通校验实现，具体库和映射由实施计划固定 |
| `dsh-util-crypto` | 所需散列/随机辅助使用标准运行库实现；不引入整套上游 utility 包 |
| `dsh-code-runtime`、`dsh-code-runtime-worker-thread` | 去掉 PTC/代码执行路径；PF-024 的多命令工具并不要求执行模型生成的程序 |
| `dsh-user-approval` | 不采用其应用批准协议；新 tools 架构与项目耐久 HITL/决策池契约组合，设计缺口不能用自动批准填补 |
| `dsh-tool-call-timeout-policy` | 不导入应用超时政策；按本项目调用控制和后台要求确定政策 |
| `dsh-session-format`、`dsh-session-format-catalog`、`dsh-session-format-v2-to-v3` 及其旧版迁移链 | 不导入 DSH 历史格式/兼容迁移子系统；JSONL 后端改用项目的明确版本与校验契约 |
| `@deepseek-ai/node-addon-system`、Koffi、Zstd 相关代码 | 从所取 JSONL 后端路径去除；不能仅改 `compression=none` 就宣称去掉顶层导入。若平台持久性需要新后端选择，先完成该选择及验证 |

集合内依赖也必须改为项目公开入口。特别是 LLM/attachment、Session/LLM 的历史
类型依赖，要围绕唯一共享内容契约消除能力之间的倒置与循环；JSONL 引用 LLM 的
通用错误辅助不能成为存储后端依赖模型运行时的理由。

## 明确排除的来源

- `dsh-agent-presets`：应用装配由本项目编写，Definition/默认配置按产品要求设计。
- `dsh-llm-deepseek`、`dsh-llm-pi-ai`：不纳入本批 fork。模型能力必须交付 OpenRouter
  提供者；在新模型架构中选择普通 SDK 或 HTTP 实现，不沿用可绕过统一出口的装配。
- `dsh-jobs`、`dsh-jobs-local`：不纳入本批来源；独立工具执行所有者和后台接续仍是
  必须兑现的能力，先建模，再按已定边界实现。不能把留在 loop 的 Promise 视为后台支持。
- `dsh-session-projection-cache`、上游存储/设置/凭据栈、完整附件后端及格式迁移包。
- Shell、filesystem/workspace、Browser、Computer、沙盒、MCP、具体工具目录、应用/UI/Gateway
  和其他未列名的 DSH 包。本批可用受控测试工具验证组合，不能宣称 PF-012 等已交付。

这是**本批来源集合**，不是完整产品能力集合。未选择某个 DSH 包不撤回对应产品
要求；HITL、授权/资产、预算、执行资源等设计和提供者仍须按组合需要落实。

## 维护和变更

所有选定 DSH 源码由本项目维护，可以拆分、重组和修改；不维护未经要求的上游 API
兼容层。上游根许可为 MIT，复制部分仍须保留版权与许可；逐文件和第三方许可在
每次导入清单中核对，原始报告继续留在 `tmp/`，见[必要来源](sources.md)。

`packages/core/` 只放已明确接受的内核原语；agent 的目标归入 core，scope 的公共
原语在其设计验收后归入 core。其余能力、后端和应用按[源码布局](../../maintenance/workspace.md)
落实，不能因为属于本批核心产品能力就全部进入内核。当前 `packages/agent` 源基线
的位置和用途未因本文件改变。

该集合不允许安装依赖时自动扩张。新增来源、纳入原本排除的子系统、扩大 attachment
等限定范围，均先说明新的需求/证据、修订采用决定和受影响设计，再进入导入。
在选中范围内删除无用代码或用标准库替代辅助，不要求保留形式上的 14 个成品包。
