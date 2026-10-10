# 产品包的实现边界

成员清单与状态见 [README](README.md)，布局规则归[源码布局](../docs/workspace.md)。

## 建包之前

> **包从已接受的规格出发建立，不凭一份产品设计开包。**

新包先明确职责、公开接口和类型之外的行为承诺，按[架构维护规则](../.meta_harness/design/architecture/README.md)取得接受依据，
不预建中央节点四件套；使用版本化包模板，公开定义、薄SPEC与验证责任由实际拥有者维护。
新增能力边界或保证时回 `.meta_harness/`，加载 `harness-design-handbook` 定位需求和拥有者。

规格还没定、只想先看一条主路径走不走得通时，**不在这里试**：探路件放任务的 `tmp/`，
这里的包不得导入它；它跑通之后带回设计的是事实清单，不是代码。

## 有包之后守什么

- 包按**已经明确的实现职责**建立，源码、依赖、公开入口与测试随成员维护；
  不由目录名称推导新的插件、服务或部署边界。
- 跨包消费**公开入口**（`package.json` 的 `exports`）；需要穿透兄弟包的 `src/` 时，先核对其边界与契约。
  开发工具归 [tools/](../tools/README.md)，应用装配归 [apps/](../apps/README.md)。
- 包内类型与实现遵循接口拥有者的公开类型与薄规格；未迁单元继续遵循 [spec/](../.meta_harness/design/architecture/README.md) 中的精确定义。
  冲突时回查精确版本与接受依据，**不能以当前实现反向修改契约**。
- 必须持续消费的实现取舍归成员旁简短 ADR，实际装配关系从实现和来源取得；系统级约束仍归 `.meta_harness/`。
  不能靠删除文档隐藏有效承诺或验证义务。
- 每个包自带 `build`／`typecheck`／`test` 三个脚本，`vitest` 的 `*.spec-d.ts` 做类型测试；
  版本只在根 `pnpm-workspace.yaml` 的 catalog 钉一次，成员用 `catalog:` 引用。
- 基础设施包不提供 in-memory 实现；测试用临时文件库。

沿既有契约的局部修改只读所属包及相关验证；新增能力边界、所有权或保证时，
回 [.meta_harness](../.meta_harness/AGENTS.md)。
