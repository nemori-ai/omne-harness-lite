# 本轮消费的需求与覆盖范围

需求基线为 `dae2df36491c0ab4b8b9a3d16db639dab5ea88b0`，保留引用为
`requirements-baseline/2026-09-13-dsh-core-adoption`。本页相对链接给出当时路径，
确认范围以该 commit 的正文为准；没有将整页中的假设或待澄清项一并确认。
[基线记录](evidence/requirements-baseline.json)包含所有 37 份需求正文/索引的哈希。

该提交包含已确认的 PF-024.C1/C2、PF-014.C6 与 SYS-DYNAMIC.C2 依赖生命周期
澄清，及 tools 候选的原始快照。其来源、未提交输入和哈希见
[工具输入](evidence/tools-input.json)。候选设计及旧评审没有随需求基线转为接受。

## 直接约束本次选择

| 确认依据及消费条款 | 本次选择如何回应 | 仍须设计或验证的内容 |
|---|---|---|
| [全局约束](../../requirements/system/constraints.md)：SYS-KERNEL、SYS-SPEC、SYS-DEPLOY、SYS-TENANT、SYS-LLM、SYS-EXPERIMENT | 官方 Cordis；选择源码后自主维护；语言无关规格；单机先行；租户边界；统一 OpenRouter；不带旧兼容体系 | 具体能力契约、后端平台与运行证据不由范围决定补齐 |
| [SYS-DYNAMIC](../../requirements/system/fully-dynamic-system.md)：已确认 C1/C2，含 C2 的本轮澄清；[SYS-LONG-RUNNING](../../requirements/system/long-running-and-evolving.md) 已确认目标 | 选 scope、动态注册和实例机制；每项设计处理激活、贡献、撤回、在途占用与版本 | 完全动态、长期稳定的全部达成判据仍需专题设计和测量 |
| [SYS-RUNTIME-CONTINUITY.C1–C3](../../requirements/system/runtime-state-and-continuity.md) | Session、投影、持久化、实例和工作驱动分别建模；保留后端替换边界 | 支持的恢复条件、异构范围和独立工作控制不能从日志重放推定 |
| [PF-003.C1–C6](../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md)、[PF-013.C1–C11](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md) | 纳入工具与 Loop/Session 联合设计；分离单次调用控制、运行控制和耐久输入队列 | 独立执行所有者、后台重新关联、精确目标及 `interrupt_then_run` 的整体意图均待正式规格；排除 jobs 来源不豁免要求 |
| [PF-014.C1–C6](../../requirements/product/agent/PF-014-runtime-tool-and-skill-discovery-and-loading.md)、[PF-024.C1/C2](../../requirements/product/agent/PF-024-multi-command-tool-definition.md) | 纳入 tools、system-prompt、scope；继续发展已有工具候选 | 多命令参数形状、技能效用、发现/装载、版本和当前权限需新设计；不将 PTC 视为已满足单槽位要求 |
| [PF-009.C1/C3/C4](../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md)、[PF-022.C1–C6](../../requirements/product/agent/PF-022-multimodal-response-and-output.md) | LLM、Session、工具共享内容契约；限定复用 attachment 数据辅助 | 多模态输入/输出、媒体治理与原件存储、真实能力/交付映射待设计；引用类型本身不提供上传存储 |
| [PF-023.C1–C7](../../requirements/product/user/PF-023-session-model-selection-and-continuity.md) | 新模型设计与 Session/装配专题共同负责切换及下一轮接续 | 耐久模态事实、窗口压缩、候选资格和切换并发语义待定稿 |
| [PF-020.C1–C6](../../requirements/product/environment/PF-020-dependency-availability-and-degradation.md) | 必要/可选依赖、实际就绪、局部降级与恢复列为每项设计验收条件 | Cordis 注入成功不证明远端可用；公网不可用时不绕过 OpenRouter |
| [SYS-OBSERVABILITY.C1–C7](../../requirements/system/observability-and-logging.md) | 各能力保留身份关联、失败及真实结果的验证责任 | 日志读面、全链路采集和性能测量待具体实现，不把 append-only Session log 当作全部观测系统 |

## 必须保留的组合义务

- [PF-001](../../requirements/product/user/PF-001-tenant-organization-context.md) 的已确认
  租户/组织效用，以及 [PF-006.C1–C6](../../requirements/product/user/PF-006-user-settings-and-agent-definition-authorization.md)、
  [PF-010.C1–C10](../../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md)
  的设置、资产和当前权限，约束具体操作。排除 dsh-settings/presets 不等于取消这些能力。
- [PF-005.C1–C10](../../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md)、
  [PF-007.C1–C7](../../requirements/product/user/PF-007-system-initiated-hitl.md)、
  [PF-008.C1–C7](../../requirements/product/user/PF-008-unified-decision-pool.md) 约束工具和 Run
  的等待、答复及结果接续；完整决策池与管理入口另设计，不能从 dsh-user-approval 的排除
  推导出批准缺省放行或不支持长期等待。
- [PF-019.C1–C7](../../requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md)
  要求金额归因及预算治理。模型/工具设计必须明确所需准入和计量契约，完整财务管理
  不在本次源码选择中完成；无提供者时不能声称硬预算已经生效。
- [PF-004](../../requirements/product/agent/PF-004-subagent-delegation-and-supervision.md)、
  [PF-012](../../requirements/product/environment/PF-012-computer-browser-shell-sandbox-and-native-use.md)、
  [PF-015](../../requirements/product/agent/PF-015-artifact-management-and-isolated-working-copies.md)、
  [PF-021](../../requirements/product/environment/PF-021-multi-machine-deployment-and-assembly.md)
  的已确认部分继续约束后续子 Agent、环境、制品和部署设计；本批没有完整兑现这些纵线。
  其它已确认产品要求保持有效，本次不作逐项完整交付承诺。

## 与既有接受状态的关系

沿用 [D-005](../../decisions/D-005-agent-runtime.md) 及其精确 v1 规格。新增工具需求
没有改变其身份/资源不变量；它们主要约束未完成的 tools/Loop 设计，并细化后续
提供者依赖关系。本次不取代 D-005，不改变旧源基线的上游事实，也不发布新的业务规格。

## 基线恢复

交付的 [Git bundle](evidence/requirements.bundle) 是自包含对象包。可在空目录执行：

```sh
git init --bare restored.git
git -C restored.git fetch /absolute/path/to/requirements.bundle refs/tags/requirements-baseline/2026-09-13-dsh-core-adoption:refs/tags/requirements-baseline/2026-09-13-dsh-core-adoption
git -C restored.git show requirements-baseline/2026-09-13-dsh-core-adoption:docs/requirements/product/agent/PF-024-multi-command-tool-definition.md
```

实际在不含 main 或任何开发分支的独立 bare 仓库恢复该引用，核对 commit 及所有
37 份文件字节一致；结果和 bundle 哈希见基线记录。本地 tag 和对象包已保存，
未推送远端，不把远端长期保留声称为已完成。
