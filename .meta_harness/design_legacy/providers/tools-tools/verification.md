# 工具状态提供者验证边界

## 已有证据的实际范围

固定来源是 `packages/tools/tools/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
（SHA-256 `315d8301babc15ddecc565aa93fa7386f75e3fc0c7e0cb4c991bd74e22b2cb0b`）。
基础 tools fork 已有 schema/definition 源码和测试；完整 ToolHost、调用状态、frames、
links 与恢复许可尚未实现。来源中的旧接受、旧 catalog 坐标和旧 `core-journal/1`
映射仅供重基，不构成当前候选的接受或实现符合性。

固定来源另有 `docs/proposals/core-capabilities/implementation/evidence/tool-decision-design/`
的两类探针及原始输出，可用 Git 上同一来源修订恢复：Cordis 4.0.2 的 T-R1 探针仅
观察 Fiber 状态同步变化、依赖暂失与旧闭包；文件窗口探针仅观察 ext4 上文件效果
与结果记录间可发生崩溃。它们支持最后门检查和 possible effect/unknown 的设计理由，
没有安装真实 Admission Gate、Tools/Run/Session 联合根，也未验证 TL 准入、执行、
停止或恢复。旧 T-R2、D01–D12、公开类型编译与形式检查没有被这些探针执行。

## 当前候选必须补的符合性证据

| 目标条款 | 必须观察的边界与反例 | 当前状态 |
|---|---|---|
| [DR-01/04](../../spec/capabilities/durable-records/v1/contract.md) + [TL-15](../../spec/capabilities/tools/v1/contract.md) | 在 DR v3 普通单 stream envelope 上定义 Tools stream/fact/operation codec 与真实 writer/replay；同 stream 一 append 内两 facts 共享 revision 而 eventId 各异。冻结调用方 append 数组与流内 facts 顺序后，在线、重试、读取和恢复都保留该顺序；重复 stream、非 canonical JSON 字节、未知版本、尾部损坏拒绝或按契约恢复。普通 envelope 的存在不自动定义 Tools 事实 | **Tools codec 未定义、未验收**；旧 `/1` 不作为兼容目标 |
| TL-07/15 + [SE-12～14](../../spec/capabilities/session/v1/contract.md) + [CC-05](../../spec/compositions/core-work-coordination/v1/contract.md) | 执行终态、`tools.call.settled` 与 `inbound.arrival.accepted{call_settlement,dedupKey=(call,attempt)}` 同一协调域同批；跨域保留源事实、目标去重和回执。Session 再按原发起 Run/等待登记裁决 continuation、context、queue、closed；只有 continuation 同批注销该登记。断电、重复和迟到不得直接造 Run ready | **未实现、未验收**；固定来源的 SR `result_linked/ready` 不能直接移植 |
| TL-07/08/09 + [RN-05](../../spec/capabilities/run/v1/contract.md) | 执行许可或 LE 接纳中较早者使 exposure open；permit→start 空窗须有持久 owner/同批或 CC-05 交接证据，不能因 LE 未 accepted 漏计。`settled(unknown)`、等待登记清空、not_found、超时、错代证据不关闭。逐项只以同 call/attempt/owner/generation/epoch/fence 的 quiescent 或 verified isolation 关闭，全部关闭前 Run 保持 stopping 与 scheduler barrier；provider 重启先恢复 fence/exposure | **空窗归属待 TL/LE/CC 联合定稿；未实现、未验收**；旧 ToolCall 模型未覆盖完整 exposure/强停门 |
| TL-01～06/13 | 真正装载/撤除、Schema 完整校验、manifest 与 skill 正文、原代绑定、准备后撤权及同门发布；旧句柄和重挂代次不能复活 | 基础声明/呈现代码存在；**产品组合未验收** |
| TL-07～12/19～20 + CC-06 | 原 operation/attempt 去重、start 回执 unknown、结果与帧顺序、预算来源、取消墓碑、崩溃恢复、旧代与资源排空；恢复须从完整 owner 基线认回而非重建旧运行对象 | **未实现、未验收** |

验收时保留命令、版本、测试范围和失败注入输出；文档检查只能证明链接与结构，
不能把候选条款或固定来源探针提升为产品 GREEN。上述通用 codec 与当前精确
Run/Session/Inbound 端口归其语义 owner 收口；Tools provider 不自行发明协议来填空。
