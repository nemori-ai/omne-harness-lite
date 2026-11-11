# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

占位不是已发布的 Schema。Schema 的身份不随目录搬迁而改变；发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

运行时 Zod Schema 随 src/schema.ts 公开导出。当前不另维护 JSON Schema 副本，避免出现另一份形状权威。
