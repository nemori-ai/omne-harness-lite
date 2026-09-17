# tenant-governance

- kind：`provider`
- 消费契约：`capability.tenant-governance` v1
- 源码位置：待建，`packages/tenant-governance/`

租户身份、成员关系、成员资格判定与作用域层次。

## 分层状态

- 语义接受范围：契约为 **candidate**，尚无接受决定
- 可实施范围：设计完成，全部条款已投影
- 绑定与证据：见 [bindings.yaml](bindings.yaml)；多数条款证据待实现
- 实际验证：见各契约的 verification

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 怎样实现、依赖什么、资源谁拥有 | [design.md](design.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [bindings.yaml](bindings.yaml) |
| 实施者的单一入口 | [PF-026 设计投影 v1](../../../requirements/product/PF-026-account-journey-and-isolation/design/v1/projection.md) |
