# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变。发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

现在为空，本成员不发布 JSON Schema。插件配置的 Schema 是 `src/cordis.ts` 里的 Standard Schema 值，只接受缺省、`null` 或空对象，见 [Cordis 说明的插件与配置](../docs/cordis.md#插件与配置)。设施请求与结果的数据形状归 [execution-environment-contract](../../execution-environment-contract/schema/README.md)。以后插件配置有字段时，再判断是否需要在这里发布对外 Schema。
