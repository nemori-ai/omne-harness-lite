# 最终输入估算准入的有限模型运行

2026-09-28，spec作者运行FinalPlan两正配置与九个指定负控；独立spec-reviewer读取全部原输出并核当前模型及11配置与保全输入逐字相同，主线复制后逐文件核SHA。实际输入、命令与输出在 [run.tar.gz](run.tar.gz)（103文件逐项核验；摘要见[SHA256.json](SHA256.json)）。

两正退出0，分别8737与8545个不同状态；九负均退出12并命中各自指定断言。其他继承模型没有重跑。形式性质只涉及该有限模型的门、估算标识、余量与usage分离，不证明真实tokenizer、任意十进制实现、序列化代码或网络结果。没有付费调用。技术采用见 [D-101](../../decisions/model-token-estimate-adoption/decision.md)，不等于实现验收。
