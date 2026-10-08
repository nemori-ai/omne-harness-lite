# PF-013 · 请求图片准备技术投影 v6

当前技术采用范围与排除见本页“当前采用范围”；不据此宣称实现或验证完成。

来源坐标与摘要见[provenance.json](../../design.md)。精确提供者候选为[transport v15 revision4](../../../../realization/packages/model/pi-ai-transport/v15-image-preparation-design.md)及[runtime v21 revision3](../../../../realization/packages/model/model-request-runtime/v21-image-preparation-design.md)，冻结审阅commit为`e73ae0ef5dec1032f0fc5855041b5f00d3caac7f`，各自SHA在provenance。主线预留D-109用于采用，**预留编号不是已发生的接受**；本投影不写registry或决定。

## 需求及确认范围

PF-013 rev16[档案提供的有限上限与原件不变](../../design.md#上游限制与档案提供的上限)、[§八三段交接](../../design.md#八边界与依赖)，及PF-010 rev7[要求五](../../../PF-010-context-management-and-assembly/design.md#要求五组装的输入里必须有当下生效的那份模型档案)为依据。图片超限但在声明支持的有限缩放/重编码范围内可得到合规表示时应进入后续检查；不能恒拒原图冒称完成。这是本轮用户明确要求对已有责任的具体化。

PF-010整包rev7的接受标注仍不整齐；本版仅使用本轮明确要求和PF-013既有裁决支持的图片条款，不翻其它增量正式。scope、policy数值、codec采用和搜索策略属于技术候选，不冒充新增产品裁决。

## 对象及性质

原模型档案、内容块、消息、会话日志、模型调用和响应保持既有身份；同模态请求临时图片不冒充UL-derived-rendering（它指落盘前其它模态派生），不新增持久对象。精确对象来源和4 INV/5 SAF/3 LIV见独立封存领域读数，性质到机制和IP-V1～10逐项关系见四表。

核心性质：原图与原历史不变；有效profile限制约束本次实际发送bytes；图数/单图/总量/token各自检查不替代；无法准备或缺配置零新HTTP；原outputHistory先验真，坏摘要不借full掩盖；合法实际表示变化触发前缀失效；真实任务停止前owner不释放；成功进展以资源可用、请求有效和有限候选集合内存在合规表示为前提，不保证任意图像/上游接受。

## 精确契约与操作交接

沿[RT10](../../../../spec/capabilities/model-request-runtime/v10/contract.md) S53/S54/S56/S57/S74/S77～83、[MR9](../../../../spec/data/model-response/v9/contract.md) S41～45，接受依据仍D-107的现行范围。没有新业务操作、线上字段或规格版本；准备的技术值不覆盖这些契约。

| 操作/接缝 | 前置与后置 | 失败/缺席 | 提交点与责任 |
|---|---|---|---|
| createImagePreparer及loaded codec | policy和codec显式、固定，成功取得可独立用的批准备构件 | 非法结构TypeError先于资源；合法但不可用显式unavailable；不隐式import/联网 | 无持久写；codec借用，具体owner最后销毁 |
| prepareRequestImages | 原图片已合法选入，源/像素资源校验，固定ordinal有限候选；交实际owned bytes及来源关系 | stage区分单图/总量，malformed/不可用/取消精确映射；无默认cap/quality，resource满即busy不排队 | 无业务提交；batch独占decoded资源，真实encode/close终结后才能放预算 |
| TransportAdapter.plan | 原PlanInput owned且原history真实；await准备再同一实际投影计量并签发固定计划 | 沿原PlanFailure，不把本地拒绝当上游失败；无图完整实测超量exact，有图仅知非图下界不冒actual | 无持久写/网络；prepared不是伪原历史，send不得改图 |
| full/φ/δ | full与δ沿原current basis，φ新增明确当前countingBasis；共用basis relation，原observation不改 | 原来源坏仍拒；未知依据不可用；合法θ变化full，首原因按RT10优先级 | 原O适用与前缀I相容分开；无新计量真值 |
| close/clearScope | 真实owner关准入→取消→await native终结；cache清理不取消执行 | native未停止即close未完成，不Promise.race假停 | close重复共享Promise；clearScope旧表不能回填新表；原日志/响应提交点不变 |

所有字段、值域、默认缺席结果及错误到PlanFailure的唯一精确账本在v15/v21，本投影不复制另一套接口定义。service十三操作原子批/身份/权限仍沿原契约，图片准备新增跨owner同一提交要求0。

## Cordis投影与撤除

不新建图片plugin/service/fiber。既有transport持有可替换preparer与固定codec代际，runtime通过原lease.track覆盖async plan，公开invoke使用相同路径。scope从受信session/tenant/log generation派生；shared ModelCallHost不能当单租户，独立consumer自持工厂/scope。cache仅有限进程内派生值，无通用持久缓存服务。

现有inject关系不加长调用重跑边；不新增控制事件或bail。卸载在同一明确函数内顺序drain preparer后释放借用codec，不依赖Cordis不同effect有序完成。消费者停止等待不等于真实owner取消；这条职责沿既有生命周期，不以未接受T29接口为前置。跨进程仅丢本地cache，原消息及实际投影/计量真实性仍可重新检查。

## 实施顺序与完成判据

1. 主线明确采用精确两节点、codec协议及可配置preset；核provenance，保未接受标签直到决定实际发生。
2. 实现loaded Sharp薄adapter/公开batch准备，保持原图，有限ordinal与冷热结果一致。验IP-V1～4、V9：可转换超限正例、坏图/动画/资源/有限不可达负例、不均匀多图及总量。
3. 统一迁移plan async/context、公共独立invoke和service、scope及lease.track。验IP-V5/V6/V10：无产品平台前置、两入口同bytes、取消/close真排空、租户scope不交叉。
4. 共享basis接缝及GPT5.6 full/new/φ公共consumer迁移，原O不丢、坏来源不逃逸。验IP-V7/V8：原摘要篡改拒绝、有效图片变化full、稳定后marginal、meter与wire完全对应。
5. 两包README/README_ZH、实际打包消费者及HUB最终受影响检查；codec有限probe不替代真实HTTPS和完整模型供给认证。

## 证据与缺口状态

两份节点在上述SHA上独立architecture-reviewer及spec-reviewer完成最终复核，均无各自范围阻断；完整报告对象、旧反例与修订见评审记录。新增实际bindings为0，产品代码尚未实施。

已有sharp合成8例、preset代表参数及4096有限搜索组合观察只支持有限技术可行性，不证明最大资源/全部格式/平台确定性/真实HTTP。未决政策新增0；当前门是主线采用与实施验证，非等待完整Session/Run/context设计。若实现引入授权下载、持久变体或跨owner单飞，须重新核边界，不能借本版批准。

## 当前采用范围

选中图片的请求期缩放/重编码与有限搜索；统一异步 plan/context、真实准备任务生命周期、受信作用域隔离及 full/φ/δ 的共享计量依据。既有 RT10/MR9 精确语义不改变，无新持久对象或服务键。

技术采用不表示实现或实际验证已完成。验证义务：IP-V1..IP-V10；取消等待 native 实际停止后释放；缓存冷热同结果与资源上限/native 峰值；实际 HTTPS、包制品和双语消费者；计量与实际 wire 同一依据。
范围之外：完整 Session/Run/Agent；媒体平台/外部下载/持久派生；仅由图片采用提升 T29 引用生命周期范围。
