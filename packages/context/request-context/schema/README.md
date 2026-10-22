# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变。发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

现在为空，本成员不发布 Schema。工厂的配置与默认策略的数值是进程内参数，经 Cordis 时由 [request-context-cordis](../../request-context-cordis/schema/README.md) 的插件配置 Schema 校验。组装输入与结果的形状归 request-context-contract 的公开类型，不在本目录。
