# D-116：固定Schema在构建期生成，首次校验加载原生绑定函数

- 状态：2026-10-03技术采用；实现、实际绑定和验证未完成。
- 依据：[五候选提案](../../proposals/fixed-schema-precompile/alternatives.md)、[研究与有限探针](../../../../research/fixed-schema-compile-cost/README.md)、[选择评审及处置](../../proposals/fixed-schema-precompile/review.md)。
- 授权：负责人要求继承Claude会话并继续完成整份计划，沿用检查后自主提交/PR/顺次合并授权；明确先交付增量10，再推进本增量，并禁止本会话全机排队/名额。技术采用由主会话在该授权与独立选择无未交代阻断的范围内完成，不代负责人接受性能结果。
- 精确受审正文：[revision2原件](../../proposals/fixed-schema-precompile/reviewed-design-r2.txt)，SHA256 `4967df5aec5a5bf234c1a5e4e88dd7a3692a2bff0a7bbe4c7b0b6893936d614a`；当前[施工设计](../../proposals/fixed-schema-precompile/design.md)承接同一机制并展开逐图输入。旧Claude D-114草稿没有正式登记，不能作为旧有效决定；D-114现为Cordis决定，不取代它。

## 采用范围

固定、有界、由拥有者控制的Schema图使用当前Ajv8.20 standalone构建生成CJS；第一次实际校验原生加载，固定资源不再运行期编译。保留现行Ajv选项、资源闭包、派生变换、原getSchema/compile方法、JSON/unknown语义、精确数字oracle、公开错误顺序及领域拒绝顺序。没有调用数据或作者Schema的模块增长缓存。

动态作者、MCP及端口注入图仍由显式构造者立即检查/编译并持有，随owner引用释放；不把asset-model的组合图冒充固定图。AM两个重复构造入口改传现有owner，主图与临时作者编译分别计数。validDomain/defaultFits的作者编译保持。

CB技术子入口只有code-runtime与schema-codegen两个新增；AM新增绑定ports的声明方法、两个函数参数改传owner；AE发布时复制冻结生产资源（含LC3）是有限行为变更。其他公开入口/类型不变，现有断言与预期不变；调用输入按受限迁移清单同步，不保留旧参数兼容路径。治理入口的entryValidator属于包内私有技术函数，保留.schema读数，不假称完整Ajv编译器对象。

## 共享机制与所有权

生成CJS在自身同一native require上下文取得code-runtime，raw validator关键字与文本接收函数绑定同一个原生实例。raw validator不供手写包装取得；具名导出只接无损文本、返回布尔与即时errors快照。接收侧严格解析、root/投影/16函数使用同域JSON品牌；源码/dist消费者只原生加载已绑定文本函数。不能分别从Vitest和native取得receiver/keywords。普通Ajv的unknown路径不增加文本交接；动态作者编译保持自身域，只有固定meta经原生绑定文本入口。

code-runtime不导入编译器、标准meta、生成器或根入口，无IO/TLA；schema-codegen是build-only，不进入运行时根导入图。运行时原schema-runtime类型不变，实际构造时同步取得Ajv且资源立即检查。固定meta build专用自举，不加载尚不存在的generated；固定meta与普通资源及所有定义一起交付。

固定制品及native模块缓存是有界进程所有权，不含请求值；显式作者compiler归构造者，不共享全局默认编译器。没有新的Cordis plugin/service/fiber或持久对象；现有纯值与应用装配责任保持，现有加载/撤除义务不被生成文件代替。

## 构建与失败

每个owner先清旧dist/generated，真实tsc得到helper/输入装配，再生成全部图和新鲜元数据，成功才交付。任一tsc、缺资源、坏meta、后续定义或写盘失败，非零并清本次两个目录；不回退旧制品、不发布半图。构建中不承诺给并发消费者保留旧产物。first-use缺generated/helper原抛，不收成malformed，不缓存失败。

新鲜性记录实际Ajv版本、选项、关键字顺序、资源原字节与派生结果、装配/派生/JSON/exact/pattern实现、定义/请求方法及native helper坐标与实现摘要；输入变必须重建。发布包含generated和dist，源码/dist通过owner package坐标读取同一制品，生成模块不经Vitest变换。identity不新增CB反向依赖，普通图用其owner的Ajv和开发生成脚本。

## 释放顺序与代价

先只释放CB＋messages＋identity的代表性真实实现。ROOT冻结输入，取得实际包子入口、native src/dist完整exact/meta/B1/errors/ref/dynamicRef/propertyNames/交错快照、普通unknown、干净自举及五类失败清理证据，逐项通过后才释放其余图、AM和默认owner迁移。窄探针和装配记录器不等于此门通过。最终主PR按L3独立实现评审/QA，默认owner后续PR至少L2独立QA；不由ROOT自测替代。

约二十owner/26固定图是实际装配捕获的当前范围；每包保持等价、新鲜、全部定义加载义务，MR保留导入JSON变异保护。主PR迁移AM接口时保留三个默认owner的eager时机，后续PR迁移AE发布快照与首用构造；#48第2/4均已合入，没有外部等待。

代价是额外生成制品体积、构建耗时和Ajv版本耦合；作者/端口图仍每owner每进程编译。四项（MRR导入、CLI help、PI fast、全成员fast）五轮前后交替、中位数及残留编译/总体积尚待；没有已接受的百分比门槛，不把#54隔离收益算作本增量收益。一分钟受影响入口与四分钟全快目标保持原范围，本会话单CPU读数不冒充原并发目标达标。

所有构建/测试CPU7、worker1、成员1串行，直接底层入口；明确性能全快样本不成为每个PR的自动全仓门禁。合前fetch最新main，在待合并提交计算影响面，补其实际新输入；不要把旧证据SHA改写为新输入已验。

## 取代与未完成

只取代受影响现行节点中“固定Schema在导入/初始化时编译”的具体实现时机；缺陷暴露、无半图、原值和租户保证、作者owner性质不变。各节点增加本决定的固定Schema装配页；原接受时的SHA和历史run不改写。历史retired规格/设计不因此复活，registry契约版本不变。MRR消费MS/MR/CA的静态图错误改在相应owner构建暴露，缺产物仍在首次实际消费原抛。

技术采用不是实现或验证完成。当前产品实现未改，本决定没有发布验证绑定或性能接受；形式任务仅登记，未执行TLC/Alloy。正式逐图节点已写入本工作树；当前设计检查、完整计划全文核对、实际三成员扩散门、约二十owner迁移、两个PR交付、性能以及最终接受仍须逐项取得证据。

## 2026-10-03 主体交付事件

20 个固定图成员及 AM 同 owner 消费迁移已实施，运行证据与有限技术签收见[主体交付记录](../../evidence/2026-10-03-tests-fixed-schema-main/README.md)。本事件取代上文「取代与未完成」中当时关于主体实现/验证未完成的状态，不改写当时的技术采用依据。三默认 owner 与 AE 生产 Schema 发布快照仍待后续 PR；性能读数保留冻结输入及单 CPU 前提，不提升原正常并发目标的接受状态。


## 2026-10-03 AE 快照身份断言的有限迁移

已接受的[AE装配设计](../../proposals/fixed-schema-precompile/design.md)明确复制生产 Schema/ports。旧测试四处端口身份断言与该选择冲突，实际[原失败](../../evidence/2026-10-03-tests-default-schema-owners/README.md)保留。窄[选择判断](../../proposals/fixed-schema-precompile/default-owners-identity-choice.txt)无阻断、无新增产品选择，未代替运行验收。主会话在本决定原技术交付授权内采纳以下迁移。

仅取代本决定「现有断言与预期不变」在 AE body-domain.spec.ts 及 tools/core-verification/src/w6-asset-consumer.ts 各四处生产 port 对象身份断言、以及后者一处 LC3 Schema 身份断言上的适用：新断言核新 port、新 Schema 身份、Schema值与category等价，以及 judge/deriveDeclarations/references引用不变。五类keys、容器/端口冻结、LC3原值等价及其他业务断言保持；增加LC3不同Schema身份。深冻结、原JSON反控、首用失败与重试继续履行既有义务。没有新增公开入口、缓存政策或兼容层；原失败、后续执行和L2独立验收各留自身输入。


## 2026-10-03 默认 owner 后续交付事件

AE/EIS/registry默认owner与AE发布快照已实施并取得独立L2六标准通过。[后续运行与有限签收](../../evidence/2026-10-03-tests-default-schema-owners/README.md)取代前文当时「默认owner后续交付仍待」的状态。显式工厂、作者Schema与已有领域保证保持；九处身份断言依上条有限迁移，不再声称原assertion全部逐项不变。原MRR一次unavailable未复现但原因未定，接受范围与风险在运行记录中明确，不提升性能或整体产品接受状态。
