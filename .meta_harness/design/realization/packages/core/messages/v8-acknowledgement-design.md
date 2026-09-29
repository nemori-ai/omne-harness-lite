# ACK 记录、原账见证与无损语义摘要

2026-09-29，revision 1，candidate，未接受/未实施；新增binding 0。前驱为D110的[v7](v7-design.md)，资源注册边界沿[公共定义闭包纠正](public-definition-resource-closure-followup.md)。输入为PF013 rev17 §6.19、MS8 S56～59、MR11 S49、CA4 S43及RT12 S95～103的同批候选；采用仍归主线，不能据catalog候选写成accepted。

本节点仍是纯数据包，没有Cordis plugin/service/fiber、Storage、权限提供者或清理任务。共同内核采用D025 Cordis4.0.4；本包不直接消费其生命周期，不新增上游主张。摘要判定不是确认/处分权限，清理与日志认回完全归模型runtime。

## 契约到公开面的投影

| 责任 | 候选公开面/构件 | 采用与缺口 |
| --- | --- | --- |
| MS8 S58 ACK/见证形状 | root类型、现ModelInvocationRecord judge/brand/文本入口新增第八技术分支；导出ModelCallAcknowledgedRecord/ModelCallAccountingWitness/ModelCallSemanticDigest | 只核值，原日志壳/原ready来源、ACK权限与真实释放由runtime核 |
| MS8 S56值语义摘要 | 候选createModelCallSemanticDigest(role,value)、judgeModelCallSemanticDigest(role,value,digest)共用一个编码器 | 值先按CB3严格无损JSON owned；失败malformed，不执行getter、环境查询或容错修补 |
| MS8 S57/S59 | witness及引用局部关系judge：合法枚举/字段联动、同一字段身份/角色、无重复精确payload refs | 跨日志身份/相等无法从单值证明，不拿brand成功充授权/真实来源 |
| MS8不变消息与v7关系 | 现judgeModelReplyMessage/CreatedPayload及消息/块纯函数保持 | ACK不属于Message/OutboundMessage；不把它放进上下文；无原块修改许可 |
| 精确规范图 | 当前root统一MS8、./schema与必要历史规范资源 | 仅当前公开54 defs及被实际引用的defs闭包；每份资源原字节完整，依赖的其他defs不递归全编译 |

候选函数返回沿本包惯例 `{ok: ownedValue}|{rejected:'malformed'}`；create成功值为正确角色的ModelCallSemanticDigest；judge成功回owned摘要。所有名称在采用前为候选。输入与结果分离，重复等值同角色同hex。摘要的可信来源必须由runtime另核；给任意调用者算SHA不意味着能伪造原ACK证明。

## 编码与依赖

实现逐字遵循MS8 S56；创建与结果角色共用类型树、精确十进制与UTF-16代码单元编码，仅role参与域分离。先沿现lossless JSON入口拒绝非法值，使用已有精确数值构件解析系数/指数；不经Number、不展开巨大指数。可迭代/流式喂成熟SHA-256（提供者可用Node标准crypto），不新建通用canonicalization包，不把现投影digest算法偷偷改成新语义。原payload字节hash原样保留，不能互换。

MS8 witness CredentialScope引用本Schema已有定义，沿既有D060无环同形义务与MR11/CA4对齐，不复制出第三份。直接CA值引用统一新CA4；MP5/MP6/TD3等精确依赖仍按实际defs可达保留。候选静态预期闭包为MS8、CA4、CB3、CB2、IV1、MP5、MP6、OE1、TD3九资源；必须由最终Schema重新导出并以删任一必要URI的编译负控验证，不能把此表当执行通过。新版本Schema是整份精确资源，不能裁剪未编译defs或伪造旧$id别名。

公开当前root不保留旧判定执行入口/形状补全；被精确规范引用的历史资源是值含义依赖，不是兼容运行模式。原冻结版本不修改，LC6/AE2等其他consumer不因本节点改名自动升级。

## 装卸、配置与迁移

加载只建立固定Schema判定器和纯函数；没有注册、外部句柄或撤除任务，模块释放不改变ACK事实。缺失规范资源在构建/初始化明确失败；运行坏值沿malformed，不以空对象代替。Storage要求无；本节点不得提供delete、acknowledge、权限或日志读取方法。

迁移影响root类型/技术记录union、文本/对象judge、Schema注册与公开资源、packed消费者及README/README_ZH。runtime和demo消费新类型，MR11消费MS8 Assistant及摘要helper；原compaction/session治理不在本轮实现边界。现有纯消息判定未改部分可按精确diff复用旧证据，新ACK/digest必须新验。

## 关键选择与反证

| 选择 | 落选方最强理由/本方代价 | 判断 |
| --- | --- | --- |
| 复用MS现lossless值层+单摘要函数 | runtime各自hash可少一个导出，但会形成两种创建/结果相等规则；本方增加小公开纯面 | 高置信：算法由MS8拥有、跨读写消费 |
| 只判可观察局部关系 | 把source/permission塞judge看似一站式；本方要求runtime显式验证来源 | 高置信：无环境纯函数无法证明实际日志/当前身份 |
| 只编译公开defs可达图 | 全依赖defs易扫描但引入未消费环；本方维护精确图与负控 | 沿已评审资源纠正，不扩大闭包 |

验收见verification M8-V1～V6；当前没有实际源码/测试证据，不新增bindings。
