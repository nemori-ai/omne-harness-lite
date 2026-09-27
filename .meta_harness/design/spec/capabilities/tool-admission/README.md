# 放行判断

**一次工具调用准不准做**——[放行判断](../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-admission-decision--放行判断--admission-decision)这一件系统自带[拓展件](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)**对外的输入与输出**：
一批调用先全判完；每一项走四步（执行权限三档 → 授权表达 → [会话运行模式](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-session-run-mode--会话运行模式--session-run-mode)）；
要问人就交回一张选项定死四档（第四档写得进去才出现）的[决策卡片](../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card)草稿；放行就给一张凭据，执行运行时凭它核对「放行之后参数没变」。它在拓展点协议里的能力标识是 `omne-official:admission-judgment`；它不在时由全拒件顶上。

**它是接口型契约**：只定入出、判定次序与凭据。授权表达怎样求值、卡片怎样投递、调用怎样执行，都不在这里；
**本程实现不交付**，可独立运行的装配里这一件的实现另行决定。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.tool-admission, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`；`family=capabilities`、`topic=tool-admission`、
  `contract_path=spec/capabilities/tool-admission/v2/contract.md`；`resources` 含契约与 `examples.md`；
  依赖五项（`data.identity-values`、`data.content-blocks`、`data.tool-definition`、`data.loop-extension`、`data.asset-model`，均 v1），clauses 取自[契约 S-4](v2/contract.md#s-4-依赖方向与被消费的面)
- **formal-tasks 映射**：无——本版不建形式工件，理由在[契约 S-37](v2/contract.md#s-37-本版不建形式工件)
- **提供者/装配映射**：尚无

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。放行的判定次序、四档选项的含义与凭据的有效条件被「放行、人签、执行是同一份参数」绑在一起：判定给凭据、凭据回指判定、核对读日志 |
| 为什么是 capability 而不是 data | 它有两个被别人调用的操作、封闭的失败集合、对 runner 与执行运行时的义务；形状全部引 data 契约 |
| 为什么不并进拓展点协议的 runner | 独立变化原因不同：授权政策（PF-007／PF-008 的 owner）与派发协议（PF-012 的 owner）；runner 把它当作一件拓展件调用，**它的判定不随瀑布怎么走而变** |
| 精确依赖 | 见上；**依赖方向单向**：本契约 → 五份 data 契约；runner 与执行运行时消费本契约 |
| 接受状态 | 已接受（D-061，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1 契约](v2/contract.md) |
| 四步怎么排、答复回来之后怎么收 | [契约 S-22](v2/contract.md#s-22-判定次序) |
| 两个操作各自的九件事与失败集合 | [契约第四节](v2/contract.md#四操作) |
| 凭据指认什么、什么时候核对不过 | [契约 S-16](v2/contract.md#s-16-admissiontoken-与参数相等)、[S-26](v2/contract.md#s-26-令牌有效的条件) |
| 它在拓展点协议里站在哪、三种结论怎样投影、不在时怎么办 | [契约第六节](v2/contract.md#六在拓展点协议里) |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-33](v2/contract.md#s-33-装配给的保证-vs-协议须给的保证) |
| 走通的路径与每个失败值的反例 | [examples](v2/examples.md) |
| 哪些证据义务已触发、现在到哪一步 | [验证与覆盖](verification.md) |
| 哪些事还没人裁 | [契约第十一节](v2/contract.md#十一已知缺口) |

## 版本包

`v2/` 含 `contract.md` 与 `examples.md`。**不建 Schema**：线上形状归把这些操作送过进程边界的那份 composition，
值类型引用 data 契约。**不建 `formal/`**：判定是纯函数、没有交错；有交错的那几件（一批等人、结论先落后算、回放）归 runner 与执行运行时的行为模型。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `capability.tool-admission` v2 的全部条款，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。
