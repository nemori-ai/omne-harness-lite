# 2026-10-03 · 默认 Schema owner 的运行记录

## 初次身份断言冲突

候选 `b03945d7ea2ed341e37569f6b0a30078a9aaca39`，基线 `52bc6005dc168f2254d21ff79f6cd2df021676b8`。三默认 owner 的实现来自 D-116 已接受的 AE 生产 Schema/ports 发布快照与首次使用构造。此阶段独立验收尚未执行。

实际 AE 慢层128条中127通过，旧 body-domain.spec.ts 的第一个 toBe(originalPort)失败。原[结果](identity-original-failure.json)、[输出](identity-original-output.txt)、[输入](identity-inputs.json)及[摘要](identity-provenance.json)保留。原端口已冻结，复制 Schema 后发布新 port，与四条旧 port 对象身份要求不相容。

独立[选择评审](../../proposals/fixed-schema-precompile/default-owners-identity-choice.txt)只判断既有快照边界，未执行工具。ROOT 按原技术交付授权采纳AE四条端口身份和库存消费者同类五条身份断言的有限迁移，保留值、category、职责函数与业务预期；修订后的运行及独立QA另行追加，不把本次失败改记为通过。


同一候选的库存工具慢层27条中25通过，w6真实消费者正反控各因旧身份断言失败。该源码还保留四个原port身份及一个LC3原Schema身份要求；ROOT按同一已接受复制边界逐处迁移，不修改正反控业务预期。原[结果](w6-original-failure.json)和[输出](w6-original-output.txt)保留。选择评审针对先发现的AE反例，库存同类处置由ROOT判断，不冒充另一次独立实现审查。


## 当前候选的自测与输入复用

候选 `75c6a66eff119dc702224cab1265ba2564464dd8`，基线仍为 `52bc6005dc168f2254d21ff79f6cd2df021676b8`。实际范围为三个默认owner、库存消费者及四个反向消费者和一个源码读者，共九个类型/测试成员。三包构建、新native src/dist六场景、八成员类型、快层2476及必要慢层均有实际记录。工具的未变类型/fixture输入复用主体结果；[影响计划](affected-plan.json)、分段[self-check-r6](self-check-r6.json)及其指向的r1～r5保留实际命令、退出码和不同提交。

原新native测试脚本曾误用CJS解析仅提供ESM的入口，并从未声明直接依赖的包定位LC3资源。分别改用原生import解析和真实AE消费者的资源解析后通过；产品代码没有因这两次脚本错误改变。AE及W6旧身份失败经上述有限迁移后，真实文件14条、库存正反控2条、相关类型与源码读者1条全部通过。没有放宽业务拒绝、负控或时限。

MRR原慢层148条中147通过，一次首次dispatch返回unavailable，见[原结果](mrr-original-failure.json)及[输出](mrr-original-output.txt)。未改原文件的两组基线/候选交替共12条通过；原因尚未确定，不能据此声称环境问题或已排除跨文件影响。独立QA的原组合复验另行追加。

[用例对账](test-account.json)覆盖4319个名称键，没有仅部分通过的重复组。10个没有本轮通过记录的键，是9个未变的工具fixture用例及1个既有、不适用的PI图像用例；前者按输入复用，后者不冒充执行。名称在不同阶段重复时不累计成新增覆盖，整文件被预解析省略时也不推断通过。

本片仅重建AE、EIS、registry和库存工具；其余42成员的dist/generated与基线逐字节相同，[输入清点](build-inputs.json)保留全部46个成员。自测104文件已复制到主检出并读回；[源码bundle](source-preservation.json)实际验证，仍需保全后续独立QA和发布输出。不把本地保全称为远程备份。

格式、规则、docs、design和严格检查全部退出0，见[共同结果](common-results.json)。CLI不受影响，真实跳过账本解释了未执行验收；不能说CLI验收通过。[结构处置](structural-disposition.md)逐项解释六组既有克隆和九个未变差的复杂函数。方向、环、新增依赖、新增装配偏离均为0。全仓趋势使用f226祖先快照，不把它当本片精确基线读数；没有运行TLC/Alloy或CRAP。

## 主体产物纠正事件

主体当前集成补验曾使用五个过期ROOT dist。[纠正说明](parent-composition-correction.md)明确取代范围、旧产物保全和正确装配补验；冻结性能及原独立QA未受影响。父级实际修正结果不改标成当前默认owner候选的结果。以上新增原件的长度和摘要归[self-provenance.json](self-provenance.json)，原初次失败的归档保持。


## 独立验收与有限技术接受

独立QA在候选75c6a66ef、基线52bc6005d上判为 **Pass with issues**：六标准全部通过，候选native18、业务基线对拍6、公开类型2/2；已确认产品缺陷0、必需未覆盖0。[原报告](qa/report.md)、[机读判决](qa/report.json)、[原件摘要](qa-provenance.json)保留原坐标。收工独立核验46成员2882个候选制品摘要；42个未重建成员与基线相同，两个检出当时干净，原QA报告未变，子进程和SQLite设施均已关闭。

QA额外只跑一次原MRR慢层多文件组合，148/148通过、75.153秒，T15三条均过；原isolate:false及原时限保持。此前一次unavailable未复现，原因仍未知，不能推断已排除所有共享状态、顺序或时序问题。原失败继续归MRR成员的后续调查输入。本次判断不隐去该风险。

QA首轮EIS负例误用合法字符串SessionRef，候选与基线均返回业务unavailable。改为非法类型null，保持invalidInput断言，只补四个候选场景及两个基线通道通过。旧失败和整理脚本的一次语法错误均保留；它们没有被归为产品故障，也没有改产品预期来通过。

主会话依原自主交付授权，结合上述独立结果、真实组合、范围检查与结构处置，接受本片有限技术交付：三默认owner首用成功后缓存，AE发布五份深冻结资源与捕获职责闭包，原编译错误可重试，显式工厂与作者临时编译保持。九处身份断言仅迁移已接受快照边界。MRR原失败尚未定因，足够的本片机制证据与后续组合通过不将其改记为无风险结论。

此签收没有新增模型检查、完整产品/治理服务验收或正常并发性能结论。主PR的四项五组不因本片再测，默认owner的独立行为证据也不改标成新的性能样本。合前发布文档的检查、最终main坐标和合并事实由PR #102及任务保全记录补齐。
