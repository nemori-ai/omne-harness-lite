# skill

本成员只提供已接受的资产类别端口 `skillBodyContract`。发现、脚本执行和发布不在这个入口。

## 责任与使用

独立消费从公开入口 `skillBodyContract` 取得端口，再向 `@omne-harness/assets` 的注册表登记。调用 `judge` 不执行正文里的函数。`tools` 中每一项都必须是类别 `tool` 加 name。本包依赖 `@omne-harness/assets`，不依赖 `@omne-harness/tool`。

## 契约与设计

端口字段和拒绝结果以[资产规格](../../assets/assets/SPEC.md#accepted-public-types)为准。本成员不解释装配采用。

## 验证与维护

默认测试责任是单元和契约。命令是 `pnpm --filter @omne-harness/skill test`。集成测试和端到端测试不在本成员。
