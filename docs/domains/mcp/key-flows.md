# MCP跨领域关键流程

状态：技术协作草案。图表达责任，不指定线程、进程或寿命；完整 INV 与 V 仍为正式成员承接缺项，责任见[正式承接缺口](../../../packages/mcp/docs/architecture.md#完整行为候选的正式承接缺口)。端口的实现方见[领域交接设计](architecture.md#mcp-声明的端口与实现方)，组内路径见[组内流程](../../../packages/mcp/docs/key-flows.md#组内调用路径)。

## F-MC04 动作准入至可靠结果

对应 J-MC04，INV-MC14–17。调用方（会话路径上是 Agent）或独立消费者携带可信主体与原动作/参数/消费位置。桥接复核接入点和逐动作当前资格，Tool 选择所需实际环境及资源并保护最终发起竞争。准入拒绝、参数不合法或设施不符不执行原动作，原因沿原消费位置返回；不可用沿 dummy 规则收束。

实际提供者发出原调用，Tool 保管固定输入、控制与真实结果/效果。后端已发生而本地承接不明时保留未知，不能把响应错误改成无副作用失败。结果消费者可靠保存结果和原位置，确认后原前方解除交付责任；拒收、失联或无披露权时原结果继续有人保管。转后台仍为原调用，最终收场沿 Tool，不以过程帧代结果。

MCP 交回[调用结果](../../../packages/mcp/docs/architecture.md#调用结果)或「未发出」失败后，Tool 按种类承接（技术草案）：

| MCP 交回 | Tool 一侧的交接 | MCP 一侧的后续 |
| --- | --- | --- |
| 未发出 | 记为确定无外部效果的失败，保留 MCP 给出的原因 | 无。请求没有发出 |
| `complete`、`toolError` | 按原调用保存结果。`toolError` 是动作自己的失败 | 无 |
| `inputRequired` | 原调用进入[工具等待态](../../../packages/tool/tool-contract/SPEC.md#内部等待与有效答复)，保存 `inputRequests` 与 `requestState`。需要人回答时经 Tool 的等待交给人在回路。答复成立后调用 `continueWithInput` | 带 `requestState` 与答复再发原请求。这是协议的多轮请求，不是重发 |
| `task` | 原调用转为[后台执行](../../../packages/tool/tool-contract/SPEC.md#前后台的关系边界)，保存 `taskId`，按需调用 `queryTask` | 用 `taskId` 查询，不重新发起 |
| `protocolError` | 保留错误原因与已知效果 | 无 |
| `unknown` | 保留未知，见 F-MC06 | 不重发 |

MCP 不保存原调用，也不代答输入请求。依据层：领域[模块角色与事实归属](README.md#模块角色与事实归属)；产品 [J-MC04](../../../.meta_harness/design/product/mcp/design.md#j-mc04-发起一个-mcp-动作)。

## F-MC05 取消和归档后的迟到事实

对应 J-MC05，INV-MC17、INV-MC18、INV-MC20。合法控制指向原调用，Tool 向实际提供者传播支持的取消。未发动作可阻止，已发动作区分合作请求、实际停止和未知。会话归档时，Session 经 Agent 的公开操作控制原 Tool 调用，按架构[取消与归档](../../architecture/runtime/control-and-recovery.md#取消与归档)解除推进依赖；不等共享连接关闭或远端停止。随后迟到响应归原调用，由 Agent 宿主的结果接收方按原调用身份保存效果、账目和必要历史，不恢复 Session，不向无权消费者披露。资源释放只报告实际确认范围。

MCP 一侧，`ActionInvoker.cancel` 按传输发出取消信号，见[组内调用路径](../../../packages/mcp/docs/key-flows.md#组内调用路径)。取消信号只是请求，Tool 不把它记成实际停止。

## F-MC06 失联、重连与原工作接续

对应 J-MC06，INV-MC06、INV-MC12、INV-MC17–20。连接提供者更新 MCP 连接状态，并在当前条件成立后恢复与发现，供未来调用使用。原调用拥有者查询或对账原身份：已确认结果则只接续未完成消费；查询暂不可用保留未知；真实运行连续性已丢失则按 Tool 失败规则收束。任何分支都不以新连接自动重发。恢复自身再中断，继续原进度与原事实。成员失效不销毁记录，后续访问仍核验当前资格。

断流时的交接（技术草案）：

1. 调用已发出后响应流断开或本机进程退出，MCP 对这次调用报 `unknown`。
2. 官方规格要求客户端用新请求号重新发出断流的请求。MCP 对 `tools/call` 不这样做，偏离记录见 [Q-MC04](../../../packages/mcp/docs/architecture.md#q-mc04-原调用dummy可靠结果和恢复的组合协议)。
3. Tool 的原调用保留未知。核查、补偿或另起一次调用由合法调用方决定，见架构[中断与失联](../../architecture/runtime/tool-runtime.md#中断与失联)。
4. 重连产生新的连接代际。旧代际的迟到响应不改变新状态。
5. 原调用在新代际上继续时，Streamable HTTP 现代对端可以用保存的 `requestState` 与 `taskId` 继续；stdio 上 MCP 返回 `unknown`，Tool 按未知处理。规则见[组工程设计的应用服务](../../../packages/mcp/docs/architecture.md#应用服务)。

## F-MC07 独立消费和有资格的查询

对应 J-MC07、J-MC08，INV-MC03、INV-MC13、INV-MC21–23。程序选择独立操作并显式给出本次主体、目标、用途、控制和结果消费者，缺必需条件只拒绝依赖操作。查询权威读面时标明来源及新鲜度，未知和不存在分开，查询不重做动作。输出及错误不含秘密。退出前已接纳工作保留或可靠交接；MCP 协议客户端能力不授予 Harness 系统闭包或全部非动作能力。
