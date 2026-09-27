# model-profile 本地义务与实际证据

采用冻结data.model-profile/v1、节点design／verification；源码cd67215b、HUB735ee728的同包字节。
原[185项JSON](raw/model-profile/vitest.json)、[具名test log](raw/model-profile/test.log)、[HUB包log](raw/hub/w2-model-profile-hub.log)；
作者[coverage.json](raw/model-profile/coverage.json)为交接说明，结论在此经源码与原结果核对，原件未改。

| 本地条款／义务 | 实际test ID与原结果 | 本次scope与外部owner |
|---|---|---|
| S-1/2/4～9/12形状、范围与凭据不放记录 | `EX-1-*`／`EX-2-*`／`EX-5.*`、`S10-SHAPE`、`TYPE-S22-S27-S28`；[JSON](raw/model-profile/vitest.json) | 模块形状通过；来源产生方式、所在范围存放与写路径不可改归目录 |
| S-24/25/26四文档表示与次序 | `EX-1/2/3/4/6/10-*`、`M-FIRST`、`JSON-BOUNDARY`；[log](raw/model-profile/test.log) | 155实例、malformed优先、5规范次序例通过；没有将拒绝解释为目录判定或授权 |
| S-18跨字段、S-28建档内容 | `S18-ModelProfile`／`S18-ModelProfileContent`、`EX-10-*`、`EXACT-LIMIT-*`、`EXACT-INTEGER-ORACLE`；[JSON](raw/model-profile/vitest.json) | 两种文档相等／小于通过，大于拒绝；M12含listed亦拒；真实建档／导入invalidInput且无写入归目录 |
| S-13/14值匹配 | `EX-3-*`、`S14-MATCH`、`S14-SCOPE`、`TYPE-S13`；[JSON](raw/model-profile/vitest.json)，[独立consumer](raw/hub/w2-model-profile-consumer-runtime.log) | 官方／custom不混，scope每个分量显式比较；不跨层回退，withdrawn形状仍可匹配；解析三种收场与持有资格归目录 |
| S-15/16/17/19/20参数词表 | `EX-4-*`／`EX-2-*`、`S17-S20`、`SCHEMA-TYPES`、`TYPE-MODALITY-NUMBERS`；[JSON](raw/model-profile/vitest.json) | 缺席/null、extra项名与原值不改的纯值结果通过；实际出站缺席不补、上游同义别名／翻译／留痕归runtime adapter |
| S-22不带凭据 | `EX-2-*`／`EX-10-*`、`TYPE-S22-S27-S28`；[JSON](raw/model-profile/vitest.json) | 文档本身与公开类型通过，不证明全部交换／展示／日志无凭据 |
| S-27快照公开形状 | `EX-9-*`、`EXACT-SNAPSHOT`、`TYPE-S22-S27-S28`；[JSON](raw/model-profile/vitest.json) | Schema/type通过，judge不接受快照文档种类；原样复制与后续改档／撤回不影响快照归请求runtime |
| Modality唯一定义／Schema副本 | `SCHEMA-BYTES`、`TYPE-MODALITY-NUMBERS`、`EX-5.3-*`；[153输入audit](audit.json) | type与Schema从content-blocks公开入口取，副本与冻结原文同字节，未复制另一份模态定义 |
| M36精确数字投影 | `EXACT-PARAM*`／`EXACT-LIMIT-*`／`EXACT-EXPONENT`／`EXACT-INTEGER-ORACLE`／`SCHEMA-TYPES`；[JSON](raw/model-profile/vitest.json) | 原字面整数／小数／指数核界，固定seed64样本独立BigInt oracle；有限测试，不证所有数字或所有JSON传递点 |
| SYS-OPEN公开dist与纯性 | [作者types](raw/model-profile/consumer-types.log)／[runtime](raw/model-profile/consumer-runtime.log)、[HUBtypes](raw/hub/w2-model-profile-consumer-types.log)／[runtime](raw/hub/w2-model-profile-consumer-runtime.log)、[24rules](raw/hub/w2-purity-scan.log) | strict声明consumer、built runtime、Schema和scope匹配实跑通过；仅扫描当次model-profile/asset-model源码，不证明外部消费者隔离 |

阶段外完整义务见原coverage的external清单：S-3同格原子判重、S-10/11在册与时间、S-13/14/23传递及授权／三收场，
S-5/6/17/18/21/27真实请求选择、出站与快照，S-22/28真实建档／展示写路径。
上游当刻输出上限仍须有接受契约规定的事实来源；此处不补造来源或已发生调整。
