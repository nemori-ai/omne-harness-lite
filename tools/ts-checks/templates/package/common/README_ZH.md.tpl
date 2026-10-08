# @omne-harness-lite/{{PACKAGE_NAME}}

[English](README.md)

PACKAGE_TEMPLATE_DRAFT：交付前填写已接受的实际职责。
这是私有 ESM workspace 包，采用 {{VARIANT}} 模板变体。

## 公开接口和示例

说明实际导出与可运行示例。根入口独立于 Cordis；绑定变体才使用 `./cordis`。

## 承诺和验证

链接公开接口拥有者和采用的行为。类型表达不出的行为才建立 SPEC.md。
适用的 Schema、模型和证明归语义拥有者。模板标识不证明业务行为通过。

## 开发

按[开发指南](../../../docs/development.md)准备环境，先构建依赖。

```sh
pnpm --filter @omne-harness-lite/{{PACKAGE_NAME}} run build
pnpm --filter @omne-harness-lite/{{PACKAGE_NAME}} run typecheck
pnpm --filter @omne-harness-lite/{{PACKAGE_NAME}} run test
```

交付前以已接受的内容和有意义的测试替换草稿，不用空测试假报通过。
