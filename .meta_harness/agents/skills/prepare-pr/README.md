# prepare-pr：维护入口

本 skill 组织可审阅的 commit/PR 交付：开工时确定报告采集点，交付时选择模板、压缩报告并突出审阅问题。
它不接管产品设计、实现、工作树或合入权限。

## 归属与使用

- [canonical/SKILL.md](canonical/SKILL.md) 是唯一运行源，按名加载 `asd-ste100` 的语言规则。
- [版式指南](canonical/references/layout.md)和四类成品示例按需读取；示例不是实际项目证据。
- 填写模板和交付规范归显式执行仓库的 `.github/`、`CONTRIBUTING.md`，这里不保存模板副本。
- 两宿主采用显式 copy 策略；按[官方编译入口](../../../tooling/README.md#agent-编译)生成，不手改宿主产物。

准备任务报告或组织交付时使用 `prepare-pr`；普通正文改写仍由 `asd-ste100` 负责。
修改本源时加载官方 `skill-creator`，运行结构验证、`make agents-check`、`make docs-check`。
源或示例变化后做相称试写；生成一致不代表当前宿主已经加载，也不证明内容准确或版式可读。
