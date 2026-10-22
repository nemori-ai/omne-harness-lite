# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变。发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

本目录为空，不发布独立 Schema 文件。公开形状已由 `src/` 的 TypeScript 类型和 Standard Schema 值表达，导出见[公开接口页](../docs/public-api.md)。

独立入口的字节编码现在未定（[RQ-01](../SPEC.md#rq-01-调用方与计算边界)）。编码确定并决定对外发布 Schema 时，本目录才会有内容。
