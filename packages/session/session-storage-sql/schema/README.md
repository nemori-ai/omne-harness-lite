# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变。发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

现在为空，本包不发布 JSON Schema。本包的结构定义是数据库表与索引，它们的列与键写在[对象模型的当前实现的表](../docs/object-model.md#当前实现的表)，DDL 在 [src/worker/schema.ts](../src/worker/schema.ts)，迁移是 `session/001-session-log`。表不是对外契约：只有本成员读写它们，`session` 与邻域成员经端口访问，不读表（[接口隔离](../docs/architecture.md#solid-与扩展边界)）。

写进条目与回执的载荷由 session-contract 的事件目录定义，本包只核对 JSON 形状与封套必填字段。本包没有插件配置，所以没有 Standard Schema。选项字段见[公开接口导航的配置](../docs/public-api.md#配置)。
