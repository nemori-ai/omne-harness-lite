# 版本、状态与引用

本规范落实 [D-001](../decisions/D-001-documentation-system.md) 与 [D-002](../decisions/D-002-decision-authority.md)。文件状态不等同于实现状态、模型检查结果或部署状态。

## 决定与提案

决定 front matter 必须符合 `interfaces.md`：非空 `scope`、日期、至少一个位于 `docs/proposals/` 或 `docs/research/` 的 `sources`，以及接受记录链接。决定是同一适用范围内研究、提案和决定三者中的最终权威，直到有一项新决定在明确范围内取代它。

提案可为 `draft`、`in-review`、`accepted`、`partially-accepted`、`rejected` 或 `withdrawn`。提案入口记录逐项结果并指向决定或正式规格；其旧正文保持当时的候选身份，不能通过事后改写变成当前规则。研究记录来源版本、观察、推断和未覆盖范围，不能获得政策权威。

决定可为 `accepted`、`superseded` 或 `withdrawn`。新决定的 `supersedes` 对每个目标写明 `id` 和精确 `scope`。无新观测时，不得以措辞替换、重复讨论、偏好重述或更换执行 agent 推翻有效决定。

要取代决定，`change_basis` 必须有新 `observation`、说明旧前提为何不再成立的 `causal_explanation`，并提供可解析的本地 `reproduction` 与 `verification` 链接。结构检查只能确认这些材料存在；审阅者须判断观测是否新、复现与验证是否对应主张、因果解释是否足以支持范围内的取代。用户的新明确要求、可复现反例、环境变化或失效的事实前提可构成输入变化，仍需记录它如何改变旧判断。

## 契约版本

契约身份采用 `data.<name>`、`capability.<name>` 或 `composition.<name>`；版本使用正整数。`spec/catalog.json` 是唯一的版本、状态、路径与接受依据清单，其形状以 `interfaces.md` 为准。`accepted` 表示可作为新设计依赖；`superseded` 保留精确引用和复现价值；`withdrawn` 不得作为新依赖。`current_version` 是推荐入口，不能自动升级消费者。

已发布 `vN/` 的规范正文、Schema、模型和规范场景均冻结。任何实质修改建立新 `vN+1`，并记录澄清、兼容扩展、语义变化或拆分替代；勘误在可变入口登记，若改变规范原文仍发布新版本。`spec/frozen.json` 记录已发布版本目录内所有规范文件的 SHA-256，检查时以 `--baseline <git-ref>` 发现同时修改原件与哈希的尝试。运行证据位于版本目录外，绑定其规格版本与源码提交。

正式引用必须指向已接受的精确身份与版本，不得引用 `current`、`latest`、分支头或候选提案。说明性来源可使用其他链接，但不因此引入规范义务。Schema 使用稳定 `$id`，按基 URI 本地解析 `$ref`；路径存在不等于引用有效。运行时依赖另行说明解析范围、绑定时机、有效期与提供者消失后的行为。
