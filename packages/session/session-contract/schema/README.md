# schema

本目录承载本包对外的 Schema、稳定身份与发布消费说明。

## 允许的内容

JSON Schema 文件与说明。

## 边界

没有 Schema 文件就表示没有发布 Schema。Schema 的身份不随目录搬迁而改变。发布范围由对应责任明确声明。

## 维护

Schema 变化时，同步消费者、示例与验证资源。

## 本包事实

现在为空，本成员不发布 Schema。公开形状由 TypeScript 类型表达，候选定义在[公开入口与候选定义](../docs/public-api.md)。会话日志的原生事实语义在[事件目录](../docs/object-model/session-log-events.md)，状态转移在[状态与转移](../docs/object-model/session-state-transitions.md)。事件目录里的 SE 编号只是文档定位标识，不是已发布的种类或公开 Schema。

事件的精确编码由实际成员拥有，现在未定。编码确定并决定对外发布 Schema 时，本目录才会有内容。
