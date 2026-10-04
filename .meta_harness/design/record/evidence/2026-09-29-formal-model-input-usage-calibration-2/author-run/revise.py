from pathlib import Path
import json
D=Path('.meta_harness/design/spec');mr=D/'data/model-response/v9';rt=D/'capabilities/model-request-runtime/v10'
p=rt/'contract.md';s=p.read_text()
s=s.replace('| `rawHeaders?` | 同次 S-58', '| `inputCalibration` | MR9 S-41～S-44 的必填事实投影：requestInput 来自本次固定 plan，observedInput 只取 S-59 显式交出的同次观察，outputGroup 来自实际保留输出及固定编码版本。无服务身份时不伪造日志/response id；没有观察须显式 unavailable，不省略判别成员 |\n| `rawHeaders?` | 同次 S-58',1)
s=s.replace('实际模型/供应商、generation 标识、usage/cost、上游收尾及错误来源。给下游的内容可见性仍受 S-55 约束。','实际模型/供应商、generation 标识、usage/cost、上游收尾及错误来源；以及必填、显式的 MR9 S-42 observedInput（含同次 provenance 或 unavailable 判别）。首次解释上游响应的固定 read 构件负责归一化该观察：完整互斥分项给 from_usage；另知完整 prompt 输入总量而缓存细目缺失时给 upstream_total，不能因旧 usage 无法容纳而丢弃总量；无法确认口径/未取得时按 MR9 给 unavailable。给下游的内容可见性仍受 S-55 约束。',1)
s=s.replace('### S-60 纯判定与可单取用构件','''**同次观察交接**：observedInput 与 usage/cost 在本 read 的同一显式最终事实结果中交接，没有另一个查询口或 raw/opaque 私读入口；语言绑定可决定封装，但必须可完整表达 MR9 的三支及 provenance。read 以同次固定计划和原上游事实核对统计范围与来源，并沿 MR9 S-42 处理分项/total 冲突；invoke 不重新解析不透明响应、不读取 raw 附件、不从诊断或第二条侧信道拼回 I。已经提取的合法观察在后续解析错误、取消或输出不完整时保留；未知项仍未知，不能以 read 未成功收尾抹掉既知 I。read 未被实际执行或未取得任何观察的发送结果由 invoke 显式给 MR9 unavailable，不能制造 from_usage/upstream_total。若构件违反必填交接契约，不得默补零或伪称上游没给；沿 S-54/S-59 的既有本地失败责任保留已知事实。

### S-60 纯判定与可单取用构件''',1)
s=s.replace('复用需同时成立：','在所有满足下述条件的候选中，必须选择本次实际因果祖先链上最新的已确认观察，不能任意长期停留在最早锚。新旧次序来自授权来源的因果关系及其明确读取前缀，不能按不透明 id 字符串、全局到达时间或其他分支的最后记录排序；不能判祖先关系或次序的来源不可用。复用需同时成立：',1)
s=s.replace('则后继规划能从该响应取得新 I。','则后继实际发生的规划必须取得并使用该最新可用 I；稳定前提和公平调度下，从准确原批确定提交到后继规划实际使用该观察构成进展性质，不能只以“最终 done”或永远全量完成代替。',1)
s=s.replace('G-35：各绑定 φ／δ','G-37：各绑定 φ／δ')
p.write_text(s)
p=mr/'contract.md';s=p.read_text().replace('known 输出组恰含 source、blockDigests、completeness、usageRef。','known 输出组恰含 projectionRevision、source、blockDigests、completeness、usageRef。projectionRevision 必填，独立指认本输出组摘要的确定性内容编码版本，由当次固定适配提供者拥有并随本值耐久；它不依赖 requestInput 必须为 known。requestInput unavailable 与 outputGroup known 合法，仍须保留这份可解释的部分输出事实。requestInput 也为 known 时，两者 projectionRevision 必须精确相等，不允许混用两种编码版本。').replace('block 摘要采用 S-41 projectionRevision 规定的确定性内容编码','block 摘要采用本 outputGroup.projectionRevision 规定的确定性内容编码（版本规则沿 S-41）').replace('S-43 source 与内容存在性／数量不等','S-43 两个 known 表示的 projectionRevision 不等、source 与内容存在性／数量不等')
p.write_text(s)
p=mr/'model-response.schema.json';d=json.loads(p.read_text());g=d['$defs']['OutputGroupEvidence']['oneOf'][0];g['required'].insert(1,'projectionRevision');g['properties']['projectionRevision']={'type':'string','minLength':1,'description':'S-43：本输出组摘要的独立耐久编码版本；requestInput known 时与其 projectionRevision 相等。'};p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=mr/'examples.json';cases=json.loads(p.read_text())
for x in cases:
 g=x['value'].get('inputCalibration',{}).get('outputGroup',{})
 if g.get('kind')=='known':g['projectionRevision']='projection-1'
from copy import deepcopy
base=deepcopy(cases[0]['value']);x=deepcopy(base);x['inputCalibration']['requestInput']={'kind':'unavailable','reason':'not_retained'};cases.append({'name':'known-output-independent-projection-version','schemaValid':True,'relationsValid':True,'value':x})
x=deepcopy(x);del x['inputCalibration']['outputGroup']['projectionRevision'];cases.append({'name':'known-output-missing-own-projection-version','schemaValid':False,'relationsValid':False,'value':x})
x=deepcopy(base);x['inputCalibration']['outputGroup']['projectionRevision']='other';cases.append({'name':'known-output-request-projection-version-mismatch','schemaValid':True,'relationsValid':False,'value':x})
p.write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n')
# Keep normative verification as obligations, no runtime history or mutable delivery status.
p=mr/'verification.md';s=p.read_text().replace('| 当前实施状态 |','| 边界 |').replace('规格实例可执行；产品符合性未开始','规格实例与产品符合性分别验证').replace('产品符合性未开始','须由产品符合性验收兑现').replace('真实适配证据未开始','须有真实适配证据').replace('本批未运行网络','须保留实际网络样本和条件').replace('有限规格模型由 RT10 承担；本包不声称真实存储通过','有限模型由 RT10 承担；实际存储另验').replace('PendingModelResponse 同 required 条件另需完整有回复 fixture。','PendingModelResponse 同 required 条件需完整有回复 fixture。输出组自身版本与 request unavailable 的正例、缺版本与 known 版本不一致反例都须核验。');p.write_text(s)
p=rt/'verification.md';s=p.read_text().replace('| 实现验收状态 |','| 证据边界 |').replace('实现未开始','须实际实施验收').replace('真实适配证据未开始','须实际适配证据').replace('真实存储验收未开始','须实际存储验收').replace('真实 service 验收未开始','须真实 service 验收').replace('新增实现尚未开始；无预设未经采用阈值','分别保留基线与新增路径测量，无预设未经采用阈值').replace('旧证据仅旧输入范围，本批未全跑旧模型','旧证据仅旧输入范围，变动影响须另行验证').replace('G-35：各实际绑定','G-37：各实际绑定')
start=s.index('本批模型初次三轮扩域');end=s.index('\n## 已知缺口',start);s=s[:start]+'''response/reply 须分别表达并检查 SameBatch，使用 PartialBatch 负控；不得把同批目标隐藏在不可分割值中。重锚进展须检查准确提交后实际使用最新可用观察，并以 NeverUseAnchor 与 KeepOldAnchor 验证性质可失败；EventuallyDone 不能代替该性质。
'''+s[end:];s=s.replace('当前 U1 产物未发布。','规格状态以 registry 的候选条目为准。');p.write_text(s)
