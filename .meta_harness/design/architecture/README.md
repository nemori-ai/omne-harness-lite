# 保留技术源入口

本区只维护尚未承接的技术专题及其状态导航。全系统目标设计归[系统架构](../../../docs/architecture/README.md)，项目要求归[docs/requirements.md](../../../docs/requirements.md)，业务责任归[领域设计](../../../docs/domains/README.md)。成员的公开形状、完整必要行为与持续验证资源由实际拥有者维护。

## 尚未承接的专题

以下专题尚未确定完整迁出位置，暂留原处供整合和消费者核对，不为接收材料创建空包。旧接受记录不构成与docs架构并列的权威，也不授予冲突设计继续采用。内容须按[现行架构准入规则](../../../docs/architecture/README.md#采用状态与当前有效源)筛选，符合上层的细化才可承接；实现限制作为偏离，未判定保持未判定。

| 专题 | 当前入口 |
|---|---|
| 资产治理 | [asset-governance](asset-governance/README.md) |
| 资产转移 | [asset-transfer](asset-transfer/README.md)及其模型与验证资源 |
| 治理中心接入 | [center-connection](center-connection/README.md) |
| Hooks导入 | [hooks-import](hooks-import/README.md)及方言与场景 |
| MCP桥接 | [mcp-bridge](mcp-bridge/README.md) |
| 多模态投影 | [modality-projection](modality-projection/README.md) |
| 完整Session与Agent第一期候选 | [session-agent-runtime-phase1](session-agent-runtime-phase1/README.md)；F0限定授权与完整候选分开，实际成员维护其当前契约 |
| Connector接入 | [connector](connector/README.md)；产品整体搁置，保留条件性设计，不构成当前交付承诺 |

PF 分解后的当前产品正文从[产品入口](../product/README.md)进入，领域、能力组与成员分别维护已落位关系、工程设计及行为规格。尚未承接的 PF 详细技术保留在[封存原源](../product.0.0.1.legacy/README.md)，只供后续专项核对，不成为已落位正文的并列权威。

## 已承接信息从哪里读取

共同集成保证归[Cordis集成约定](../../../docs/architecture/cordis-integration-conventions.md)，采用定位归[机读约束](../../../docs/architecture/constraints.json)，机械规则覆盖归执行仓库`tools/repo-toolchain/src/arch/CONFORMANCE.md`。阶段后端选择归[基础设施采用](../../../docs/architecture/deployment/infrastructure-policy.md)。它们与目标架构、实际成员契约分别拥有不同信息，不从路径或绿色结构报告推断行为已兑现。

身份、组织、登录、注册、治理入口和客户端的精确行为沿[身份与治理责任](../../../docs/domains/identity-and-authorization/README.md)定位实际成员。装配、插件树、Storage/Clock与Session相关承诺沿[架构入口](../../../docs/architecture/README.md)和[领域导航](../../../docs/domains/README.md)展开，不再消费旧施工页。

未取得关闭依据的原组合问题继续由[符合性问题入口](../../../docs/architecture/assurance.md#尚未取得关闭依据的组合问题)显示未知。OG3等已接受但未实现的增量继续由其实际成员规格维护，不能因施工页退出而销项。

## 维护与退出

迁出前先按docs现行项目要求、系统架构及领域责任判断内容是否仍有效，再核对可承接细化的条件、例外、消费者、Schema、规范场景、模型及验证义务。冲突旧设计不得进入正式规范，不能以保全为由降低上层目标。正文和必要消费实际切换后退出被替代源；公开身份不因移动自动改变，不建立两份现行权威。

归属、表达及留空规则由执行仓库的文档治理维护，成员完整规格与内部设计由两层成员文档维护；可点击入口见[工作区地图](../../README.md)。提案、比较、接受过程和单次输出留执行工作树tmp。当前入口变化时同步本页及真实消费者。
