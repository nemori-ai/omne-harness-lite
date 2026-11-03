# MCP组内逻辑责任流程

状态：工程设计草案。成员尚未建立，流程中的服务和端口都是候选，见[工程设计](architecture.md#模型)。完整公开行为仍在原任务的候选契约中，流程落位不表示已采用。跨领域交接见[领域流程](../../../docs/domains/mcp/key-flows.md)。本页只写本组承担的步骤。图中组外的一方合并为「调用方」，需求端口按端口名出现。

## F-MC01 接入点采用、凭据和 MCP 连接

对应 J-MC01，INV-MC01–07。

1. `EndpointInspection` 判定接入点正文。存在但非法的来源给出拒绝原因，不当作空来源。
2. `Connections.ensure` 经 `AdoptionView` 取得已采用的接入点、正文与配值。接入点已不再采用时，先关闭它原有的 MCP 连接，再报告。
3. `Connections.ensure` 经 `UseEligibility.check` 核对本次使用资格。只有 `granted` 才继续。`refused` 的原因分两类：无使用资格（`not-eligible`），或有资格但被设置挡下（`local-command-not-enabled`、`disabled`）。被设置挡下时，也先关闭原有的 MCP 连接。两类原因怎样交给读面，见[工程设计的 MCP 声明的端口](architecture.md#mcp-声明的端口)。
4. 需要鉴权时，`Connections` 经 `CredentialUse.acquire` 取得凭据句柄与对端账号。认证方式为 `none` 时，不调用这个端口，对端账号是 `anonymous`。凭据缺失或被拒时停止，不退回其他凭据。
5. `Connections` 用对端账号组成 `ConnectionKey`，按它取得或建立 MCP 连接。
6. stdio 接入点：代际加一，再经 `ProcessLanding.start(access, launch, env)` 取得本机进程。`env` 是非秘密配值加凭据句柄，秘密值由 `ProcessLanding` 注入。落点或设施不成立时停止，不静默落到宿主。
7. `McpTransport.discover` 判定对端时代并协商。成功后 MCP 连接进入 `ready`。Streamable HTTP 在这时代际加一。
8. Streamable HTTP 上对端答需要授权时，MCP 读取受保护资源元数据，交出签发者与 scope，结局是 `authorization-required`。MCP 不发起授权流程。

部分创建或取消后，依原准备身份查询及清理。资源关闭失败时保留下一处置者。首次失败不造合法清单。代际何时加一与状态转移见[工程设计](architecture.md#mcp-连接)。

```mermaid
flowchart TD
    A[调用方给出主体与接入点引用] --> B{EndpointInspection 判定正文}
    B -->|非法| R[明确拒绝并保留原因]
    B -->|合法| C[AdoptionView 交已采用接入点 正文与配值]
    C -->|已不再采用| X[关闭原有 MCP 连接 报告原因]
    C --> Q{UseEligibility.check}
    Q -->|refused 被设置挡下| X
    Q -->|refused 无使用资格| R
    Q -->|unknown| N[报 unknown 不连接]
    Q -->|granted| M{认证方式}
    M -->|none 对端账号 anonymous| K[组成 ConnectionKey]
    M -->|static 或 oauth| D{CredentialUse.acquire}
    D -->|缺失或被拒| U[不可连接 不发起动作]
    D -->|句柄与对端账号| K
    K --> S{传输种类}
    S -->|stdio| L{代际加一 ProcessLanding.start}
    L -->|不成立| U
    L -->|进程| E[McpTransport.discover 判定时代并协商]
    S -->|Streamable HTTP| E
    E -->|成功| G[MCP 连接 ready]
    E -->|对端答需要授权| Z[授权发现 结局 authorization-required]
    E -->|失败或未知| H[按原准备查询 释放或保留残留]
```

## F-MC02 合法发现与不可用

对应 J-MC02、J-MC08，INV-MC08–10、INV-MC21。

`ActionDiscovery.refresh` 在当前资格和 MCP 连接条件成立时调用 `McpTransport.listActions`，校验内容与来源后经 `mergeListing` 整份发布。每个 MCP 已知动作保留对端原样的定义，并带定义的内容摘要。

清单从未取得时报告「尚未取得」，与「已取得、动作有零个」分开。只有全部分页取完、每项合法、对端动作名不重复时才采用。逐动作权限项只在清单已取得后派生，见[设置声明与逐动作权限](architecture.md#设置声明与逐动作权限)。

无法发现不表示动作有零个。MCP 已知动作保留最近合法定义与封闭集合里的不可用原因；从未发现过的动作不生成。`ActionDiscovery.current` 交出这份视图，连同新鲜度与采用依据。对已知不可用的动作调用 `invoke` 时，MCP 返回「未发出」与原因，不启动远端动作。

## F-MC03 刷新竞争与后续采用

对应 J-MC03，INV-MC02、INV-MC09、INV-MC11–12。

求值触发后，`ActionDiscovery` 读取候选。发布前，它核对当前选择、资格、连接代际和较新的刷新。资格或来源过期时拒绝发布；校验失败时不混拼。合法的新清单只影响后续调用，撤权在下一次使用时生效。已发出的调用按原输入执行。调用方带着旧的定义的内容摘要发起时，MCP 返回「未发出」，原因是定义已变，由调用方重新判断。结构变化交给装配。在途动作不自动重发。

```mermaid
sequenceDiagram
    participant C as 调用方
    participant A as ActionDiscovery
    participant K as ActionCatalog
    participant P as McpTransport
    C->>A: refresh 指定接入点
    A->>P: 当前资格下 listActions
    P-->>A: 清单与版本依据
    A->>A: 复核选择 代际 取消 撤权
    alt 条件仍成立
        A->>K: adopt 带代际与修订
        K-->>C: 新的清单修订 供后续使用
    else 过期或失败
        A-->>C: 保留原采用 与本次原因
    end
    Note over A,C: 已发调用不改输入 不自动重发
```

## 组内调用路径

这一节是[领域流程 F-MC04](../../../docs/domains/mcp/key-flows.md#f-mc04-动作准入至可靠结果)在本组内的部分。

1. 调用方交来动作身份、参数、预期的定义的内容摘要、关联键、方式与 `signal`，调用 `ActionInvoker.invoke`。
2. `ActionInvoker` 先经 `UseEligibility.check` 核当前使用资格，再核对目标仍是可用的 MCP 已知动作，并比较定义的内容摘要。答复不是 `granted`、MCP 已知动作不可用，或定义的内容摘要不符时，返回「未发出」。
3. `ActionInvoker` 经 `Connections` 取得本租户、本对端账号的 MCP 连接，记下代际。
4. `ActionInvoker` 用关联键在在途表里登记请求号。
5. `McpTransport.call` 发出 `tools/call`，带 `signal`。
6. `classifyOutcome` 把应答分为六种[调用结果](architecture.md#调用结果)。已发出但无应答时为 `unknown`，带子因。
7. `ActionInvoker` 把结局交回调用方。`requestState`、`taskId` 与发出代际由调用方保存。

```mermaid
sequenceDiagram
    participant T as 调用方
    participant I as ActionInvoker
    participant E as UseEligibility
    participant K as ActionCatalog
    participant N as Connections
    participant R as McpTransport
    T->>I: invoke 动作身份 参数 定义的内容摘要 关联键 signal
    I->>E: check 当前使用资格
    E-->>I: granted refused 或 unknown
    I->>K: 动作可用 且定义的内容摘要相同
    K-->>I: MCP 已知动作 或不可用 或定义已变
    alt 不能发出
        I-->>T: 未发出 带原因
    else 可以发出
        I->>N: 取本租户本账号的 MCP 连接
        N-->>I: MCP 连接与代际
        I->>R: call tools/call 带 signal
        alt 有应答
            R-->>I: complete toolError inputRequired task 或 protocolError
        else 已发出但无应答
            R-->>I: 效果未知 带子因
        end
        I-->>T: CallOutcome 未知不压成失败 不重发
    end
```

`continueWithInput` 由调用方带回动作身份、原参数、`requestState`、`inputResponses` 与发出代际，再发原请求。`cancel` 按关联键到请求号的在途表定位请求，再按传输发出取消信号：Streamable HTTP 关闭该请求的响应流，stdio 发送 `notifications/cancelled`。取消信号不证明对端已停止。依据层：官方规格 [Cancellation「Transport-Specific Cancellation」](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/cancellation#transport-specific-cancellation)。

任务用状态口的 `queryTask`、`taskResult` 与 `cancelTask`，由调用方带回 `taskId` 与发出代际。这些操作都带 `access`，执行前经 `UseEligibility.check` 核资格。MCP 连接已换代时，处置按传输分开，规则见[工程设计的应用服务](architecture.md#应用服务)。

## 验证边界

F-MC01–07 的异常分支须由三份候选契约的 V-MC01–23 在实际拥有者上验证。图语法与追溯检查只检验表达。授权竞争、账号隔离、断连后的效果、迟到响应、实际资源释放及断电恢复需要真实组合证据。
