# 项目 subagents

角色源包在本目录维护，原生文件分别生成到 `.codex/agents/` 和 `.claude/agents/`。
共享正文拥有职责与边界，宿主配置和模型适配单独维护；不把生成文件当作独立来源。

| 角色 | 使用时机与交付 | 定义与配置 |
|---|---|---|
| architecture-reviewer | 完成一次架构设计、已有可识别的待审稿后，独立返回有依据的问题和未决事项；只读，不批准或修复 | [共享正文](architecture-reviewer/role.md)、[Codex](../../.codex/agents/architecture-reviewer.toml)、[Claude Code](../../.claude/agents/architecture-reviewer.md) |
| spec-reviewer | 针对已给设计检查规格表达的完整性、明确性与规范性；不裁决业务正确性/合理性，不审施工拓扑 | [共享正文](spec-reviewer/role.md)、[Codex](../../.codex/agents/spec-reviewer.toml)、[Claude Code](../../.claude/agents/spec-reviewer.md) |
| plan-reviewer | 以设计和规格为前提，检查实施可行性、依赖与并行安全、写入及集成归属和验收证据；不重审规格正文 | [共享正文](plan-reviewer/role.md)、[Codex](../../.codex/agents/plan-reviewer.toml)、[Claude Code](../../.claude/agents/plan-reviewer.md) |
| kernel-developer | 实现已明确划入内核的基础原语及生命周期机制；默认 xhigh | [专门职责](kernel-developer/role.md)、[Codex](../../.codex/agents/kernel-developer.toml)、[Claude Code](../../.claude/agents/kernel-developer.md) |
| capability-developer | 实现能力及能力组合的行为、状态转换和规则；默认 high | [专门职责](capability-developer/role.md)、[Codex](../../.codex/agents/capability-developer.toml)、[Claude Code](../../.claude/agents/capability-developer.md) |
| infrastructure-developer | 实现具体技术后端与提供者，兑现资源、持久性、取消和失败契约；默认 high | [专门职责](infrastructure-developer/role.md)、[Codex](../../.codex/agents/infrastructure-developer.toml)、[Claude Code](../../.claude/agents/infrastructure-developer.md) |
| application-developer | 消费能力，实现应用装配和 API/CLI/Web 交互；默认 medium | [专门职责](application-developer/role.md)、[Codex](../../.codex/agents/application-developer.toml)、[Claude Code](../../.claude/agents/application-developer.md) |
| verification-developer | 开发跨模块验证、故障注入、形式工具适配和构建检查设施；默认 high | [专门职责](verification-developer/role.md)、[Codex](../../.codex/agents/verification-developer.toml)、[Claude Code](../../.claude/agents/verification-developer.md) |

## 架构责任与独立并行

开发角色按架构责任区分，具体任务按能力纵线、交付物与授权范围划定。核心产品语义
不限于内核；Session、工具、模型和审批等能力及其组合可以承担核心保证。具体内核
清单仍由[当前架构](../../docs/architecture/README.md)和采用的规格确定，不能根据
角色名称反向划定包、服务或子系统。跨能力复用本身也不是进入内核的理由。

Cordis 的服务、依赖和生命周期机制支撑运行时组合；逻辑分层继续约束责任与依赖。
各角色可在自己负责的实现中使用 Cordis，不将所有插件集中给内核开发者。能力可有
自己的 runtime，后端提供者也须负责实际执行生命周期；基础原语、能力行为和具体
后端的边界按[能力契约](../../docs/architecture-guide/modeling/capabilities.md)区分。
存储后端的持久性与能力的恢复接续分别兑现对应契约，不能把读取成功当成工作恢复。

每条纵线可以有多个角色协作，同一角色也可以有多个独立实例。分层的前置关系首先
体现在采用契约和必要交付上，不强制把五个角色排成流水线，也不要求每条纵线使用
全部角色。接口确定后，消费者、提供者、交互与验证设施可依计划分别推进；真实组合
仍需核对实际参与版本和端到端行为。

| 功能纵线示例 | 能力及组合责任 | 具体后端责任 | 应用责任 |
|---|---|---|---|
| 工具与 shell | 调用控制、后台关系、恢复后关联原调用 | 执行资源、实际进程状态、控制结果与输出 | 状态呈现、操作提交、过程展示 |
| Session 恢复 | 从持久事实恢复到合法接续位置，关联未完成工作 | 持久性边界、读取及故障结果 | 恢复状态与操作反馈 |
| HITL | 耐久待答、合法答复、对应工作接续 | 存储及通知等提供者的真实保证 | 请求呈现、答复提交与状态更新 |

这些是派发归属示例，不接受具体产品协议。内核角色仅在涉及已明确内核机制时参与；
验证角色按任务实现跨边界场景，各实施者承担自身测试。取消受理不代表实际停止，
答复提交也不代表已经接续，交接应表达契约要求的事实。

派发者为每份交付物明确写入负责人，为需要组合的功能指定组合交付负责人。后者
核对交接并完成授权范围内的组合验证，不自动取得其他范围的写权、委派、Git 合并
或最终接受权。共享接口、Schema、锁文件和装配文件指定单一写入归属；规则与本次
填写项分别归[共同契约](developer-contract.md)和[派发模板](developer-task.md)。

## 开发者的提示词与派发

五个开发者共享[行动契约](developer-contract.md)。生成器将各角色 `role.md` 与共同契约
直接组合为完整角色提示词；`assembly.toml` 拥有共用来源及默认 effort。共同契约和角色
正文都面向执行者，不混入给维护者的说明，也不依靠执行者二次读取来获得开工与停止边界。
[派发模板](developer-task.md)面向派发者，填写后成为本次任务消息，不进入固定提示词。

实施前必须齐备完整目标边界、验收标准清单、实施规格和施工计划。开发者可在给定
约束内自主选择方案；发现验收不合理、不可达或必须破坏规格时，停止实施并上报。

实施规格按[设计就绪](../../docs/maintenance/spec-maintenance.md#设计就绪与实施入口)
覆盖本任务需要的语义、提供者/装配映射与跨能力交接；纯局部内部选择继续由实施者
自主决定。长期正文与延期义务进入各自拥有者，不由四份输入重新复制一套规格。
派发者负责归并澄清、协调共享文件和接口、安排集成及接受，不让 worker 自行修改判据。
角色划分表示专长，不固定包划分或任务数量；租户隔离和自身变更的测试是共同职责。

Codex 使用 `gpt-5.6-sol`，Claude Code 使用 `opus`。各角色 description 明示默认档位，
派发者可按工作规模和复杂度在 medium/high/xhigh 中调整。按角色源配置生成本次设置：

```sh
uv run --locked python .agents/skills/design-subagents/scripts/render_pair.py \
  --source .agents/roles/kernel-developer --dispatch codex --effort high
uv run --locked python .agents/skills/design-subagents/scripts/render_pair.py \
  --source .agents/roles/kernel-developer --dispatch claude --effort high
```

省略 `--effort` 即选择该角色默认值。命令仅输出 JSON，不发起调用。

- Codex：原生文件省略会覆盖派发值的 effort；派发者将 JSON 中的角色、模型及
  reasoning_effort 传给支持这些参数的派发工具，并另行附上完整任务消息。
  **直接调用角色却不传 effort，会沿宿主规则继承，不保证使用本项目的角色默认值。**
- Claude Code：原生文件带默认 effort；临时调整用生成的完整 JSON 作为该次启动的
  `--agents` 参数，同名会话定义覆盖项目文件。并行任务使用各自会话定义，不能反复
  改同一份项目文件。此 JSON 包含正文、模型和工具设置，不可只用一个 effort 字段替换它。
- 两端都核对实际模型、档位与组织限制；参数不可应用时返回派发能力缺口，不静默
  换模型或把提示词里的档位文字当成已生效。Claude 的 `opus` 按宿主/提供方解析。

模型支持、表达依据及本次实际验证范围见[开发者验证记录](developer-verification.md)。

## 架构评审派发

派发时提供仓库/检出位置、待审文件或设计正文、可识别的版本/快照、设计目标和评审范围。
附上相关需求的确认范围与采用快照；比较修订时再提供比较基线。接受状态可以仍是候选，实施计划不是这个评审角色的前置要求。
例如：“使用 architecture-reviewer，评审当前检出中指定提案的本轮设计；目标与约束见所附材料，
范围限于变量提供者撤除和在途使用，仅返回意见。”仅修改链接或文字不触发一次架构评审。

## 规格与计划评审派发

三个 reviewer 按判断对象分工，不能把同一个问题分别计为三轮审计；共同的只读、
证据和版本纪律不意味着业务职责重叠。

架构评审核对目标/需求到不变量及安全/进展性质的推导、机制的保护位置和证明
适用性；规格评审核对给定设计的准确表达；计划评审核对证明、探针和组合验证
是否有生产者及正确依赖。具体规则归[性质推导](../../docs/architecture-guide/assurance/invariants.md#从目标与需求推导性质)、
[组合性质](../../docs/architecture-guide/assurance/composability.md)和
[交付规划](../../docs/maintenance/delivery-planning.md)，不将三种结论互相替代。

| 判断 | 拥有者 | 典型发现 |
|---|---|---|
| 这个设计是否能满足需求与系统保证？ | architecture-reviewer | 政策或边界使系统不变量无法成立 |
| 既定设计是否被完整、明确、规范地表达？ | spec-reviewer | 设计已承诺拒绝分支，但规格没有定义其结果；同一状态有相互冲突的文字 |
| 依据这些输入，工作能否安全推进并形成可验收结果？ | plan-reviewer | 两个任务同时定义同一公共接口；消费者先于必要契约开工；真实组合无人负责 |

spec-reviewer 接收规格快照、落实的设计/需求依据和本次范围；不要求附完整施工计划。
plan-reviewer 接收计划快照、采用的设计/规格、目标与验收边界、必要实现现状和已知
资源约束；不以所有未来实现细节齐备为审阅前提。修订比较再附比较基线。

规格中缺失定义由 spec-reviewer 说明表达缺口，不代选业务语义；计划消费未决输入
时由 plan-reviewer 指出受阻任务及依赖条件，不重新审计该规格。需要裁决设计本身
时交回派发者安排 architecture-reviewer 或设计拥有者处理，两个角色均不得继续委派。
资料足够的独立评审可以并行，未决输入影响的结论须保留条件；不把三个角色排成
所有修改必经的流水线。普通错链、文字修正按相关检查完成。

两个新增 reviewer 均固定 Codex `gpt-5.6-sol / xhigh`、Claude Code `opus / xhigh`。
它们不采用开发者角色的可调默认档位。Codex 设置 read-only 并禁用继续委派；Claude
只开放 Read、Glob、Grep、WebFetch、WebSearch。权限仍受宿主实际支持与上层配置
约束，`opus` 的精确解析及实际 effort 须在派发时核对；不支持时报告缺口，不静默换档。
来源与实测范围见[规格和计划 reviewer 验证记录](focused-reviewer-verification.md)。

## 生成与宿主加载

选择宿主原生的同名角色。若当前调用面不支持具名角色，可以在授权范围内交接完整
生成指令和任务，但须说明这是普通 agent 试用，没有继承未经应用的原生权限配置。
文件写入不保证正在运行的会话已发现角色；模型实际选择和 effort 还需在调用时核对。

修改源包后，使用 [design-subagents 生成器](../skills/design-subagents/references/packaging.md)
在新暂存位置生成、比较，再同步原生文件。当前结果可只读核对：

```sh
uv run --locked python .agents/skills/design-subagents/scripts/render_pair.py \
  --source .agents/roles/architecture-reviewer --output . --check
```

模型、权限选择依据和本次验证边界见[适配记录](architecture-reviewer/verification.md)。
