# Skill3 候选构造简报

输入基线HUB45c1b504；user已裁D-069。只有一个新坐标 `(omne-harness-lite-design-2026-09-15,data.skill-package,3)`，保留全部S-1～S-32编号和已有失败token。源2完整三资源是唯一旧规范；读取registry/catalog、frozen、Skill节点设计及源verification、D-069。作者仅写 `spec/data/skill-package/v3/{contract.md,skill-package.schema.json,examples.md}`，本决定目录 `candidate-diff.json,candidate-registry-patch.json,consumer-impact.json,draft-report.md`。不改旧2、正式registry、导航、产品／术语／实现／工具，作者不接受。

S-20第5/8条补：完整YAML映射图（含将忽略属性的嵌套值映射、复杂键、alias）必须能确定键唯一性。同tag的未知／未支持标量canonical知识缺失、且最终唯一性判断确实依赖该关系时，`malformed` M16。已知键不同（例如tag不同／结构明确不同）不能仅因含自定义tag拒绝；普通未知键／未知值不因此生效，S-5留痕不拒绝仍保留。S-5要明示这是在S-20文本有效性及唯一性前提内，不把未知属性本身当错误。S-21目录文本路径承接同M16；S-24 M16明列该来由，不加M18／新token／第三答案。既有已知非法核心值、重复键、解析失败不变。

Schema只更新自身坐标元信息（$id3、顶层title v3、顶层description的本文件作用域3）；$defs／constraints／旧2三项依赖所有$id/$ref保持原内容。catalog3的三项dependencies完整复制Skill2精确AM2／CB2／TD2，不在这一窄修改借机升级。examples保留源2完整例子，新加：同未知tag不同scalar／相同scalar键无法排重拒绝，嵌套被忽略value内未知键歧义拒绝，复杂键内部未知关系确实影响比较拒绝；ordinary未知属性、单个未知tag不涉及判等、不同tag已知不等、复杂结构某已知分量不等的对照仍按S-5成功。alias同节点重复仍确定拒绝，正文LF/CRLF逐字不动，目录读入同M16。

三资源状态候选，自己的坐标／URI准确3，正文外部链接仍原2；S20/S24规范实例不能引用实现技术名或JS/YAML库。提供完整资源差异与三依赖register候选补丁，covers3可按2条款映射复制reviewed:false，formal无新增触发（纯读入性质，无状态并发／共享代数），不要造空形式模型。消费者影响列所有pin2者、schema graph闭包、normalized形状不变而文本域改变的不同采用，默认3和保留2的提供者采纳由root另写，不能暗升AM/Slash/AE。不能把评审或候选完成写成接受。

发现必需输入不足或别处实质冲突，只暂停依赖支并报精确条款；不自选更广的拒绝规则。不需要重新research上游，来源与新政策已给。

独立表达审阅指出源2顶层title／description本文件作用域的历史版本标签不得冒充新3，root明确上述坐标元信息修正；外部依赖AM2说明不改。此修正不改变规范化形状或拒绝域。

坐标表达修正另含S1与CS1、AM2依赖／消费表对“本契约”的历史指代：明确AM2仍ref冻结Skill2；S1/S22列coordinate-only，4条语义补、其它26条逐字未变。目录M16与已确定外逃同时出现，仍按原S24 resource_escapes在先；此既有次序不是新政策。
