---
kind: product-feature
id: PF-018
primary_dimension: agent
secondary_dimensions: [user, environment]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/product/agent/PF-018-selfound-knowledge-and-cognition-use.md
source_sha256: 77f9a9c54ed756806cc83eb08531f9b084c2206b28fb51254116e089ebf545d9
source_anchor: "heading:# PF-018：使用 omne-selfound 的知识与认知能力"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# PF-018：使用 omne-selfound 的知识与认知能力

[智能体维度](../by-agent.md) · [来源与本轮取舍](../../../research/legacy_backup/requirements-gap-resolution-sources/research.md)

2026-09-12 用户将 GAP-1 的第二部分明确为：Agent 具备使用 `omne-selfound`
的能力，主要包括 `omne-engram` 和 `omne-cognition`。主维度为智能体，副维度
为用户、环境。这里记录本项目的消费能力，不代行上游产品的实现或交付承诺。

## 已确认要求

- **PF-018.C1：Agent 能实际使用 omne-selfound。** 在服务、契约与授权
  条件成立时，Agent 可发现并按需使用 Engram 和 Cognition 的公开能力，完成
  知识/认知的读取、检查及获准变更；不能以给出接入说明、只保存连接信息或一份
  静态记忆提示替代可工作的访问能力。

以下 C2–C6 是对固定版本上游要求及本项目已有边界的补充理解。本条不整包
继承 selfound 的全部未来功能或内部 API；确切采用版本与可用操作需在后续契约中固定。

- **PF-018.C2：知识底座与认知语义分工保留。** Engram 提供持久知识的
  表示、查询、受治理变更和审计；Cognition 提供证据、溯源、对象/用户/Agent
  认知及目标等领域语义。Agent 应能读取相关依据、历史、有效性和不确定性，
  通过对应公开语义操作形成或修订获准内容；知识写入通过检查不等于认知为真。
- **PF-018.C3：持久内容可跨会话使用。** 需要保留的知识与认知不绑定某次
  Agent Run 的内存；后续获准会话能读回并继续使用。会话历史检索引用 PF-017；
  从历史摄取、形成认知、修订证据与普通只读检索是不同效果，不能在查询时
  隐式进行未经授权的持久写入。
- **PF-018.C4：遵循双方有效权限与语义边界。** 本系统的调用资格与上游的
  租户、主体及操作准入同时成立。需要保持 Cognition 不变量的变更走其语义
  边界，不能借底层通用写接口绕过；个人/组织身份映射明确，失败不假报成功。
  Agent 对自身能力的认知不能授予工具权限、安装插件或证明该能力此刻可执行。
- **PF-018.C5：认知状态不替代运行事实。** 目标、计划、委派意图与评估
  可以持久表达，但实际 schedule、dispatch、run、retry、cancel 与完成状态
  仍由相应 harness 能力提供依据。没有运行回执，不能因认知图中记了“计划完成”
  就对外报告执行完成；日程和执行管理继续归 PF-011/PF-013。
- **PF-018.C6：能力和读取质量如实呈现。** 未部署、未授权、不支持、依赖
  故障、索引未就绪、结果陈旧/存疑与确实无结果分别表达。Agent 能据此等待、
  请求修复或使用获准替代路径；不能将上游未来需求写成当前已具备能力。

## 可观察场景与关联

| 场景 | 应有表现 |
|---|---|
| 新会话需要用户已确认的背景或既有知识 | Agent 从获准服务读取，辨认其依据和时效，并在当前协作中使用 |
| 新证据推翻此前认知 | Agent 可沿公开受治理操作提交修订，区分提交结果与认知是否仍然有效 |
| Agent 认为自己擅长某项能力，但插件未装载 | 认知记录可以保留；实际执行仍受 PF-014/PF-016 的可用性及授权判定 |
| selfound 的某个查询后端失效 | 受影响查询明确不可用或降级，其他具备条件的路径仍可使用 |

运行时发现与按需装载归 [PF-014](../PF-014-runtime-tool-and-skill-discovery-and-loading/requirements.md)，
工作制品归 [PF-015](../PF-015-artifact-management-and-isolated-working-copies/requirements.md)，
服务依赖故障归 [PF-020](../PF-020-dependency-availability-and-degradation/requirements.md)。
后续确定接入契约、身份映射、能力清单、部署组合及失败重试边界；不指定把 Python
上游库直接嵌入 TypeScript 进程，也不要求在本项目重建一套同义认知系统。
