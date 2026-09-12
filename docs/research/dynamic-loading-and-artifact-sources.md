---
kind: research
id: R-dynamic-loading-and-artifact-sources
scope: PF-014/PF-015 的跨子系统来源、机制参考及差异
---

# 运行时能力装载与制品管理的来源核对

[PF-014](../requirements/product/agent/PF-014-runtime-tool-and-skill-discovery-and-loading.md) · [PF-015](../requirements/product/agent/PF-015-artifact-management-and-isolated-working-copies.md) · [研究索引](README.md)

2026-09-12 按用户要求核对 omne-next Harness 外相关子系统，以及 DSH/Cordis。
omne-next 固定提交 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；官方 DSH 固定
提交 `c291e7961a515f6d7af9304e7fd1d257929aef26`，本次远端 master 查询仍指向
该提交。两者是研究版本，不是本项目采用依赖的声明。以下为静态文档研究，未
执行上游实现、故障恢复或并发测试。

## 发现与装载

| 来源与核对范围 | 可用于解释产品要求的事实 | 采用边界 |
|---|---|---|
| [统一能力发现 ADR-004][discovery]：Accepted，发现流程、类型差异、渐进装载 | 工具与技能共同搜索，先读摘要，再取得工具定义或技能全文，后续分别执行/激活 | 支持 PF-014.C1/C2；不选用其工具名称、索引算法、middleware 或缓存 |
| [Tool Search ADR-002][tool-search]：Accepted，常驻/延迟及 search→schema→execute | 工具可常驻或按需发现、取得完整定义后调用 | 历史模型供应商支持矩阵未作现状依据，不改变统一 OpenRouter 要求 |
| [Skills README][omne-skills]：渐进披露与资源层次 | 元数据、技能正文、额外资源可以分步读取 | 不照搬宿主路径优先级或模型框架实现 |
| [受管官方能力发现][governed]：Accepted current，OHC-1～6 | 有效/可申请/不可用、当前治理、可信来源、使用时重检，按安全边界更新，来源故障不等于空目录 | 补充 C3/C5；该目录仅覆盖特定 Harness 受管能力，不是全部工具目录 |
| [DSH Skills][dsh-skills]：目录、provider、list/get、失效、资源与 tool-skill 章节 | 作用域目录与按需全文分开，可适配文件/嵌入/其他来源；目录不完整与有效空集合不同，资源提示不等于自动下载 | 提供机制事实，不采用其作用域优先级、缓存、目录摘要或正文不版本化策略 |
| [DSH tool-skill README][dsh-tool-skill]：目录消费、按需正文及显式用户调用 | 模型可取得技能指引，用户调用资格与模型调用资格可区分，过时/不可用应反馈 | 其正文内 slash token 识别规则与本项目 PF-009 不同，不移植该词法 |
| [DSH Tools README][dsh-tools]：注册、可见 Schema、调用与撤销 | 工具注册随作用域生命周期生效；注册可见性、模型投影和实际执行分别存在 | 原生可见工具 Schema 投影不等于完整的按需工具搜索产品；本项目仍需自行设计 |
| [Cordis Primer][cordis]：五个基础概念、注册的可逆 effect | 服务经 Context 发现、声明依赖，插件注销时清理注册、监听器等 | 仅证明内核组合机制；不证明外部副作用可逆，不提供租户权限或沙盒安全保证 |

omne-next `omne_agent_capabilities/design_docs/agentic/agent-skills-design.md`
在研究版本还是 Draft TODO，未作为已完成设计或能力证据。DSH 的能力目录和
Cordis 动态注册也不能代替本项目“发现→装载→实际可用”的端到端产品要求。

## 制品、工作副本与发布

| 来源与核对范围 | 可用于解释产品要求的事实 | 采用边界 |
|---|---|---|
| [受管 Workspace 与制品发布][managed]：Accepted committed-future，操作、恢复、并发及结果要求 | 工作环境重建后取回已确认版本，显式保存/同步，冲突保留可恢复工作；发布使用精确版本和范围，部分/未知结果如实表达 | 主要产品补充；明确为已承诺未来要求，未声称实现完成 |
| [跨系统解耦 ADR-C001][decoupling]：Accepted，2026-08-05 所有权补充 | 能力、工作空间、执行环境分别拥有生命周期，可组合加载 | 其旧“运行总在沙盒”等装配前提不限制本项目已确认的本机支持 |
| [Workspace 持久化 ADR-002][persistence]：Accepted，特别是 P3.1/P3.2 | 以 Git/LFS/Gitea 描述版本与持久化，旧方案某配置以宿主磁盘为主、远端为备份 | 后一假设不能满足用户本轮更明确的宿主机独立要求，不作为本项目存储权威选择 |
| [Workspace 生命周期 ADR-003][workspace-lifecycle]：Accepted，§3 并发 | 多会话独立 clone/目录，远端领先时 push 拒绝，整合冲突保留本地工作 | 支持隔离副本和保存冲突分别建模；不固定 clone、自动 rebase 或每会话分支策略 |
| [Artifact ADR-006][artifact]：Accepted，Tag + Release 与 checkpoint 区分 | 固定版本及对外交付可独立于平时保存管理 | 来源 Artifact 比用户本轮含义窄；不把所有持久材料都变成发行物 |
| [Artifact 操作指南][artifact-guide]：发布前置条件及步骤 | 提供旧实现操作面的补充观察 | 与 ADR-006 在 SemVer 强制、dirty 自动提交等处有差异；两者具体策略均未采用，不能据指南声称发布无部分失败 |
| [DSH Workspace][dsh-workspace]：目录身份及 session membership | 管理既有规范化宿主目录的持久记录和会话归属，本身不向模型暴露工具 | 不等于独立存储制品内容，不证明跨宿主恢复 |
| [DSH FileSystem][dsh-fs]：provider、路径命名空间、host path 映射 | 文件 I/O 可以适配不同执行世界，宿主路径并不天然可供沙盒/远端读取 | 支持加载目标需明确的边界；文件系统抽象不自动提供制品存储、同步或并发整合 |

本轮 PF-015 以用户定义为准：制品可以是普通工作材料，已确认保存后不依赖
原运行时或宿主机；工作副本可以位于本机或沙盒，多个会话可同时处理。目录
隔离、持久保存和成果整合各自需要保证。Git worktree 只是可选手段，既不直接
提供权限隔离，也不代替持久存储、共享仓库生命周期管理或冲突解决。

## 验证范围

引用的 omne-next 文件按固定提交与本地 Git blob 核对；引用的官方 DSH 文件
按固定提交下载，并核对 Git tree 中的 blob 标识。只阅读表中所列相关章节，
没有把整份上游文档或其所有 API 自动纳入继承范围。工作目录中的下载与校验
清单是可重新生成的临时证据；固定链接及上述范围是本页维护的引用依据。

[discovery]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_agent_capabilities/adrs/ADR-004-unified-capability-discovery.md
[tool-search]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_agent_toolkits/adrs/ADR-002-tool-search-middleware.md
[omne-skills]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_agent_skills/README.md
[governed]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/governed-official-harness-capability-discovery-and-invocation.md
[managed]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/managed-workspace-lifecycle-and-artifact-publication.md
[decoupling]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/adrs/ADR-C001-sandbox-skill-workspace-decoupling-constraints.md
[persistence]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_agent_workspace/adrs/ADR-002-workspace-persistence-architecture.md
[workspace-lifecycle]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_agent_workspace/adrs/ADR-003-workspace-lifecycle.md
[artifact]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_agent_workspace/adrs/ADR-006-artifact-model-tag-and-release.md
[artifact-guide]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_agent_workspace/docs/guides/artifact-management.md
[dsh-skills]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/subsystems/skills.md
[dsh-tool-skill]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/skill/tool-skill/README.md
[dsh-tools]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/tools/README.md
[cordis]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-primer.md
[dsh-workspace]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/subsystems/workspace.md
[dsh-fs]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/subsystems/filesystem.md
