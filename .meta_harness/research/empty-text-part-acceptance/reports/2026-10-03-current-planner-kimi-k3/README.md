# 当前生产规划／发送的单请求观察

2026-10-03T09:29:59.668Z～09:30:05.247Z，候选 `56c446ab842e2e2e69a120755019e2ad553e09e1`，Kimi K3／`moonshotai/mxfp4`，definition 3／`pi-ai:moonshot@mp4-19`，一次 send，结果 complete，供应商展示名 Moonshot AI／上游 model `moonshotai/kimi-k3`。回复为「A solid red square.」。

源用户块为 image＋空文本，实际准备后的固定 final body 只保留 image_url；当前公共 transport.plan、invokeModel 与 send 使用同一 588 字节序列化，请求包含一个非空 system 指令、32px 图片、max_tokens 64、effort low，store false，固定 provider且不回退。计量／限制与完整原始 outcome 在 [result.json](result.json)，实际发送前序列化体在 [planned-request.json](planned-request.json)。

上游实际输入 118、输出 55（推理 35），费用 `0.001179` USD。历史 97 请求重新累加 `0.2320266`，本轮累计 `0.2332056`，上限 5 USD；[账本](ledger.json)两条均 settled，一条是带来源的历史聚合、一条是本次调用。预留 1 USD 后才准许唯一副作用，没有自动重试。钥仅在内存读取，没有写入报告；组织标识已脱敏。

[provenance.json](provenance.json)给出逐文件 SHA；两个规划来源脚本保留原字节与原运行位置，归档副本不是可以直接重复付费的入口。最初本地脚本缺 target，在读凭据／联网前拒绝，补完整正式输入后本地 preflight 通过，再执行上述一次 live；失败日志留在任务区。

[Anthropic 本地反例](anthropic-local-50.json)是另一条 Sonnet 5 官方 binding 的三个当前公开 plan 调用：图＋空文本的两个排列 unavailable，纯图规划成功，网络 0；归独立 issue，不修改它的缓存规则。

本观察只支持此时这一条 Kimi 当前生产请求被接受；不证明另一叶的修后上游接受、所有空串消息或历史位置接受、37 模型认证、图像计量误差界，也不提升原研究的未知项。
