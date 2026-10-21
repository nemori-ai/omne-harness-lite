# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变。发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

现在为空，本成员不发布 Schema。本成员没有自己的插件配置。intercept 配置 `{ scope }`、事件载荷与策略选择的配置形状都是进程内的 TypeScript 类型，不跨进程传递，不需要对外 Schema。校验策略选择配置的 Standard Schema 是提供者的静态 `Config`，归 [request-context-cordis](../../request-context-cordis/schema/README.md)。
