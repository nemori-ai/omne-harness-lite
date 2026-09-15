# 提供者设计

本家族拥有能力到 Cordis 插件的实际兑现方式。每个持续维护的主题是一个子目录信息包，先读其 README，再按当前问题展开。

## 新建或接续主题

- 新主题从本地 [topic 模板包](.templates/topic/README.md) 开始，复制为 `<topic>/`；包内为入口和 `design.md + verification.md`。
- 接续已有主题先读该主题入口，保留有效正文、精确来源和实际状态，只补本次缺口。
- 独立能力维度有独立插件边界；规范语义与实现映射、实际证据分别维护。

命名、裁剪与跨家族引用遵循 [信息包约定](../README.md#主题是信息包)。
模板自身不是实际主题；不要将 `.templates/` 中的候选占位符计入能力、决定或证据清单。

## 当前主题

尚未导入具体系统的提供者设计正文。创建或导入后，在这里按主题链接其 README，并标明供读者判断适用性的范围。

判断方法按需读 [手册对应页](../../agents/skills/harness-design-handbook/canonical/references/project.md)。
返回 [系统设计链](../README.md)。
