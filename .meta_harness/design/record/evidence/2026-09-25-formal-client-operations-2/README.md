# CG1冻结输入的最终Schema检查与模型输入对照

2026-09-25，D047采用后的CG1 S1～15。Node24.21.0、workspace Ajv2020对最终公开Schema及精确EC2/IV1/OE2引用编译成功，77个正/负例符合预期。原始输出`schema-final.log`，输入在`accepted-input`，只读驱动快照与SHA256SUMS可恢复采用时输入。

这是[前次候选运行](../2026-09-25-formal-client-operations/README.md)的后续运行。旧快照只有72例；本次保留最终77例，没有原地替换旧输入。这里没有重跑TLC；逐字节核对五组r2模型和cfg与冻结规范完全相同，详见`model-byte-comparison.txt`。920状态/四负控的实际输出仍归前次r2，仅在其已声明有限边界内继续适用。

本运行不证明真实CLI/TUI、秘密输入、SQL耐久或多机生产服务。Schema不替代动态身份关联、缓存权限与提交未知的实际验证。
