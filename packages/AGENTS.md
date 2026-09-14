# 产品包的实现边界

这里补充产品包的源码归属与消费边界。包索引见 [README](README.md)，完整规则归
[源码布局](../docs/maintenance/workspace.md)。

- 包按已经明确的实现职责建立，源码、依赖、公开入口与测试随成员维护；不由
  目录名称推导新的插件、服务或部署边界。
- 跨包消费公开入口；需要穿透兄弟包的 `src/` 时，先核对其边界与契约。
  开发检查器归 [tools/](../tools/README.md)，应用装配归 [apps/](../apps/README.md)。
- 包内类型与实现遵循 [spec/](../spec/README.md) 中的权威定义；冲突应回查精确
  版本与接受依据，不能以当前实现反向修改契约。
- 当前提供者设计随成员维护，按[设计归属](../docs/maintenance/organization.md#当前实现设计的归属)
  连接精确规格、公共入口及运行映射；必要设计不能仅留在一次性施工稿。

沿既有契约的局部修改只读所属包及相关验证；新增能力边界、所有权或保证时，
再使用 [architecture-design](../.agents/skills/architecture-design/SKILL.md)。
