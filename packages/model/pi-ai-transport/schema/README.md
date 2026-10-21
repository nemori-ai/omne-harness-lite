# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变；发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

不适用。本包不发布 Schema：根入口只导出 TypeScript 类型，诊断事件与交换结果是包内值，SSE 与协议帧的格式由上游协议与 `@omne-harness/json-text` 决定。
