# Local asset registry provider

业务承诺归 [core/asset-registry](../../core/asset-registry/SPEC.md)。本包提供独立七操作闭包及 close，不拥有独立库、不注入 storage。正式抽象 Service 归公共拥有者；当前 local 没有正式 provider plugin，示例选择 adapter 不证明该装配入口已实现。完整 MCP 分支和缺失外部事实沿公共未实现边界，不在此处补值。

构造时校验并捕获 manifest/clock、可选 sessionTenancy/currentInputs/fixedRootInput/historicalBody、可信 deployedMeta、诊断及失败端口、monotonicNow、冲突策略和容量。不变配置不随 caller 后续改写变化。借用端口不关闭。

同 session 有界队列，容量满或有界重试耗尽明确 unavailable；已受理 Promise 不能遗失。仅已知 headMismatch 可整套重做，mint/reuse 未知回执不能盲目重发。每次 session 读取核真实 MF 头，旧 H 缓存晚完成不覆盖更高 H；进行中的调用持自己的不可变 H 视图，旧代晚结果不写新代缓存。

close 先停止新合法准入，等已受理实际调用及诊断排空后清缓存；不改变原 invalidInput 优先级。装配必须等实际完成再放 MF/clock/EIS/诊断等借用资源，不以撤除回调进入或 disposer 返回证明事务结束。

诊断仅给已核身份、H/ref、固定／实际源、阶段、冲突、结果、资源结束及实测耗时；输出／保留界归端口 owner。不输出正文、E/O、完整输入／配值、秘密或任意 raw exception message。诊断失败不改已提交结果、不吞缺陷。

历史端口的当前授权及只读恢复前置归真实源 provider；fixed-root 读权不是通用历史读权。MF 记录和 EIS 当前资格是独立快照，不承诺新共同事务。当前角色与会话捕获角色用途不同，捕获角色不免当前核权。验证方法见 [verification](verification/README.md)。
