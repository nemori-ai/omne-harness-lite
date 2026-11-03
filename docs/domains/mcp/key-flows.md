# MCP跨领域关键流程

状态：技术协作草案。图表达责任，不指定线程、进程或寿命；完整 INV 与 V 仍为正式成员承接缺项，责任见[正式承接缺口](../../../packages/mcp/docs/architecture.md#完整行为候选的正式承接缺口)。端口的实现方见[领域交接设计](architecture.md#mcp-声明的端口与实现方)，组内路径见[组内流程](../../../packages/mcp/docs/key-flows.md#组内调用路径)。本页只写 MCP 承担的步骤与交出的东西，不写其他领域的内部步骤。

## F-MC04 动作准入至可靠结果

对应 J-MC04，INV-MC14–17。调用方携带可信主体、接入点引用、对端动作名、参数、预期的定义的内容摘要、关联键、方式与 `signal`，`continueWithInput` 另带 `requestState`、输入答复与发出代际。MCP 按（租户、主体、关联键）登记在途调用，同一个键已在途时返回「未发出」，原因是关联键重复。MCP 复核接入点仍已采用、当前使用资格、MCP 已知动作的可用性与定义的内容摘要。接入点未采用时答 `not-available-to-you`，与无权、不存在不可区分。条件不成立时，MCP 返回「未发出」与原因，不发起原动作。逐动作的准入与参数校验在调用方一侧，见领域[主路径与交接](README.md#主路径与交接)第 3 步。

条件成立时，MCP 发出协议请求，交回[调用结果](../../../packages/mcp/docs/architecture.md#调用结果)。后端已发生而本地承接不明时，MCP 报 `unknown`，不把响应错误改成无副作用失败。MCP 交回的东西与 MCP 一侧的后续如下（技术草案）：

| MCP 交回 | 含义 | MCP 一侧的后续 |
| --- | --- | --- |
| 未发出 | 请求没有发出，没有对端效果。原因含定义已变、关联键重复与需要授权 | 无 |
| `complete`、`toolError` | 对端的结果。`toolError` 是动作自己的失败。`complete` 带 outputSchema 的校验结论 | 无 |
| `inputRequired` | 对端要求输入。交出 `inputRequests`（只有 elicitation）、`requestState` 与发出代际 | 调用方经 `continueWithInput` 带回答复时，带 `requestState` 再发原请求。这是协议的多轮请求，不是重发 |
| `task` | 对端转为任务执行。交出 `taskId` 与发出代际 | 调用方经状态口查询、取结果或取消，不重新发起 |
| `protocolError` | 错误码与原因。不证明没有效果 | 无 |
| `unknown` | 效果未知，带子因：断流、进程退出、本地放弃。`signal` 触发或 `cancel` 之后，子因是本地放弃 | 不重发，见 F-MC06 |

MCP 不保存原调用，也不代答输入请求。依据层：领域[模块角色与事实归属](README.md#模块角色与事实归属)；产品 [J-MC04](../../../.meta_harness/design/product/mcp/design.md#j-mc04-发起一个-mcp-动作)。

## F-MC05 取消和归档后的迟到事实

对应 J-MC05，INV-MC17、INV-MC18、INV-MC20。合法控制指向原调用。MCP 一侧，`ActionInvoker.cancel(access, correlationKey)` 按（租户、主体、关联键）定位在途请求，再按传输发出取消信号，见[组内调用路径](../../../packages/mcp/docs/key-flows.md#组内调用路径)。只有同一租户与同一主体能取消。取消不要求当前使用资格，因为取消只减少效果。未发出的动作可以阻止。已发出的动作，MCP 只答已发出取消信号、没有在途调用或 `unknown`，原调用的结局随后是 `unknown`，子因是本地放弃。取消信号只是请求，不证明实际停止。

取消不等共享连接关闭或远端停止。取消之后到达的迟到响应，MCP 按原关联键与代际识别，不归到新调用。资源释放只报告实际确认范围。依据层：架构[取消与归档](../../architecture/runtime/control-and-recovery.md#取消与归档)。

## F-MC06 失联、重连与原工作接续

对应 J-MC06，INV-MC06、INV-MC12、INV-MC17–20。连接提供者更新 MCP 连接状态，并在当前条件成立后恢复与发现，供未来调用使用。任何分支都不以新连接自动重发。成员失效不销毁记录，后续访问仍核验当前资格。

断流时的交接（技术草案）：

1. 调用已发出后响应流断开或本机进程退出，MCP 对这次调用报 `unknown`，带子因。
2. 官方规格要求客户端用新请求号重新发出断流的请求。MCP 对 `tools/call` 不这样做，偏离记录见 [Q-MC04](../../../packages/mcp/docs/architecture.md#q-mc04-原调用dummy可靠结果和恢复的组合协议)。
3. 核查、补偿或另起一次调用由合法调用方决定，见架构[中断与失联](../../architecture/runtime/tool-runtime.md#中断与失联)。
4. 重连产生新的连接代际。旧代际的迟到响应不改变新状态。
5. 调用方在新代际上继续时，按传输与对端时代分开处理，见下表。规则见[组工程设计的应用服务](../../../packages/mcp/docs/architecture.md#应用服务)。

| 操作 | Streamable HTTP 现代对端 | Streamable HTTP 旧对端 | stdio |
| --- | --- | --- | --- |
| `continueWithInput` 与任务操作 | 用保存的 `requestState` 与 `taskId` 继续 | 在途状态属于旧会话，返回 `unknown` | 旧进程的在途状态无法证明，返回 `unknown` |
| `cancel` | 代际已换时返回 `unknown` | 同左 | 同左 |

## F-MC07 独立消费和有资格的查询

对应 J-MC07、J-MC08，INV-MC03、INV-MC13、INV-MC21–23。调用方显式给出本次主体与目标。MCP 只要求所选操作实际依赖的条件，缺必需条件只拒绝依赖操作。读面标明来源及新鲜度，未知和不存在分开，查询不重做动作。未采用的接入点与无权、不存在一样答 `not-available-to-you`。MCP 动作清单在调用方首次经 `refresh` 触发发现之前答「未取得」。输出及错误不含秘密。MCP 协议客户端能力不授予 Harness 系统闭包或全部非动作能力。
