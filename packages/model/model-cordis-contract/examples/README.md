# examples

本目录承载面向真实公开入口的使用示例。

## 允许的内容

可运行的示例代码与说明。

## 边界

示例只用公开入口，并写明运行前提。示例不代替测试或规格。

## 维护

公开入口变化时，同步示例并确认它仍能运行。

## 本包事实

本包不另写示例代码。可运行的消费示例就是 Cordis 消费插件夹具：`tests/fixtures/consumers/cordis-plugin/` 下的小工程，只依赖已打包安装的公开制品和 Cordis，演示一个插件怎样取得唯一的运行时服务定义、监听带身份的变化通知并取回权威状态。夹具登记在 `tests/fixtures/consumers/roles.json`。

运行夹具：

```sh
pnpm --filter @omne-harness/model-cordis-contract run fixtures
```

夹具的限度见[验证说明](../verification/README.md#角色夹具)。夹具兼作持续消费示例：它每次运行都对已安装制品重新编译，所以公开入口变化而示例没有同步时，运行会失败。
