# w3-mcp-lifecycle-model 第 1 轮评审（head 12c3300cd，基线 1160e92c8）

## L3（implementation-reviewer，opus@high，本机会话派发；探针在该闭包工作树 `tmp/closures/w3-mcp-lifecycle-model/review/`）

复跑：成员快检 310 过、5 例预期失败（含 wide、two-keys，257 s）；TLC 16 份配置全部与预期一致，正控状态数与记录逐个相同；探索器读数与 README 一致；去重交叉核对（FAULTS、REBUILD、M2 变异）合并与不合并找到的违例种类相同。

阻断：
- B1（P5，租户隔离热点）：TWO_KEYS 的两个键除租户外采用修订也不同（`revision-1`、`revision-2`）。变异副本从 `connectionKeyTextOf` 删掉租户，探索器不报 P5；对端账号在两种证据里从未变化。模型里 P5 由构造成立（每次端口调用带纤程的键），不存在算错键的机制。
- B2（P6）：TLA+ `P6_LateNoEffect` 只看条目资源的代际，不是 SPEC 的 P6（消费者可见状态，以及过期 `lose` 答 `not-current`）。`forget-open` 错误下它通过，而探针 `ProbeNoLostForgotten` 被违反。

非阻断：
- N3：S9 的次序、MC-10 的关闭次序与 S8 的报告范围值没有性质覆盖，SPEC 也没声明未覆盖。变异 `closeOrder` 先释放句柄，两种证据都不报。
- N4：P6 的陈述比承诺强（release 之后落点迟到、stop 未确认时 `none` 变 `lost`（`close-unconfirmed`），是 MC-5 有意的）；`lateChanged` 只比迟到答复那一轮 drain，后续由它引起的按时答复不比（M2 变异下迟到落点引发 `lost→none` 漏报）。MC-14 的「已关闭」删除条件没有自己的性质。
- N5：`closeAll` 用 `Promise.all`，一个条目的关闭 reject 就立即答复；模型的 `awaitClosed` 等全部纤程。两键加同步抛出时可违反 P3，模型表达不出。
- N6：`known()` 按第一次抛出的位置归类，会把新种类的违例算作已知。
- N7：其他没有覆盖的承诺（代际递增、单飞、closeAll 之后不读采用、P7「不静默」、`live.cfg` 的 `Loses = 0`、`valid-two-keys` 的 `P1_ShutdownReleasesAll` 空成立）。
- N8：定理前提没写的假设（客户调用只在静止时到达；各时限上界相等；`store.read` 总答 `absent`）。
- N9：`tests/README.md`、`tests/index.md` 不在写范围内（只加索引，影响小）。

## reduce 处置（2026-11-05，本机会话）

本闭包与 `w3-mcp-lifecycle` 叠放：后者在本闭包头上重写连接表与探索器，并按 K1–K3 改 TLA+ 模型与 SPEC 的「性质与证据」。B1、B2 与 N3–N8 改的正是那些文件，所以并进 `w3-mcp-lifecycle` 一起改、一起评审，两个闭包一起合入父分支（父分支不出现证据声明错误的中间状态）。逐项：
- B1：每个键用自己的采用视图（两键修订相同，只差租户）；另加只差对端账号的场景（同租户、同修订、不同凭据绑定）；补变异证明（从键文本删租户、删账号，探索器都报 P5）。TLA+ 的 P5 格改记「模型不覆盖键的推导」。
- B2：模型里按 SPEC 写 P6（动作性质：迟到答复的动作不改消费者可见状态，除 residual 与 MC-5 的 `lost`（`close-unconfirmed`）以外）；做不到时 TLA+ 的 P6 格改记「模型未覆盖」。
- N4：SPEC 的 P6 陈述按 MC-5 写准（与探索器 `coreOf` 的投影同一句话）；`lateChanged` 把迟到答复引起的后续端口调用也算作迟到，一并比较。
- N5：`closeAll` 等全部条目关闭结束（`allSettled` 语义），再按 MC-15 报告缺陷。
- N6：`w3-mcp-lifecycle` 已删除 `known()`，每个场景断言零违例。
- N3、N7、N8：在 SPEC「性质与证据」写明未覆盖项与前提；能便宜补上的性质（S9 次序）在探索器里补。
- N9：接受，记录。
