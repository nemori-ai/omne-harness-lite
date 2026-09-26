# Entry2 / HT2 候选验证补充

2026-09-25。对上一运行非阻断意见补跑可达性，保留旧证据。TLC 2.19 + 同hash v1.7.4 jar；镜像/完整argv及退出码在reachability/result.json和environment.txt。

- `-continue`下完整检查804 generated /776 distinct，队列0；九个Never谓词均给出反例，列表见reachability-summary.json。此TLC参数下进程退出0，因此以原始日志的九个具名反例及完整状态遍历判读，不把退出0误当无反例。
- HT2七份HTTP答复样例独立重算体长度、完整十六进制及SHA256，全部一致；version-mismatch仍133字节，新五字段列表628字节/体512。这里只验证规范样例，不声称产品实现输出。
- Entry2最新28项Schema形状样例通过，包含真实逐路由入口字符串的允许/拒绝、AR2及预期身份。此前22项旧artifact未覆盖真实字符串反例，不以旧结论替代本次。形状检查不证明授权或事务。

精确输入及脚本/原始输出在本目录，hash见SHA256SUMS。三个有限模型仍未组合为整体精化；多组织授权的全读合成、凭据准备最终G重核、SQL回滚与业务排空必须实际验证。
