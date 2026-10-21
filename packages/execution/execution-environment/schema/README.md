# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变。发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

现在为空，本成员不发布 Schema。工厂的输入是进程内的端口对象，表与租约视图不跨进程传递。采用记录、获取状态与受管资源的数据形状归 [execution-environment-contract](../../execution-environment-contract/schema/README.md)。
