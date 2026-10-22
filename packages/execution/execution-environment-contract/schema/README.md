# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

Schema 的身份不随目录搬迁而改变。发布范围由对应责任明确声明。本目录的说明不代替 schema 文件本身。

## 维护

Schema 变化时，同步消费者、示例与验证资源。本目录的文件字节变化时，必须同步采用身份 `environmentNeedAdoption` 的 `digest`，否则 `need-declaration.spec.ts` 失败。声明的形状变化时，还要前进 `revision`。

## 本包事实

本目录有一份 Schema：[environment-need.schema.json](environment-need.schema.json)，即工具环境声明 `EnvironmentNeedDeclaration` 的 JSON Schema（draft 2020-12）。

- `$id`：`urn:omne-harness:execution-environment:environment-need:1`。
- 采用身份：`environmentNeedAdoption`，`owner` 为 `execution-environment`，`name` 为 `environment-need`，`revision` 为 `1`，`digest` 为本文件字节的 SHA-256。
- 同形的 Standard Schema：`environmentNeedSchema`，由根入口导出。
- 消费者：工具包把声明值与采用身份写进工具定义；Tool 契约经 schema-provider 按采用身份解析 schema 并校验，不导入本成员。

字段规则与采用身份的含义见[公开接口页](../docs/public-api.md#工具环境声明)，条款见 SPEC 的[工具环境声明](../SPEC.md#工具环境声明)。逐操作参数与结果的 schema 还没有进入本目录。
