# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变。发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

现在为空，本成员不发布 Schema。本成员没有插件配置。intercept 配置 `{ caller }` 是进程内的 TypeScript 类型，不跨进程传递，不需要对外 Schema。工具环境声明的 Schema 归 [execution-environment-contract](../../execution-environment-contract/schema/README.md)。Service 实现的插件配置 Schema 写在 [execution-environment-host-local](../../execution-environment-host-local/docs/cordis.md#插件与配置) 的源码里。
