# 模型调用 ACK 候选：实际运行证据

2026-09-29。保全规格起草者的运行原件；归档者独立逐项核摘要，不冒重新执行。本批四契约/Schema/formal源提交bd61b623；正文修正a082f3a1、63825947、3c78263a不改Schema/formal。最终接口快照05及此前01–04全部保留，不能把较早快照冒作最后正文。

原[evidence-files](inputs/tmp/ack-spec-draft/evidence-files.json)127项逐项SHA一致；额外保全原handoff、04、05，完整[归档摘要](archive-sha256.json)。[命令](inputs/tmp/ack-spec-draft/commands.json)、[失败与更正来源](inputs/tmp/ack-spec-draft/provenance.md)、[最终形式结果](inputs/tmp/ack-spec-draft/formal-run-03/results.json)、[原交接（已外置）](../2026-10-01-checks-model-runtime-repository-cleanup/README.md#外置原件)保留原字节。原handoff的未提交/当前03说法是写作当时事实，以本归档说明及后继提交确定最终状态。

实际最终结果：Schema80/80；无损语义digest20向量及4等价/6不等价；AckLifecycle/AckProgress各6688生成、2124不同状态、exit0；8项故意破坏配置各exit12并命中目标不变量。Schema只验结构，不执行relationsValid；有限模型不证明真实权限、跨进程停止、SQL/日志原子协调或外内容释放。90份继承模型仅核字节未变，未重跑；冻结970未改变。

前期formal-run01解析失败和一次240秒超时、run02单个赋值负控错误、schema-run01覆盖不足、run02 runner选错入口均原样保留。超时stdout原件为空，session traceback未存，不能复造；schema01仅保存旧输入摘要，非全旧Schema快照。只有03作为最终成功结果。脚本含起草生成器，不是验收入口；不得在归档中执行并覆盖原件。重跑按原commands、工具链、实际输入和原工作树路径恢复隔离环境；本归档不篡改路径以冒新可运行证据。

ACK规格仍为候选；产品与架构方向已采用，不等于四契约及提供者已接受/实现。独立评审归提案记录，真实实现验收另行执行。

归档接口快照正文保持原字节，以`.md.raw`存储，原始路径到归档路径见[映射](original-path-map.json)；原manifest不改写。它们的相对链接属于原工作树，不能当此处的现行导航；首次design检查把20份原快照误当现行正文报告断链，因此仅改归档文件后缀，不改工具规则或原内容。
