# 正式模型服务的注册与资源保有

目标定义、宿主端口和当前未迁范围归[公共边界](../../../core/model-request-runtime/adr/runtime-integration.md)。
本页维护Session 模型编排提供者的集成责任与验证义务。createSessionModelRuntimeLocal 使用具名宿主桥、执行支持和受管装配；独立 createSessionModelRuntime 工厂仍承担纯函数消费者的原责任。服务可见不能代替逐项架构与行为验收。

## 注册与构造

定义类归公共 `./cordis`，本地类继承 `ModelRuntimeService` 并转发同一完整操作协议。
Cordis 4.0.4 的 `Service` 构造器通过 `ctx.reflect.provide` 自动注册；同一实例不能再 ctx.provide 一次。
服务键只由定义类静态字段拥有，本地 plugin 使用限定名。

异步资源构造由具名宿主/支持服务注入和本 provider 的私有组件完成，不从函数型 Config 或闭包 construct 隐式取得整个运行时。
先登记资源责任，再构造；调用容器、保留控制、现有响应/ACK 工厂仍由本 provider 拥有。
实际资源与必要输入 ready、fiber 有效、准入代际 current 三者齐备后才对外提供可工作的服务；Service 可见本身不证明资源 ready。
类构造及发布在同步受控步骤中完成，初始化失败仍收尾实际取得的资源前缀。

## 调用与撤除

转发保留每个方法自己的结果和失败消费重载，不捕获所有异常返回 unavailable。
只对新 openCall、dispatch、dispatchAgain施加原 runtimeStopped 规则；关闭不屏蔽原读取/对账/ACK 认回。
Service 方法保有本代宿主桥的精确引用，并用本次接收者的 this.ctx.reflect.trace(原桥引用) 得到主体投影后 capture。不动态读取已撤除的服务键，也不改用后继宿主桥；setup 捕获的是原资源引用，不是供所有调用者使用的 provider 主体。
capture 的不可用来源端口、部分借用及原业务失败次序按公共边界处理；旧方法不得因重新服务发现失败而先抛异常。转发不能用丢失调用方接收者的箭头闭包替代这一步。
主体门面共享原 containers/work/close owner；创建门面不重建完整 runtime，撤除门面不关闭共享执行。当前授权、错误次序及撤权信号按公共边界处理。

停止新工作与物理关闭分开。轻量 closeAdmission 在原完整失败次序的新工作点封 openCall/dispatch/dispatchAgain，不停止已有任务、暖恢复、消费及失败来源；实际 close 才停止贡献并排空资源。不能通过顶层统一短路覆盖原资格、存在或终态结果。

原运行时 close 只有 released 才解除宿主保有。
assembly-lifecycle 保有单代关闭责任，不自行禁止其他工厂启动。应用装配必须另保有稳定拥有者的后继准入门；原树和原 binding 未确认关闭时不得放行下一代。该门不能用作租户授权。
unavailable/异常转为 retained 的未确认关闭观察；共享 control 重试同一 owner，不重建身份或换新来源清理旧内容。
晚 setup 和失败 setup 也必须登记并收尾。原源、Storage、Clock、传输和持久写者依赖留到真实义务停止/交接，不能先 await fiber dispose 再开始实际 close。

acquireCall 返回消费句柄时，其 release 通过本次调用方 effect 配对撤除；观察者和监听也落在该贡献的 fiber。调用方在异步取得句柄前已撤除时，立即交还该原句柄，不向已失效 fiber 补登记。没有消费句柄的只读结果不添加等待资源。贡献撤除只结束消费等待/观察，不能代写 durable ACK 或关闭原模型执行。
consumer.release 只请求停止，实际 stopped 后才归还 host lease；FailureSource.release 同步完成才归还，抛错保有。提供者登记每项贡献并主动关闭，不能等调用 fiber dispose 才启动收场；effect 是同一关闭的幂等入口。Session 桥撤除只交还消费句柄；原 Session 编排拥有者撤除才执行 S-36 停止及原结算。
Cordis 4.0.4 的 effect 撤除函数在重复调用时可以返回 void。归还原借用后，以独立 Promise 任务撤下 effect，并收束同步或异步结果；不等待正在完成的同一个 close，不以撤除函数返回值代替 consumer.stopped。撤除异常仍进入原诊断。
物理等待超时只产生诊断。已形成完整结果、ready 回执未知、旧 unfenced 写者未停、ACK 清理 pending 均不能被包装成完成。
旧句柄仍能按原权限/来源认回耐久结果或 ACK；能调用一项 JavaScript 方法不等于已通过授权、真实存储或当前读取权。

## 事实来源与范围

| 必需事实 | 当前拥有者与责任 |
| --- | --- |
| Session 的 tenant、日志借用与当前输入 | Session 准入与归属、SessionLog、请求准备及可信宿主桥提供实际输入；构造不得自造身份或使用示例状态。 |
| Run 终结与同前缀解释 | Session/Run 协调产生并读取原持久事实，物理模型执行器不猜测 Run 是否结束。 |
| 旧执行停止与恢复资格 | 原执行登记、实际退出观察及恢复 scope 提供依据；空 registry 不证明执行已经停止。 |
| 无 Agent 时的恢复进展 | Session 宿主扫描持久义务并推进原恢复；没有新通知也不能丢失责任。 |
| 迟到结果、费用与 ACK | Model 内容库保留原结果；Session 可靠接管完整值或引用后确认 ACK，再由原内容拥有者清理。 |

本页只约束这些输入的责任与生命周期。各提供者的兑现范围由实际公共接口、薄规格及组合测试确认；文件存在或服务已注册不代表完整产品验收通过。

## 验证义务

| 对象              | 要求与前提                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 正式 Service 接缝 | 当前采用 Cordis 版本的单次注册、初始化失败、注入换代、旧句柄、同步关准入与异步排空；真实 provider 组合另验                  |
| Retained 关闭     | assembly-lifecycle 的原 work/control 身份、失败 pending、显式同 owner 重试及依赖逆序；不能用受控 close 证明所有真实写者停止 |
| 原调用            | 十五操作、错误/授权次序、首内容、真实取消、同前缀、完整结果与晚到费用；维持独立函数使用                                     |
| ACK               | AckLifecycle/AckProgress 原模型及负控，实际保管、同提交删除/状态、崩溃认回、晚 final、停止后可读及原确认资格                |
| Session 组合      | 两 Session 的真实租户拒绝与局部故障、共同依赖失败、无 Agent 扫描、恢复实际停止/唯一性和来源换代；受控输入不能作为正式来源实现   |

有限模型与前提仍归精确 RT12 验证资源；Session 协调模型只覆盖其声明的有限域，不替代原模型首 token、响应或 ACK 义务。
本页不保存一次运行结果，不将模型绿测等同于生产提供者接受。

## 原执行来源的交接

纯工厂创建者拥有 construction 的物理资源；正式提供者自己创建这些资源。executionSource 只交给相应可信工厂创建者。
业务输入 host 不承担可信恢复来源；向它传 invocation 会扩大其关闭权限，故保持 register(close)。
来源定义归 core，生产归 local；原容器、store 和持久事实各保持原拥有者。
同步 insert 转接消除“已接受执行但最终返回失败”时的来源漏记窗口。
元数据观察不携调用私有大引用。非 ACK 停止保有原执行；已 issued 的暖恢复借用由实际 scope 收场配对释放；未 issued 准备由宿主 finally 释放。
ACK 确认后封新原句柄捕获与私有副本 pin，仍允许 metadata-only capture。原执行停止且旧借用释放后解除全部模型侧副本，再发布 cleanup=released。
因此不能把全容器保有到整体 source.release，也不能只换成持有原 invocation 来避开容器 GC。
共享 binding/owner 不保有每调用大副本是必须用真实 holder 验证的前提。
调用诊断的 emitter 关闭尝试和失败报告完成后，诊断 facade 解除 emitter 与报告回调引用。
传输层可能继续持有该 facade；关闭后它不再调用已撤除的出口，也不经报告回调保有原 invocation。
查询含糊时拒绝，不能凭顺序猜测原执行。

正式 Cordis 工厂的 owner() 仅供受信装配取得原 source 和事实借用；普通服务与 capture 不携这些能力。
不得把这个内部能力 source 直接作为普通模型调用方都能取得的服务或 capture 结果。
本接缝不表示完整 Session/Run 协调已经完成。

插件树配置是普通 JSON，不能携 LosslessNumber 类实例。四个精确数值字段用数字词法字符串，经严格验证后在提供者构造时恢复原值；复用 jsonNumberSource 保留原精度、指数及 -0。这个编码只属于装配 Config，不改变独立调用的数值类型或时限兑现范围。
