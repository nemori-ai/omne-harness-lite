# 产品包的实现边界

成员清单与状态见 [README](README.md)，布局规则归[源码布局](../docs/workspace.md)。

## 建包之前

> **包从已接受的规格出发建立，不凭一份产品设计开包。**

每个包对应一个 [realization 节点](../.meta_harness/design/realization/README.md)；
节点先于包存在，节点 README 的「源码位置」指向这里。要新加一个包：先在
`.meta_harness/` 加载 `harness-design-handbook` skill 把节点写出来并过评审，再回来建目录。

规格还没定、只想先看一条主路径走不走得通时，**不在这里试**：探路件放 [examples/](../examples/README_ZH.md) 或任务的 `tmp/`，
这里的包不得导入它；它跑通之后带回设计的是事实清单，不是代码。

## 有包之后守什么

- 包按**已经明确的实现职责**建立，源码、依赖、公开入口与测试随成员维护；
  不由目录名称推导新的插件、服务或部署边界。
- 跨包消费**公开入口**（`package.json` 的 `exports`）；需要穿透兄弟包的 `src/` 时，先核对其边界与契约。
  开发工具归 [tools/](../tools/README.md)，应用装配归 [apps/](../apps/README.md)。
- 包内类型与实现遵循 [spec/](../.meta_harness/design/spec/README.md) 中的权威定义；
  冲突时回查精确版本与接受依据，**不能以当前实现反向修改契约**。
- 提供者设计归 `.meta_harness/design/realization/`，连接精确规格、公共入口与运行映射，
  **不留在一次性施工稿里**；实现偏离节点设计时先改节点再改代码。
- 每个包自带 `build`／`typecheck`／`test` 三个脚本，`vitest` 的 `*.spec-d.ts` 做类型测试；
  版本只在根 `pnpm-workspace.yaml` 的 catalog 钉一次，成员用 `catalog:` 引用。
- 基础设施包不提供 in-memory 实现；测试用临时文件库。

沿既有契约的局部修改只读所属包及相关验证；新增能力边界、所有权或保证时，
回 [.meta_harness](../.meta_harness/AGENTS.md)。
