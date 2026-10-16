# dev-flow

[English](README.md)

开发流程工具，不发布：

- [integration](src/integration/README.md)：开工 `start`、task context、基线与 task-sync。task context 的读取格式由 repo-toolchain 的 `core/task-context` 定义；本成员负责写入与完整校验。
- [delivery](src/delivery/README.md)：读取 Issue 与看板，报告交付卡的形状、阶段等待与依赖投影。
- 包模板：见下文。

## 包模板与采用扫描

私有 omne-package-template CLI 创建草稿并盘点精确模板采用。见[模板说明](templates/package/README_ZH.md)与[开发入口](../../docs/development.md#创建和整改产品包)。扫描复用架构读取器，结构结果不接受业务或生命周期行为。

包模板当前为 typescript-package@2.0.0，精确保留 1.0.0 旧标识规则。
`service-contract` 的创建和结构扫描不再要求 `packages/core`。
`scan --json` 在 `dependencies` 上报告已判断的边。`unknown` 保持 `unknown`。
分组方向由 dependency-cruiser 按[依赖规则](../repo-toolchain/README_ZH.md#依赖图与依赖规则)检查，不再有组的层位表；同组的 `sdk` 导入 `server-entry` 直接违反 `sdk-not-server`。
后续实施者的使用表和诊断形状见[模板说明](templates/package/README_ZH.md#后续实施者)。
`create-domain --group <名称>` 预览 package-domain@1.0.0 组文档草稿，加 `--write` 才创建。`scan --group <名称> --check` 检查组结构，与 `--member` 互斥。见[组模板](templates/domain/README.md)。Python 文档 inventory 独立检查登记、章节与占位，结构结果不能代替正文接受。
