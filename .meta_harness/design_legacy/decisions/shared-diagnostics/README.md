# D-010：共享诊断设施与真实边界观测

本包保存已经发生的选择，并把其当前消费边界投影到自包含设计工作区。

- 输入与下游：来源决定固定在修订 e3573ca72d18bfe7ddd002df5025551b51eede46；当前消费入口见下表。
- 范围定位：共享诊断公共面、依赖选择、生命周期以及 records 和 admission 等真实边界的观测注入。

## 准入核对

本包不产生新接受。来源路径 docs/decisions/D-010-shared-diagnostics.md，来源文件 SHA-256 65fd4fbaefc9a63b8231d6c296640415e2e12dee8567053676af7d195f3311ac；
接受权限、范围及取代关系在[决定正文](decision.md)中保持自包含。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、为什么、当前怎样消费 | [决定正文](decision.md) |

- [诊断提供者](../../providers/observation-diagnostics/README.md)\n- [观测研究](../../../research/legacy_backup/harness-observability/README.md)\n- [工程观测规格](../../spec/capabilities/engineering-observation/README.md)
