# 模型传输的提供者行为

公共操作、固定计划、请求/响应/费用责任归[模型请求公共SPEC](../../core/model-request-runtime/SPEC.md)。本页补充本提供者已采用的协议读取和资源边界；公开函数可独立使用，当前支持及配置继续归双语README。真实供应商发送、缓存认证或付费测试不能从本页存在推断完成。

## Refusal文字映射

OpenRouter Chat Completions的refusal缺席/null/空串不发内容事件；非空字符串含纯空白原样作为既有text。数组、对象、布尔或数字是protocol失败。每帧先检查refusal值型，随后按content→refusal→原reasoning/tools顺序处理；跨帧沿读取顺序追加，同帧排序只是本地规范化，不重建上游生成时间。

终止后的非空内容拒绝；同帧error优先于delta，不能先发该帧delta，已合法取得的facts保持。正常stop/tool_calls/length继续读正常尾帧到DONE，真实usage/cost沿原累积器；缺账仍未知。异常finish、顶层error、坏协议、取消或超时沿原停止规则，仅保留已读事实，不为未来计量额外排空连接。合法非空refusal不是失败判据，不把content_filter改为成功，不增加origin或自动过滤回放；持久reply与故障delivered的既有选择责任不变。

## 公开推理文本

流读取器将公开推理文字写入 thinking.text，并发送对应的 fill 事件。一个响应只选择一个公开文字来源：首次出现非空文字时，同帧的旧式 reasoning／reasoning_content／reasoning_text 优先，否则选择 reasoning_details。选定后不切换来源，也不把另一来源的镜像文字重复追加。空字符串、签名和非文字详情不会锁定来源。不按相同前缀猜测或删减文字。

详情来源只读取 reasoning.text 的 text 字符串和 reasoning.summary 的 summary 字符串，按帧与数组顺序追加。reasoning.encrypted、未知详情类型、签名和其他字段不成为公开文字。所有原详情仍按既有身份合并规则保存在 opaque 中，供原模型协议回放；公开文字投影不改变其字段、签名或加密内容。消费者不需要解码 opaque 来显示公开推理文字。

此来源选择适用于 OpenRouter 将旧式文字与结构化详情作为并行表示的响应。不把一种表示的缺席片段从另一种表示补齐，不声称两种不同表示可以无损合并。详情字段的协议来源见 [OpenRouter reasoning tokens](https://github.com/OpenRouterTeam/docs/blob/main/guides/best-practices/reasoning-tokens.mdx)。

## 固定执行与图片复用

共享reader的相同revision不得偷换实现；贡献的实际采用绑定须与同步发布的固定组合一致。原调用固定整组reader/definition/meter、精确版本与实际输入，消费者不能热改在途闭包。stop请求、native真正结束与责任释放分开；外部付费效果不能回滚。图片转换只处理选中固定请求的材料，原件不改，具体配置与有限支持归README的图片准备部分。

scope必须为非null object，非法值同步TypeError。空或已清scope幂等，无缓存明确no-op。runtime在共享提供者下只清自己的scope，不能用preparer.close替代局部清理。失败或旧代owned句柄仍由原owner保有，不转移到新代。clearReuseScope要求实际返回值严格为undefined，不接受非undefined值或thenable冒充同步完成。清理固定且去重的owned preparer集合，每项都尝试；单个失败原样抛出，多个失败聚合抛出，不因首错遗漏其他清理。非法thenable的实际完成由原owner观察，完成前同scope／preparer不得重入清理；其拒绝不能成为无人观察的Promise。关闭新准入后仍可清已有scope；失败scope继续占预算并由原owner保有，不换新scope掩盖失败。clear不取消native在途工作，不能以隔离标签、缓存为空或listener撤除证明物理停止。关闭先停准入并取消规划，再等待网络排空、所有owned preparer真实close与native任务／decoded句柄释放、非法异步清理完成；失败保持原owner收场责任，不能提前报告closed。借用codec不被销毁。

## 验证

协议用例须独立覆盖refusal五类值、同帧顺序、跨帧、正常尾帧账、错误不drain与回放；资源用例须核固定代际、同步清理、失败保有和真实native结束。原Schema身份与精确模型绑定保持，模拟/TLS/有限模型不代替真实供应商认证。单次执行结果归工作树tmp。

## 请求内图片字节

本节约束 PlanExecutionContext.imageBytes 的消费。公开端口由 [model-request-runtime](../../core/model-request-runtime/SPEC.md) 拥有。

planRequest 同步读取已提供的固定字节，只转换 wire 投影中的可见外部图片。不读取隐藏父块的子图，不重新读取 inline 字节。每个原引用必须有唯一快照。缺失、重复或取消时明确拒绝。本端口不执行持久源 IO，也不替代附件权限。

原消息、日志引用、摘要和返回计划的 input 均保持原语义。投影字节进入现有图片 preparer、meter 和最后输入限制门。最后计划仍由原提供者签发和保存。不能复制、改写或伪造计划来通过原发起边界。

本包不决定附件的持久寿命，不从 locator 自动取文件或网络资源。没有 imageBytes 时保留原行为。调用者先完成有界读取，保有原调用访问句柄，并等待读取实际停止。模型内容保有端口与本次固定字节各自履责。
