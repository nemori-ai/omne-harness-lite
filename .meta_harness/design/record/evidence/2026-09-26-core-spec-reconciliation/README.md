# core 实施反推的规格矛盾（2026-09-26）

固定旧输入摘要见 [inputs.json](inputs.json)。原接受版本保持冻结，本包记录反例与独立只读规格审查；不提供新版本的接受或产品完成证据。

[CB2 公开产物反例](CB2-invalid-name-probe.json)由主调度在当前 HUB Node24.18.0 实际运行：以公开 `judgeContentBlock` 判完整未解析 `tool=bad:name` 调用，返回 `malformed`。这与 SA2 S10(2)/S11 依 D060 N32 原名保留为合法未解析调用的输出要求冲突。另一反例是 SA2 examples §5第25/26行：两行 head 模态不符却期望索引错误；S25/AR S28 明确表示层在先，且 SA 版本外 verification 的旧修订记录已经明说应为 `head_modality_mismatch`。

独立 `verification_navigation_review`（spec-reviewer）基于 a5c54b15 只读核对确认两项矛盾，未运行产品或接受实现。还核了完整非法输入结果：Messages/MR/Loop 可接这类调用；TD 先 CB 表示判断再禁止内容调用，故其同一非法输入的结果将从 malformed 变 result_call_in_content；AR 两条禁止块类路径最终仍 malformed，可在仅此差异前提下保持2。AM/AE 只消费标准正文，但 AM2 所钉 TD2/Loop2 的资源不能凭换默认端口得到3。处置范围与新版本审阅交接归 [D068 主题](../../decisions/core-implementation-spec-reconciliation/README.md)。

旧模型未覆盖工具名形状及表示拒绝顺序，旧 TLC 证据不能消除这两项反例；本次没有重新运行形式工具。
