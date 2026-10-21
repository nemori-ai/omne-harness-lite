# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变。发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

现在为空，本成员不发布 Schema。公开形状由 TypeScript 类型表达，导出清单在[公开接口](../docs/public-api.md)。唯一的事件 `session-cordis-contract/committed` 的载荷与语义在 Cordis 说明的[事件](../docs/cordis.md#事件)。事件只是唤醒提示，由监听者经 `ctx.on` 接收。本成员没有规定它的跨进程编码。要对外发布 Schema 时，本目录才会有内容。
