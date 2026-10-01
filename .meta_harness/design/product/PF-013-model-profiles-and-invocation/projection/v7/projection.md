# PF-013 · 图片准备施工接缝投影 v7

2026-09-29，**post-review candidate，未采用、未实施**。在D109已采用v6及transport v15 r4/runtime v21 r3之后，仅投影两条实施前漏出的技术承接边；不覆盖这些已接受字节，不替代PF-013全部投影，不夹带T29。主线对本候选作D109后继采用；候选存在和编号不表示接受。

来源与精确摘要见[provenance](provenance.json)，候选冻结commit `4ebcd9c05a969554999802b0d6ab24ab69bbaa01`。两项均沿[原v6产品范围](../v6/projection.md#需求及确认范围)、[封存领域读数](../../../../record/proposals/model-request-image-preparation/sources/domain-reading.md)及[RT10](../../../../spec/capabilities/model-request-runtime/v10/contract.md)/[MR9](../../../../spec/data/model-response/v9/contract.md)，没有新增产品政策、业务操作、持久字段或对象。

## 缺口与性质承载

| 接缝 | 原已采用性质 | 本次承接 | 失败与生命周期 |
| --- | --- | --- | --- |
| idle scope淘汰、runtime close到真实preparer缓存 | scope有限且隔离，显式释放，不靠GC | runtime的ExactTransportAcquirer与transport service必需同步clearReuseScope，固定实例闭包转发；普通noncache显式no-op | 停请求准入不撤销清理能力；失败scope留责计入maxScopes；thenable错接不能误判同步成功；真实cache-free后才释放owner |
| shared basis relation到家族原适用依据 | 原事实不改，旧O适用与原I复用分开，未知不能冒兼容 | 包内显式纯predicate读取原有限ledger，共同inspect解析变换；无InputMeter字段和共享modelId分支 | currentOnly不造原观察，原unknown relation仍unavailable；full/new按原O依据判断，φ只sameEffective；RT10首原因顺序明确兑现 |

唯一精确接口与失败规则分别在[runtime cleanup r2](../../../../realization/packages/model/model-request-runtime/image-preparation-scope-cleanup-candidate.md)、[transport cleanup r2](../../../../realization/packages/model/pi-ai-transport/image-preparation-scope-cleanup-candidate.md)、[transport basis r3](../../../../realization/packages/model/pi-ai-transport/image-preparation-basis-applicability-candidate.md)。本表不另建枚举权威。

## Cordis与归属

仍只有原有runtime/transport plugin与service；不新增image plugin、cache registry或完整Session/Run。清理端口不依赖当前ctx能解析旧service，实际resource owner保持闭包；多runtime各清自己opaque scope。当前固定代际无需历史实例集合，若既有装配允许多代际才沿其有界retention承接，不能只清当前provider冒完整。

计量relation与finite ledger属于纯计算实现组合，无新service/fiber/IO。通用算法不拥有家族公式，家族不另写compound解析和I兼容分支。实际当前basis的来源与真实prepared bytes仍沿v15，不能从原basis回填当前。

## 验收与接受状态

两reviewer对上述精确三文件各自范围无阻断，历次反例及修复见[定点评审记录](../../../../record/proposals/model-request-image-preparation/scope-and-basis-followup-review.md)。曾误把8125e085新增target8/第三行表标成716400a3，已按git object修正；不能用当前工作树反推旧来源。cleanup源码基线716400a3，basis新增行源码基线8125e085，均在provenance分别记账。

新增实际bindings 0，SC1～9与BR1～7未执行。主线先采用精确后继，B实现runtime端口与异常留责，C实现provider清理及basis predicate；A有限图片准备算法沿原D109继续。集成验收须真缓存释放、撤回后清理、async→void负控、两个租户/多代际适用范围、旧已证O full/new且I失效、未知原basis、坏source、prefix与basis同时变化首原因，并更新改动包双语README。设计通过不表示这些工程验收已完成。
