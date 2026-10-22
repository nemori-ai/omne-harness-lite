# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变。发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

现在为空，本成员不发布 Schema。本成员不导出新的端口接口、服务键或事件，见[公开接口](../docs/public-api.md)。端口接口归 [session-contract](../../session-contract/docs/public-api.md#出站端口与块声明)，服务键与事件归 [session-cordis-contract](../../session-cordis-contract/docs/cordis.md)。本成员只翻译与实现这些定义，没有自己的对外数据形状需要发布。
