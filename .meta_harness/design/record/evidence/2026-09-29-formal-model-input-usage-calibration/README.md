# Model input usage calibration：候选有限模型实际运行

候选 MR9 / RT10 原始运行输入固定为 `f5891f5a`（HUB 等价提交 `c0415666`）。规格仍是 candidate；本证据不构成接受或实现签收。

作者实际执行：Schema 17 个完整正反例符合预期；TLC 5 个正向配置无反例、14 个负控分别触发指定 invariant。三轮展开检查 1,977,491 generated / 1,675,125 distinct 状态。命令、配置、退出码、耗时、Java/Python/TLC 版本及工具 SHA 保留在 [author-run](author-run/EVIDENCE-README.md)。每个正向任务另有与 registry task id 同名目录；负控原始轨迹见 author-run/formal。

主线独立核对 83 个输入文件 SHA、19 个配置 SHA、19 份原始日志的实际结果及退出码，见 root-hash-and-log-check.json。这是证据核验，不冒充独立重跑或规格审查。

有限范围：模型用非加性 Count 抽象输入贡献；上游准确计数、输出重放与新增贡献映射的成立是显式前提。Progress 配置对规划、发送/拒绝、准确 usage、原批暂存/提交/认回、下一轮施加弱公平性；其余安全配置不推出无条件进展。含缺失 usage、缓存非输入总量、前缀和 basis 变化、分支迟到、丢回执、原批恢复、绑定替换与同批响应/消息；不覆盖无限状态、真实 tokenizer、实际上游正确性、租户运行准入、完整 RT 生命周期或掉电存储安全。

估算配置不保证绝不超过真实窗口：EstimatedWindow 是指定负控。未执行付费请求；尚未实现增量性能优化，原百万 token 基准不能替代新路径验收。

旧运行也保留：author-run/formal-before-explicit-reply 是模型拆分 response/reply 之前的结果，不支持当前同批断言；最初 Tail(empty) 草稿错误的原始日志曾被覆盖，initial-domain-error-reproduction 保存精确错误模型与复现日志，明确是复现。初始 Schema resolver/稀疏检出失败与修正后的结果分别保留，不覆盖失败为成功。

inputs.tar.gz 保存完整候选输入快照（83 个成员已解包读取核验）；author-run/check_examples.py 与 run_formal.py 保留实际验证脚本。重跑必须选择新的输出目录，不能原地覆盖这些已发生的结果。

首次归档将冻结输入展开为 Markdown，导致导航检查把快照当现行页面并报告缺相对依赖；原失败保留在 root-initial-archive-layout-docs-failure.log。现以逐成员核验的压缩输入快照保存，不重写原始输入或运行结果。
