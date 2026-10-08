# 模型传输的提供者行为

公共操作、固定计划、请求/响应/费用责任归[模型请求公共SPEC](../../core/model-request-runtime/SPEC.md)。本页补充本提供者已采用的协议读取和资源边界；公开函数可独立使用，当前支持及配置继续归双语README。真实供应商发送、缓存认证或付费测试不能从本页存在推断完成。

## Refusal文字映射

OpenRouter Chat Completions的refusal缺席/null/空串不发内容事件；非空字符串含纯空白原样作为既有text。数组、对象、布尔或数字是protocol失败。每帧先检查refusal值型，随后按content→refusal→原reasoning/tools顺序处理；跨帧沿读取顺序追加，同帧排序只是本地规范化，不重建上游生成时间。

终止后的非空内容拒绝；同帧error优先于delta，不能先发该帧delta，已合法取得的facts保持。正常stop/tool_calls/length继续读正常尾帧到DONE，真实usage/cost沿原累积器；缺账仍未知。异常finish、顶层error、坏协议、取消或超时沿原停止规则，仅保留已读事实，不为未来计量额外排空连接。合法非空refusal不是失败判据，不把content_filter改为成功，不增加origin或自动过滤回放；持久reply与故障delivered的既有选择责任不变。

## 固定执行与图片复用

共享reader的相同revision不得偷换实现；贡献的实际采用绑定须与同步发布的固定组合一致。原调用固定整组reader/definition/meter、精确版本与实际输入，消费者不能热改在途闭包。stop请求、native真正结束与责任释放分开；外部付费效果不能回滚。图片转换只处理选中固定请求的材料，原件不改，具体配置与有限支持归README的图片准备部分。

scope必须为非null object，非法值同步TypeError。空或已清scope幂等，无缓存明确no-op。runtime在共享提供者下只清自己的scope，不能用preparer.close替代局部清理。失败或旧代owned句柄仍由原owner保有，不转移到新代。clearReuseScope要求实际返回值严格为undefined，不接受非undefined值或thenable冒充同步完成。清理固定且去重的owned preparer集合，每项都尝试；单个失败原样抛出，多个失败聚合抛出，不因首错遗漏其他清理。非法thenable的实际完成由原owner观察，完成前同scope／preparer不得重入清理；其拒绝不能成为无人观察的Promise。关闭新准入后仍可清已有scope；失败scope继续占预算并由原owner保有，不换新scope掩盖失败。clear不取消native在途工作，不能以隔离标签、缓存为空或listener撤除证明物理停止。关闭先停准入并取消规划，再等待网络排空、所有owned preparer真实close与native任务／decoded句柄释放、非法异步清理完成；失败保持原owner收场责任，不能提前报告closed。借用codec不被销毁。

## 验证

协议用例须独立覆盖refusal五类值、同帧顺序、跨帧、正常尾帧账、错误不drain与回放；资源用例须核固定代际、同步清理、失败保有和真实native结束。原Schema身份与精确模型绑定保持，模拟/TLS/有限模型不代替真实供应商认证。单次执行结果归工作树tmp。
