# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变；发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

不适用。本包不发布 Schema。服务定义和目录定义的形状由 `src/` 里的 TypeScript 声明表达，[公开接口页](../docs/public-api.md)只导航到它们。`tests/fixtures/exports.json` 是导出清单测试的输入，不是已发布的 Schema。
