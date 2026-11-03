# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

占位不是已发布的 Schema。Schema 的身份不随目录搬迁而改变；发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

[skill-declaration.schema.json](skill-declaration.schema.json) 描述 `.omne/skill.json` 格式版本 1，身份是 `urn:omne-harness:skill-contract:skill-declaration:1`。行为的唯一正文是 [SPEC.md](../SPEC.md#omneskilljson)。Schema 表达不了的规则写在它的 `description` 中。本包是私有包，Schema 随包发布范围，没有独立的发布地址。`tests/declaration-schema.spec.ts` 核对 Schema 与解析一致。
