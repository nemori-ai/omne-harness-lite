# v-next：v12 之后的候选待并入项

2026-09-30。本目录只收 v12（已接受冻结，[决定](../../../../record/decisions/model-runtime-reference-lifecycle-adoption/ack-contracts-decision.md)）之后由[ACK 后新处分接缝 revision 2](../../../../record/proposals/model-runtime-reference-lifecycle/ack-post-confirmation-settlement.md)产生、必须在下一版本正文并入的候选材料。它不是已经开出的 v13：没有 `contract.md`，不登记 registry，不改变任何消费者的采用；下一版本起草者从这里取待并入项并按 `harness-design-handbook` skill 的「规格演进」发布。

## 待并入正文

- **S-99⑧ 补句（评审 R1）**：暂存行保存的是最近一次结果尚未确知为零写的追加所用的完整批（连同原批身份、判重键与来源前缀）；`tailChanged` 确认该次整批零写后，按 S-71 策略重构的完整批必须在新的追加可能生效之前耐久更新到该行；回执未知期间禁止覆盖该行。来源：接缝 §最小承接选择「暂存行的精确含义」。v12 [S-99⑧](../v12/contract.md#s-99-ack-后的真实处分与-retainedresult)原句保持。
