# Cordis装配与撤除

采用官方`@deepseek-ai/cordis` 4.0.4；依据IC-1～19及实际basis源。候选推荐每Session独立Context，真实选择与限制见提案；不复用DSH agent。

## 接缝与树

进程root拥有Storage／Clock／identity／定义与装配查询／模型工具执行池／Session协调及恢复调度。
`SessionRuntimeService`定义在core/session-runtime的`./cordis`，其Operations仅由纯根接口映射；provider构造继承Service并显式provide同一静态键。
日志、model runtime完整operations等接缝各只一个定义拥有者，provider不另造兼容Service定义。独立函数从纯根导出，`./cordis`不被根反向导入。

发行／运维两层插件树仍只含可序列化插件标识、公开`./cordis`export、配置与明确关系。不能塞Context、Storage实例、函数、AgentDefinition运行对象、凭据或动态会话插件。
运行对象通过明确provide／inject绑定取得；序列化配置只给经校验的来源坐标和策略。没有真实配置不能标ready，也不以PENDING掩盖缺失装配输入。

每个Session创建独立Context和一个宿主fiber作为整个会话贡献的父。动态贡献通过宿主安装，所有注册使用调用方ctx.effect；显式内部Session身份不能换成ctx.get全进程猜测。
共同纯接口经“会话绑定桥”在该Context中提供：桥绑定可信Session／租户及服务代际，逐操作仍验证显式身份与权限；它不是新通用scope框架，也不产生额外领域对象。
所有事件在会话Context内发出；跨Context交回必须经受理／结果端口，校验归属并先保存。不直接在全root广播业务payload让各Session自过滤秘密。

## 生命周期及IC-17

| 资源 | 准入与装载 | 撤除／完成条件 |
|---|---|---|
| 会话Context宿主 | 验证创建与合法装配后发布；动态插件只属于该会话 | 先关准入／失效代际，再撤宿主fiber及贡献；查询历史不删。A失败／撤除不移除B |
| Agent执行fiber | 当前attempt与准入条件有效，注册owned work后驱动 | 同步撤推进／effect登记；交还原调用句柄；等待本fiber实际owned jobs交还／drain，不取消执行池原调用 |
| 会话桥 | 指向当前明确提供者代际，调用方effect绑定贡献 | 提供者退出同步关新准入，旧工作保持原义务；真实在途交接完成前不能释放它所需依赖 |
| 模型／工具执行池 | 进程稳定宿主，独立原调用身份 | Agent撤除不停止池；显式执行取消／provider关闭才沿原协议收场，保存结果费用后责任交接 |
| 恢复调度 | 在root持有，能访问持久义务索引 | 关扫描准入，等待本批事务完成；未完成义务留持久索引由后继继续 |

plugin抛错只说明fiber失败事实；会话fault owner仍记录失败并收资源。显式异常不吞成成功；共享提供者失败影响多个Session时归共享依赖诊断，不能假称故障仅一个会话。
取消、Agent交还、会话贡献整体撤除、Session归档和进程root关闭是不同动作；只能按对应产品目标更新事实。

## inject连续性

必需依赖用IC认可inject；4.0.4没有可选inject语法，optional依赖用显式拥有者和ready判定，不伪造API。
依赖换提供者会重跑消费者插件体，因此插件体不是“只执行一次”的持久操作。每次先恢复固定身份和位置，再登记贡献，不凭重跑新建call／Run／attempt。
同步invalidate旧准入并保代际，await旧owned work实际交还／结算，按assembly-lifecycle既有retained-work机制保留旧依赖；框架并发dispose不能证明业务drain顺序。
新代际只有在旧推进拥有者已交还、持久栅栏与原执行对账完成后接手。旧句柄可观察原结果但不能发新动作；它释放不等于实际执行取消。
若实际执行提供者也被替换，先阻新发起并按其原journal接续／失联规则交接；没有可证明交接则保未完成，不能重发同义调用或提前销毁费用来源。

## 事件、控制与配置

| 事件／端口 | 唯一定义与模式 | 内容与责任 |
|---|---|---|
| `session-runtime/work-recorded` | core/session-runtime定义，notification／同步emit；提交后尽力 | 仅tenant、Session、sourceToken，不带内容或秘密；发出方try包住同步listener失败，记录诊断而不改变成功回执；持久扫描兜底 |
| `session-runtime/progress-updated` | core/session-runtime定义，notification／同步emit | 版本化非秘密进度提醒；发出方包住同步失败，读API查实际投影，不能靠事件作为事实权威 |
| 核心受理／取消／发起／承接 | 有返回值的Operations调用；不伪装通知 | 返回明确成功／拒绝／unknown，带稳定操作身份；若未来确有可否决异步控制事件须serial，不能async bail |
| 会话动态业务通知 | 其业务拥有者定义typed event及mode | 在独立会话Context，不用裸event等于SessionLog消息；真正入日志须显式业务操作 |

全部Config在入口通过StandardSchema及semantic校验；限流、重试、扫描批量／并发、缓存资源界、关闭策略是必需显式输入或已接受策略引用，不新编默认值。
同步emit监听者不得返回Promise；需要异步工作的监听者必须自己登记owned work并兜住失败，不能把未观察的reject交回emit。若将通知改为parallel，发出方必须await并包住AggregateError，仍不能改变已提交操作结果；该模式变更先同步定义与派发点，不静默换语义。通知scope采用定义包名，事件部分用过去分词，遵守IC-10～12。
effect用于贡献生命周期，不用于可靠投递／数据库事务。ctx/isolate标签不是授权；跨边界API仍显式租户与主体。

## 未来跨进程

Context独立只保证同进程可见性与fiber所有权，不等于远端故障隔离、持久队列或分布式租约。
桥替换为协议时须保稳定call／消费位置／代际，带认证的租户／主体、可靠ACK、重试去重、远端在途取消与失联证据；共享同提交替换成明确交接协议。
时钟／超时不能证明远端没有执行。领域身份、终态吸收和一次承接保持；协议真实性／分布式活性须另行验证。
