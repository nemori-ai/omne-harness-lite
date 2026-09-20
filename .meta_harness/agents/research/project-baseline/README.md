---
kind: research
id: R-project-baseline
scope: 用户已确认的项目方向与迁移前记录
---

# 项目基线的来源记录

整理日期：2026-09-12。本页记录本项目会话中的用户要求及迁移前材料，不是重新批准所有历史设计。没有推断原要求首次提出的日期，也不将迁移前 `current` 标签当作具体模型已经接受的证据。

## 用户已明确的方向

- 项目使用 omne-harness-lite 名称，以 DeepSeek Cordis 为内核，保留 OMNE-next 的核心理念和实践，为超长期待机、稳定运行、持续进化的个人助手提供能力。
- 复用 Cordis 与 DSH agent 原语，Agent Loop 和 Harness 等由本项目实现；设计保持语言无关。
- 第一完整交付是单机，但关键边界支持未来独立分布式、异构节点和微服务化而不改变语义。
- 租户隔离从第一天支持，沿用 OMNE 双层租户设计；模型请求统一 OpenRouter。
- 接受合理大胆重构，不引入未经要求的旧版兼容层；同义定义全系统复用，成熟实现满足契约时优先复用。
- 当前建模不再生搬硬套 DDD 战术分类；组织以能力、数据、组合契约承载动态系统。

本轮新增的明确裁决及接受范围记录于[文档体系提案](../../proposals/documentation-system/README.md#接受记录)。上面的方向展开为[系统要求](../../architecture/constraints.md)，不是批准历史材料中的每个字段或操作。

## 迁移前原件

- [架构原件](architecture-before-migration.md.txt)
- [防御模式原件](defensive-patterns-before-migration.md.txt)

原件保留原始字节与当时引用位置，使用文本附件避免被当作当前可导航规范。其内部历史相对路径不代表当前位置；有效入口为[当前架构](../../architecture/README.md)、[防御指导](../../defensive-patterns.md)和[规格](../../../spec/README.md)。

九项旧 DDD 模型另在[规格历史](../../../spec/archive/README.md)保留原件、哈希和承接关系。历史记录中的候选方案与缺口保持原来性质。
