# 注册与退役诊断的实例读面增补

2026-09-29，revision 2，candidate，尚未技术采用或验证。持续消费者为 transport registry 实施者和示例诊断装配；不修改已采用正文。

## 来源与边界

沿 [RT9 S-53/S-61/S-63/S-64](../../../../spec/capabilities/model-request-runtime/v9/contract.md) 和已由 [D-076 增补](../../../../record/decisions/model-runtime-delivery-adoption/decision.md)采用的 [v15 工程观测 revision 2](../model-request-runtime/v15-diagnostics-demo-design.md)。后者要求实际 registration/retirement 事件、诊断不改变业务，以及可独立观察诊断退化。本增补只补注册表事件的借用端口和失败计数归属，不新增契约、存储、插件、服务或业务状态机。

现有 `ModelTransportService.diagnostics()` 继续返回底层网络诊断的 failed/pending/dropped，不混入注册表事件或 collector 的写盘/查询故障。collector.health仍只报告它实际观察到的接纳、写入与查询事实。任意自定义回调在交给collector之前抛错，collector不能凭空知道该失败。

## 显式端口与所有权

registry factory与现有Cordis插件配置可选接受 `registryDiagnostics: Pick<DiagnosticEmitter, 'record'>`，使用现有公共类型；装配事先以local scope和实例关联取得受限emitter。registry只借record，不取得query/export/close，不另设factory、不创建tenant作用域。单个service从构造至最终停止固定该借用；换代由装配给新service新的实例关联，不改在途旧实例。

record是同步接纳结果，不表示写盘或flush；registry不得await诊断，不以接纳失败改变注册/取得/退役结果或引用/执行计数。既有collector实现受其有界接纳约束；替代同步回调能返回是此同进程调用的前提，不能声称能抢占任意不返回的JavaScript。异常与非法返回被隔离，不把thenable当有效接纳结果或加入异步业务等待队列。沿v15替换sink与背压约束，首次thenable合同违例记一次失败并永久停止向本实例的固定借用端口继续投递；若是原生Promise，只为这一只吸收拒绝，不await它。不得每个后续事件向同一永不完成的Promise继续注册reaction。停投后的事件没有实际回调结果，不伪造合法dropped计数；已非零的失败状态持续表明覆盖缺口。装配换代新实例可绑定新端口，旧实例不擅自换端口重试。

## 实例健康字段

在现有 `inspect()` 增加两个独立只读实例累计值：

- `registryDiagnosticFailures: number | 'unknown'`：借用record抛错或返回不符合DiagnosticRecordResult的值时，每次调用加一。
- `registryDiagnosticDropped: number | 'unknown'`：实际返回合法`{dropped: reason}`时加一，包括invalid/unsupported/oversize/queue_full/closed。它表示本源事件未被接纳，不重写collector的自身计数。

recorded与dropped按现有判别联合校验；每次调用只进入一个计数分类。缺席观测端口代表本实例没有配置该输出，不伪造一次回调失败或一次dropped。两个值从零开始，不在单个贡献退役时清零；达到安全整数范围后再增加则该项显式unknown，不能绕回零或四舍五入假精确。两个service实例独立，关闭后inspect仍可读最终值。旧实例仍活动就仍保留其读句柄，沿v15装配总容量规则；本增补不新建任何留存队列。

示例只按原绑定的实例inspect展示或导出这两个状态，不与network.diagnostics或collector.health相加成一个貌似精确的失败总数。同一次拒收可以同时被源计数和collector观察到；它们是两个视角，不是两次失败。有限metrics既有label集合不扩展，本增补不另造指标名。

## 实际事件与原有保证

source为transport，stage为registration或retirement，facts为现有registration联合，binding只取已验证owned definition/实际binding的精确修订，不含configuration values、凭据、原错误字符串。非法注册输入不成为日志字段来源。重复注册不得声称发生了新的发布。

退役开始、等待、force取消请求、remaining_active、cleanup_failed及真正stopped分别以实际状态为依据；请求abort不等于已停止。正常排空、track任务、cleanup和网络池收口保持原owner，不因缺观测或回调异常提前释放。单个贡献清理完成不能冒称整个service已关闭。装配关闭顺序仍是业务先收口、诊断后flush/close；registry不关闭借用emitter。

## 验证义务与状态

新增绑定0，目前没有该增补的运行证据。必须验证：实际registry+collector接纳；同owner重复与真实发布；实际Cordis贡献替换与旧lease/track任务；force仍活动、晚到停止、cleanup失败各自事件；无端口、抛错、非法返回、合法dropped及正常recorded下业务结果一致；两个实例计数独立、关闭后保留；collector未接到的throw只在registry源计数出现，拒收不双加总；无配置值/任意错误回显。字段和事件测试通过不替代全部D6-V1～V11或生产模型认证。
