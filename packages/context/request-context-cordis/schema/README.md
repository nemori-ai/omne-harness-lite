# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变。发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

现在为空，本成员不发布 Schema。插件配置的 Schema 是 Service 子类的静态 `Config`，用 Standard Schema 写在源码里，随 `./cordis` 进入 `src/`（[Cordis 说明的配置与策略选择](../docs/cordis.md#配置与策略选择)）。它不是对外发布的 JSON Schema。以后插件树要用 JSON Schema 校验本插件的配置行时，再决定是否在这里发布。
