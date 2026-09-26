# 当前 core 交付的最终实现运行与技术签收

本run记录实际发生的HUB复验和原件，**不是人的总体接受，也不是全仓门通过**。实际源码为 `a53644ad585d433627073c066f46d500f1aee6c6`。本次记录与状态文档的后续提交不改变被测产品源。

| 范围 | 实际结果 |
| --- | --- |
| 18 core＋2 util＋2验证工具 | 22成员，6496项通过／零失败／零跳过；其中core5871、util291、工具334，含Vitest类型测试 |
| 全仓构建／类型／格式／开发工具 | 在full make到测试阶段之前通过；actual27源码规则另独立通过 |
| 20独立tarball消费者 | 500公开类型、21 JSON入口、139 TS2307＋139 Node私有路径拒绝、22不同Schema资源／421 defs；23资源出口条目不是23不同规范资源 |
| 两条真实core链 | 资产12＋流13场景在workspace与真实tarball中通过；错期／帧9改10的负控分别只命中指定AssertionError |
| 当前221义务 | 217技术接受＝211完整active＋6混合当前NonConnector部分；186 local（含2个此前有限模型项）＋31 composition。4项Skill SP3只记录部分域，未整条签收 |
| 两个util追加要求 | UF1～6／XF1～7共13项技术接受。原Python99输入根重放98同字节＋1已接受日期拼写差异；另11边界、2比较器负控 |
| 全仓make | 退出2：main同样的3个登录迁移失败。远程main／本地main／HUB的相关90文件完全同字节；独立原生SQLite探针复现跨连接DDL首次读取漏列／ERR_INVALID_STATE，句柄仍打开 |

## 逐项接受与未闭合

[technical-acceptance.json](technical-acceptance.json)新增186项当前技术签收，此前31项按原范围保留，原327 ID、stage、owner、source、坐标、scope与old signatures未改。[U1技术要求](U1-technical-acceptance.json)单列，不虚增原327义务。

未整条接受的是 `skill-package.markdown-yaml`、`skill-package.normalized-package`、`skill-package.walkthrough-cs-3-core-step`、`skill-package.walkthrough-cs-6-core-step`。冻结2要求严格重复键同时忽略普通未知属性，但没有决定未知自定义tag键的canonical equality；当前保留undetermined，必须由语义owner补规格或明确接受缺口，不能在实现里偷选malformed。Connector16延期义务、第六正文提供者、90阶段外义务、整个共享CS、外部授权／快照／持久／transport／执行事实、用户总体接受均未被此次通过提升。

## 原始输入与输出

- [configuration.json](configuration.json)、[measurement.json](measurement.json)：实际命令、环境、源码和计数；[core-tests.log](core-tests.log)、[core-rules.log](core-rules.log)、[make-check.log](make-check.log)保留原stdout及真实失败。
- `original-HUB-consumers.tar.gz`保留实际W1／存储19正例与C11/C12指定失败、资产／流／公开类型与源依赖检查的输入及原始子进程输出。`original-HUB-packed-consumer.tar.gz`保留20原tarball、完整消费者输入／JS／严格配置／实际命令／原始输出和所有目标负控；node_modules是可重建缓存，未入档。
- `W6-original-author-evidence.tar.gz`逐字保存原335成员，包含1941文件source-and-built原封包；[根独立读回](W6-root-source-and-archive-readback.json)核全hash并实际证明原输入／built逐字等于当时HUB1941文件。原执行HEAD64e与release e77关系保留，不重写为HUB运行。
- `data67-author-and-root-mapping.tar.gz`保存67逐ID映射、2410原测试pointer和根独立637条款／51源／13完整副本核查；13副本来自12不同规范Schema，额外私有TD2副本不是新冻结资源。原六data196封存载荷已保存于此前current-v3 run的原owner archive。`retained52-author-and-root-mapping.tar.gz`保存52本地映射及原1运行适用边界；根当前2回归另记1758。
- `U1-original-author-evidence.tar.gz`保持作者99原Python／11边界／特定负控原件，`U1-original-Python-root-replay.tar.gz`是新目录的实际根重放，不改作者封存；其源码归固定Git6263、Pydantic2.12.5与原锁hash。[root记录](U1-root-reference-archive-readback.json)与archive内execution-state／invocations保留完整运行参数。
- `upstream-main-baseline.tar.gz`保留main17测试14绿／3红、90文件来源比对、六情景原生node:sqlite探针、源码归档和原JSON；没有修改provider或断言。基线树原件复制到主检出并32项全hash核对后已退休，复现请使用新任务树／目录。
- `foundation-historical/`保留原50项签收与两份旧独立审阅，当前39基础项依据同源根复验重新签；OE2的declined／溢出不可用与旧1资源明确区分，Storage新增显式扩展不改变普通协议，不延伸到DDL提供者或pg保证。

实际模型原件仍归[此前有限模型run](../2026-09-26-formal-core-v3/README.md)，本run没有重跑solver；full make的formal=registered只检查登记。当前测试[绑定索引](current-test-bindings.json)指实际运行case/group及精确条款，只承担列出的有限实现范围；完整节点状态与责任从realization入口读取。

## 恢复与限制

SHA256SUMS和每个archive manifest固定原始字节；将原archive解到新的任务目录，不覆盖本run或作者原封存。HUB代码恢复用实际Git a536；W6 archive内source-and-built及inventory固定完整21依赖源／构建产物，根读回提供同字节对应。按configuration中的argv恢复本树锁定依赖后运行core22门和独立packed命令。恢复full make须完整a536仓库；其继承基线失败应如实保留。

有限用例、规则扫描、结构读回、类型检查、模型和真实core组合各有不同范围；没有任意规模精化证明，没有真实宿主或生产准入，也没有人的总体签字。原红、harness定位错误和原历史来源均随原件保留，不用新绿洗掉旧状态。

[本批新增绑定的独立只读评审](binding-review.md)核18条实际指针与有限范围，四处投影已修；[主调度处置](binding-review-disposition.json)接受该评审结论，不扩大为全部217项的独立复审。最后一次[上游祖先核对](upstream-sync-readback.json)保留本地主分支与HUB已包含远程冲突修复的事实。
