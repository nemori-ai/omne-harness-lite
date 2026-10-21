# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变。发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

现在为空，本成员不发布 Schema。`SchedulingPolicy` 是进程内参数，工厂在构造时校验它，不合法时抛出错误并指出字段。经 Cordis 时，插件配置由 [session-cordis](../../session-cordis/schema/README.md) 的 Schema 校验。四个面的操作、端口与事件的形状归 session-contract 的公开类型，不在本目录。
