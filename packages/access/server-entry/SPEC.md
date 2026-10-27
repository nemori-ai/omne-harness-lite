# 服务端接入行为规格

本页拥有治理协议的入口职责。消息字段和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。观察接入的新增责任见下列候选，未取得接受前不扩展现行公开操作。

## 入口职责

服务端接入接受已经完成传输保护的字节。传输保护失败时，调用者没有可信答复，对外是 `unknown`，不是 `basis-unavailable`，也不是业务结果。远程字节流必须具备保密和完整。传输路线沿[技术基础的共同技术选择](../../../docs/architecture/technical-foundations.md#共同技术选择)：HTTP JSON 控制与查询，fetch SSE 单向观察。公开操作、认证、端点与订阅语义由公开契约拥有。本页不选定具体保护协议。

接入用公开契约指定的严格 JSON 读取这些字节。读取失败是 `protocol-rejected`。它不挑选重复的 `protocolVersion`。

接入按公开契约的判定次序处理。前一步已经给出终端结果时，不再做后面的步骤。版本不是 `governance-public/1` 时是 `protocol-rejected`。版本是 `governance-public/1` 时，`disable-subject`、`restore-subject`、`end-subject` 和 `reopen-after-media-loss` 在封闭字段和登录核验之前返回 `stage-not-provided`。

必填登录证明的缺失、空字符串、未签发、已撤销，以及不是本部署签发的证明，交给 identity。对外是同一份 `denied`。时间或权威记录不可得时，identity 返回 `basis-unavailable`。接入不改写这两个结果，也不另持一份登录表。

发起者只取证明核验出的账号。请求体里的账号、组织和租户是目标。通过协议检查的请求交给 identity 与 authorization 的公开入口。接入不把存储对象放进公开响应。

## 依赖

服务端接入依赖公开契约。它依赖身份与授权的公开入口。公开契约不依赖服务端接入。SDK 不依赖服务端接入。

## 设计签名

下面的类型和函数是设计形状。本包不导出它们。它们不是已经可安装的调用。共同消息和 `outcome` 只引用公开契约。

```ts
type GovernanceEntry = {
  receive(protectedBytes: Uint8Array): Promise<unknown>;
};
```

`receive` 的输入是已经完成传输保护的字节。返回值是公开契约的响应。传输保护失败时，调用者没有这份响应，对外保持 `unknown`。

```ts
function receiveRevoke(
  entry: GovernanceEntry,
  protectedBytes: Uint8Array,
): Promise<unknown> {
  return entry.receive(protectedBytes);
}
```

接入先按公开契约做严格 JSON 读取。读取失败时返回 `protocol-rejected`，没有业务效果。协议检查通过后，接入把登录证明交给 identity 的公开入口，把通过身份检查的请求交给 authorization 的公开入口。它们返回的 `denied` 和 `basis-unavailable` 原样成为响应的 `outcome`。接入不改写这两个结果，也不把存储对象放进响应。

## 验证

入口不另写结果含义。入口在坏 JSON 上没有业务效果。版本不是 `governance-public/1` 时是 `protocol-rejected`。版本是 `governance-public/1` 时，`disable-subject`、`restore-subject`、`end-subject` 和 `reopen-after-media-loss` 不核验登录。登录证明的结果不被入口改写。下列输入的结果以公开契约为准。

- 字段表要求登录证明时，缺失或空字符串只有 `denied`。字段表禁止该字段时，出现该字段是 `protocol-rejected`。
- 留存期内的接续在激活完成时是 `succeeded`。已经激活后再注册是 `not-loginable`。
- 陌生账号接受邀请是 `not-visible`。过期且有权看见的邀请返回已有的过期终结。看不见时是 `not-visible`。
- `query-current-tenant` 不带行事租户。
- `issue-login` 的 `basis-unavailable` 不来自凭据已匹配的分支。
- 版本是 `governance-public/1` 时，`disable-subject`、`restore-subject`、`end-subject` 和 `reopen-after-media-loss` 在坏正文和坏证明下都是 `stage-not-provided`。版本不是 `governance-public/1` 时是 `protocol-rejected`。

## 观察脱离与重附着候选（#746）

本节是 [#746 revision 2](https://github.com/nemori-ai/omne-harness-lite/issues/746) 的技术设计候选，须由 PanQiWei 本人接受固定修订。它不增加公开操作、导出接口或运行实现。订阅形状与连接生命周期仍归公开契约拥有者。

### 组合责任与输入边界

候选由服务端接入承担观察的脱离与重附着组合。它消费 Session 的公开日志读面、Model 的 `current` 与内容观察端口，不读取它们的内部状态。Session 拥有已提交日志事实，Model 拥有调用状态与当前观察目标。Agent 不参与这条重附着路径，也不签发观察资格。调用、结果保管与业务控制仍由原拥有者承担。

接入从已授权读取的会话日志取得稳定 `ModelInvocationRef`。日志中的稳定调用引用是重附着的事实依据。J04 的 `stream-reference` 条目仅可缓存首次挂接的目标，不能作为恢复事实，也不能代替重新查询 `current`。公开日志读面若不能提供所需稳定调用引用，接入停止该组合并交接 Session 拥有者，不从 Agent 实例、私有存储或旧流目录补造引用。

登录识别、主体签发与目标租户的关系沿[登录到 Access](../../../docs/architecture/runtime/runtime-contract-handoff.md#登录到-access)。接入只在登录识别与账号关系核对成功后取得代租户行事主体，不接受请求体自报主体。接入为每个参与边界提供该观察者自己的显式 `Access`，不借用 Agent 或生产者的主体。会话归属、调用引用和流引用的租户须一致。持有任一种引用都不授予权限。

Session 日志读路径核其读取资格；Model `current` 核当前 facts/read 资格与引用；生产者观察端口核其观察资格及租户。接入不以某一步成功代替其他边界核权，也不以登录识别时的允许结果维持持续许可。等待后的受保护输出须遵守原端口重核规则。撤权、核权依据不可用与读取失败保持各边界原含义，不转换为观察成功或成功的 null。

### 重附着与脱离

1. 接入在当前登录与租户边界下读取日志中的稳定调用引用，携带自己的 `Access` 查询 Model `current`。定位或读取失败按原失败交回，不猜调用是否存在或执行。
2. 接入使用同一确认边界给出的 `CallState` 与当前目标。`current` 为 null 时，只呈现这份调用状态，不观察不存在的 ref。null 不表示未执行、终局或永久无目标。
3. 目标非 null 时，接入向该 ref 的生产者观察端口取得快照，再消费增量。快照与订阅衔接沿原观察端口的保证，不采用先普通读取再普通订阅来补造连续性。成功只表示取得有权读取的快照并建立该目标的观察，不表示业务工作完成。
4. 查询不提供可达性租约。旧 ref 失效时结束旧观察，再从稳定调用引用查询 `current`。目标改变后从新 ref 的快照开始，不能沿用旧 cursor、旧快照基线或把旧观察偷偷转向后继。
5. 接入串行查询，或只应用最新已发查询的响应。切换目标或脱离后，迟到的旧查询、快照与增量不能覆盖当前观察；接入释放它们占用的本地观察资源。
6. 接入拥有有界刷新策略及其计时、在途读取与观察资源。null 窗口或 ref 失效后按该策略再查，不能无界忙轮询。刷新边界耗尽或依赖持续不可用时，明确交回尚未建立或维持观察的事实，不能改写调用结局。间隔、次数、期限及对外表示由后继协议与实现明确，本候选不预设数值。
7. 观察者主动脱离、连接结束或登录撤销时，接入停止该观察的刷新，取消本地等待并释放订阅、计时与队列资源。取消能力不足或清理失败须保留诊断，不声称已经清理。迟到的受保护输出不得继续披露。重新进入观察须重新经过各边界核权。

观察取消只结束观察。上述全部步骤都不得发起、取消、重试或重发 Model 或 Tool 业务调用，不触发 Session 推进，不改变结果保管或 ACK。目录为空、null、断线与观察失败均不能成为重发原调用的依据。

### 失败交接与未覆盖

Model `current` 的 denied、invalid、unavailable 保持[原失败与读取顺序](../../model/model-contract/SPEC.md#current-的失败与读取顺序)，不得折成成功 null。生产者拒绝、快照失败、流结束与连接丢失按原观察和传输边界交回。流结束只结束该次观察，调用结局仍取权威调用状态。传输中没有可信答复时，调用者不能据此声称观察或业务成功。

Session 公开日志读面所需的引用定位、分页与读取资格由 Session 拥有者补齐或确认；本候选不声明现有 `read-history` 已提供这些能力。公开订阅消息、取消表达、连接生命周期与传输恢复规则交给 public-contract 拥有者。实际刷新、撤权、迟到响应隔离与资源清理的实现及验证由接入后继承担。观察连续的组合运行证据归 #790 H3。宿主身份、启停及归属等、模型选择分责与旧实例数据调查归 #803。
