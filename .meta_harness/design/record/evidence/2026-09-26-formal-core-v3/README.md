# 当前 core v3 的实际模型执行（2026-09-26）

本 run 保存已接受 `capability.stream-assembly/v3`、`capability.asset-evaluation/v3`、`data.messages/v3` 的实际模型检查，未执行产品代码。接受与冻结依据是 [D-068](../../decisions/core-implementation-spec-reconciliation/acceptance.json)。执行源为 `panqiwei/core-delivery-stream-guards@8c03105243e1ae25697dd78b0d9c317c43d076bf`；原输入、配置、工具、原始结果和反例全部可恢复。

| 对象 | 实际执行与结果 | 证据边界 |
|---|---|---|
| SA3 V-1 | 正配置 exit 0，871519 generated／826411 distinct、深度9、队列0；三配置分别 exit12，命中 BlockOrderIsOpenOrder／SplitInvariance／OneShotAccepted | 两索引、两片段符号、最多六个接受事件；abandon补的finish不占上限；无公平性假设、关闭死锁检查。只提供 S-6/P-1 的块次序（含 formal 所列 S-9 落块对应）与 S-27/P-7 两半的模型证据 |
| AE3 V-1 | 原18命令：6 run SAT、12 check UNSAT；13既有变异分别执行同18命令，全部匹配规定，共252条主读数 | 按各命令自身有限作用域。M1/M7各推翻两条，M8的pickSkipped为UNSAT也是规定变异后果；按构造的团队来源／根身份及PRE-2输入前提不作求值保护证据 |
| Messages3 V-11 | 原6命令：2 run SAT、4 check UNSAT；M1～M5各跑规定断言，均SAT反例，共11条主读数 | run恰6／5条消息、check恰6条；按构造吸收的名单合法性、配对、块不变等前提不作接收或写入保护证据 |

Alloy 合计 **263 条主读数**，另有 **28 条 XML 补取**，后者只为读取相同输入／作用域下的关系、skolem与实例，不新增性质覆盖。Alloy 正常退出不表示断言通过；本 run 逐条核对实际模型命令、solver SAT/UNSAT、receipt 和有解实例。Alloy 未登记 formal task，只在 verification 引用，不添加正式 formal binding。

## 原始材料与归档

- [formal-run.tar.gz](formal-run.tar.gz) 完整保存源封存的631个文件，内部原路径前缀为 `w6-core-formal-v3/`。含40份输入快照、7份执行模型／配置、实际argv/cwd/timeout/起止/exit、原stdout/stderr/receipt/table/XML、全部变异输入与原patch、读取器、自测、工具版本与工具SHA、SHA/FNV清单。源目录自身SHA清单之外的630项逐个验证；归档631项逐个读回与源字节相同，见 [archive-verification.json](archive-verification.json)。原SHA清单摘要 `a228cbf408af6c22163dd37a3c2faaee5375e96d56d54a8db99863fc7ce7259e`。
- 正式 task 子目录 [stream-assembly-v3-assembly](stream-assembly-v3-assembly/input/Assembly.tla) 提供当前输入与四次运行原文。实际正配置严格沿登记argv、1 worker、600秒；执行cwd为源spoke的独立 `tmp/w6-core-formal/input/`，用与frozen相同字节的输入副本限定生成物归属。该cwd差异原样登记，没有伪装成在设计目录原地执行。
- [formal-results.json](formal-results.json) 的Alloy数组第0～13项为AE主读数，第14～19项为Messages主读数，第20～47项为XML补取；有解关系原件与 `xml-readouts.json` 均在完整归档内。三份模型的规范映射分别见 [SA3](../../../spec/capabilities/stream-assembly/v3/formal/README.md)、[AE3](../../../spec/capabilities/asset-evaluation/v3/formal/README.md)、[Messages3](../../../spec/data/messages/v3/formal/README.md)。
- [input-index.json](input-index.json) 的32份冻结资源精确匹配八份本轮accepted契约；其余八份为登记／接受／verification上下文快照。[lineage.json](lineage.json) 保留源2与历史实际1的区别；旧运行没有重标为本次3。

## 独立核读与有效性

主调度逐项核630 SHA和631归档字节，再以独立的 [读取脚本](read-core-v3-formal-root.py) 核实际原始结果、登记正argv、三工具二进制SHA、32正式冻结输入、263主结果与28实际XML关系／SHA：[核读报告](w6-core-formal-v3-root-readout.json)、[成功log](w6-core-formal-v3-root-reader-r2.log)。脚本只读结果，没有重跑solver。首次误用系统Python3.8，`removeprefix`不支持，原失败保存在 [原log](w6-core-formal-v3-root-reader.log)；改用本HUB own `.venv` 的Python3.12.13后读完，不改变模型或原结果。

独立spec-reviewer对同一八份32资源、三模型与变异的规范对应性、全部291条读数及28份XML关系作只读复核，未发现表达或范围阻断。它没有重跑solver／读取器自测，也没有重复主调度的全630 SHA核验，记录见 [复核](review.md)。[八类读取器负控](measurement-selftests.json) 检出空退出0、漏命令、漏solver行、退出0的反例、validity run UNSAT、范围改动、SAT无实例、solver/receipt矛盾；这是本次读取测量的有效性，不是任意程序正确性保证。

保留 Alloy `exec --help` 探查退出1的原文；实际指定模型、变异与XML补取均无超时、漏执行或执行错误。输入仅验证明确有限模型范围，不证明任意规模、参数解析、完整载荷／表示、失败优先级、真实装配与求值代码、宿主前提或总体交付。产品实现与W6真实组合仍另行验收，人的最后总体门未签。
