# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

占位不是已发布的 Schema。Schema 的身份不随目录搬迁而改变；发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

现在为空，本成员不发布 JSON Schema。插件配置的 Schema 是子类静态 `Config` 上的 Standard Schema，随实现进入 `src/cordis.ts`，字段见 [Cordis 说明的配置](../docs/cordis.md#配置)。它只在插件装载时校验配置，不作为独立文件发布。四个面、端口与事件的形状归 session-contract 与 session-cordis-contract 的公开类型，不在本目录。

若以后插件树的加载器要求以 JSON Schema 描述各行配置，由应用装配的拥有者提出，再在这里加文件并写明它与静态 `Config` 怎样保持一致。具名维护者由负责人指定。
