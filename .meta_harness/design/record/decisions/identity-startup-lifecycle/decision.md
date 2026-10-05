# 启动期资源准备与 Cordis 绑定的限定采用

状态：补充设计采用，正式 helper、管理提供者及宿主未验收。

负责人 panqiwei 授权主会话继续整改。主会话在该委托内于 2026-10-04T19:26:41.560828+00:00 采用候选 A。
这不表示负责人逐条亲审，独立审阅意见也不代替本采用责任。
BASE 与精确当前输入见 [inputs.json](inputs.json)，原采用输入保留。

## 新事实及取代范围

原 [D0](../identity-integration-design/decision.md) 仅靠 effect 的启动投影未覆盖 async apply 撤除。
[实际正负控](../../evidence/2026-10-04-probe-identity-startup/README.md) 及独立 QA 确认：
Cordis4.0.4 等 apply 后才运行 effect，导致启动撤除之后 current 仍 true，迟到 setup 被判成功。
这是实测机制缺口，不是原 QA 断言误报。原反例继续保留。

采用同步 apply、独立 OwnedWork.ready 与双重就绪屏障。
公共 startAssemblyWork 的形状、失败与资源责任归 [retirement](../../../architecture/identity-integration/retirement.md#管理绑定的两种就绪)。
它组合官方 Cordis 的注入和 effect，不调用内部状态转换、不 fork 内核。
全部管理提供者、手写 host、后续 CLI/loader 必须共同消费，不可只增加 helper。
只取代原管理启动投影中允许 async apply 等资源准备的理解。
业务、三次注册提交、租户授权、唯一关闭者、逆序实际收场及原代际边界保持。

## 判断与尚未完成

独立 Choice `identity_lifetime_choice_c` 对冻结候选及追加控制未发现本轮阻断。
内核通知监听方案仍缺依赖失效前提；只限宿主调用 close 的方案会放宽原保证，未采用。
详细候选作为历史快照保留，现行责任已并入原设计正文。

QA-T2-S1-STARTUP-1 在实现层仍开放。QA 须在新资源中接续正式 helper 和管理绑定的正控，
保留原 async apply 失败；不改原冻结驱动求绿。
S1 验证首次与重复停止、部分准备、失去响应、effect失败、前后取消与实际依赖失效。
S3/S4 另须验证八管理绑定、条件子作用域、真实 host 的 ready/ACTIVE 两屏障、
迟到 Service/网络开放和确认/停止竞态；原模型与真实业务义务未被探针替代。
T2 的完整 L3 实施审阅与干净候选 QA 尚待，不能据此接受 T2 或领域完成。
