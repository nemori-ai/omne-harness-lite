# D-011：诊断目录的共同所有权

本包保存已经发生的选择，并把其当前消费边界投影到自包含设计工作区。

- 输入与下游：来源决定固定在修订 e3573ca72d18bfe7ddd002df5025551b51eede46；当前消费入口见下表。
- 范围定位：本机 diagnostics 目录创建、共同容量、flock 排他、最终关闭与未知释放。

## 准入核对

本包不产生新接受。来源路径 docs/decisions/D-011-diagnostics-directory-ownership.md，来源文件 SHA-256 c8bbf62c49a360eee33c5101b5c4a04f575c6870a25ce2c26d3ca43c361f5eee；
接受权限、范围及取代关系在[决定正文](decision.md)中保持自包含。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、为什么、当前怎样消费 | [决定正文](decision.md) |

- [诊断提供者设计](../../providers/observation-diagnostics/design.md)\n- [诊断提供者验证](../../providers/observation-diagnostics/verification.md)\n- [D-010](../shared-diagnostics/README.md)
