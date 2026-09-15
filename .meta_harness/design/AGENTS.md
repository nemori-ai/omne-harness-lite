# 设计知识的准入与归属

本文件帮助 agent 判断一份材料是否值得进入设计链，以及应由哪个 family 持续维护；
产品心智与通用权威边界沿用父级约定。

## 先判断知识，再选目录

这里保存后续需求分析、设计和维护要继续消费的知识。准入依据是持续的消费对象，
不是任务名称、文件格式或评审状态；先读 [family 准入](README.md#家族准入)，再进入相应 family。

一次交付的计划、派发、文件盘点与进度放本次明确工作区的 `tmp/`，不作为 design topic。
尤其不要因任务叫“迁移”就塞进 migrations；其长期边界与实际收口证据按
[迁移准入](migrations/README.md#主题准入)判断。

## 按当前缺口展开

- 新建或吸纳主题：读所属 family 的 README 与本地 `.templates/`；按[信息包规则](README.md#主题是信息包)裁剪，模板本身不代表知识已准入。
- 比较方案、记录接受或表达精确承诺：分别定位 proposals、decisions、spec，不能通过换目录提升状态；具体入口见 [family 地图](README.md)。
- 现有条款与实现或证据冲突：读[规格演进](../agents/skills/harness-design-handbook/canonical/references/spec-evolution.md)，定位拥有者和消费者，不能在施工计划里重写契约。

普通局部修订直接接续已有主题；当前准入、拥有者与缺口清楚后停止扩展阅读，不为一次任务补齐所有 family。
