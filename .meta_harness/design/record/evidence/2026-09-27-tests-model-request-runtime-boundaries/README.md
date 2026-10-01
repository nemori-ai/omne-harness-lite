# Model request runtime：revision 6 传输边界修复验收

2026-09-27，主线在 HUB `a6285a7f7a116b49b7436a13ae37aa6267604d40` 核对并技术签收本页列出的有限修复。源码提交 `2fdc4be89181b68cb11cfa06a47c1d2d01022054` 已合入；共享 implementation revision 为 6，37 个窄定义的 definition revision 仍为 1。采用依据为 D-076 的精确 runtime3／transport v3 投影，profile3 S-17／S-20／S-21、runtime3 S-53／S-54／S-58／S-59／S-63，以及 call-accounts2 S-6／S-8；没有改冻结规格。

## 已执行的结果

| 检查 | 实际结果及范围 |
| --- | --- |
| HUB 集成 | transport 262／262、runtime 6／6；build、typecheck、27 包＋6 仓库源码规则通过。原始输出在输入归档 `input/hub-integration/` |
| 独立制品消费 | 在两个仓库外目录分别实际运行根入口、旧消费者及 23 个新增场景；8 条 pack／deploy／消费命令退出 0；共 84 次本机 TLS、0 次付费请求 |
| 宿主关闭与排空 | direct／真实 Cordis 两种模式；关闭后排队和旧 lease 的新 send 均 unavailable、零新增 HTTP；已有 18 字节 UTF-8 正文、正常终态、socket 实际停止和 callback 等待分别观测 |
| 诊断故障 | direct send/read 与 invokeModel 经过 baseline／throw／reject／pending sink；正文、Usage 和业务收场一致，没有未处理 rejection。factory 的独立降级计数另由组件测试覆盖 |
| 脱敏 | 真实 JSON／TLS 的 HTTP、带内、serving、异常 stopReason 事实逐键逐值扫描；含引号和反斜杠的哨兵及其 ≥8 字符窗口无泄漏。非 ASCII 遮罩不重造 ASCII 秘密，普通键和多个秘密键碰撞时成员不丢失 |
| 参数和账值 | extra 丢项保留原键且全丢后不残留空 extra；八组 Usage／Cost 通过公开 judge，全未知 source=none，合法零 source=upstream；精确大整数与独立费用值保留 |
| 制品迁移 | 15 个包的依赖闭合；显式 Cordis peer 4.0.4；100 个链接重定位后留在副本，当前 dist／双语 README 与新 pack 字节相同。两个副本分别运行，结果未互相复制 |
| 故障负控 | 七份独立副本各恢复一类缺陷，均实际 exit 1 且命中预期诊断；成功制品字节不变。负控失败是预期检出，不算正常消费通过 |

独立报告见 [independent-REPORT.md](independent-REPORT.md)，机器结果见 [independent-results.json](independent-results.json)、[independent-negative-results.json](independent-negative-results.json)。有限测试中的期限、连接数和等待是显式测量配置，不是产品默认政策。

## 保全及可复核性

`source-config-and-runs.tar.gz` 保留 5659 个输入文件：独立验证的源码／dist／规范及全部五次失败或报告修订、工具、命令、正常与负控原始输出，开发 spoke 的原始复现／失败／最终交付，以及 HUB 集成原文。仅排除可由已保全 tar 重建的 deployed／packed 目录和 node_modules 目录；各次已产生 tar 均保留。独立报告详细区分首次漏执行和后续 oracle 修正，不把早期 generic PASS 当新增矩阵通过。

主线逐项核对独立清单 5205 个文件和当前 827 个源码／dist／规范输入，均无漂移；66 项施工输入观察与 revision6 计划相同，冻结文件仍符合 registry 摘要。全部归档输入已从压缩包逐字节读回并核 SHA。实际凭据及其所有 8 字节窗口在输入、两个真实制品及压缩成员中扫描 0 命中；不记录凭据、窗口或其摘要。详见 [input-and-output-hashes.json](input-and-output-hashes.json)、[input-observations.json](input-observations.json)、[secret-scan.json](secret-scan.json)。

精确归档：

- 源码、配置及运行：`source-config-and-runs.tar.gz`，SHA256 `ebc7b826538bd0856cedc7cedf72401e8f351b3c4651c111e4f8c26349cfd472`。
- 实际独立公开制品：`public-artifact-r6.tar.gz`，SHA256 `9b0c60a7bd9887b57757b64e79d196267047c414517b39d03cf98eeb5ebd74c6`；沿验证器原压缩字节保存，没有重新打包混用摘要。
- 单包：`pi-ai-transport-r6.tgz`，SHA256 `e23f52d78c403c3033c2f301d727517fb248e9a17507d1491d1a8f42e1828cc0`。

## 签收边界

主线签收的是上述 revision6 修复与有限制品消费。独立验证没有重跑 HUB 262／6 项；主线集成和独立制品证据分别陈述。正常 stop 的 serving 路径 complete；异常秘密 finish_reason 路径 failed／source=in_band，脱敏不把异常改成成功。

完整模型定义／Schema 迁移由 D-082 接续，尚未完成；当前制品保留旧五字段窄定义及两个 pilot，不是新代际制品。官方生产认证仍 **0／37**。真实 OpenRouter、缓存命中及 TTL 到期、完整 T／SC／G、runtime 十三操作、租户服务、耐久结算／恢复、完整宿主换代和总体交付验收不在本次通过范围。没有执行形式任务，不声称形式证明或全仓检查通过。[旧 revision5 run](../2026-09-27-tests-model-request-runtime-parameters/README.md) 原样保留。

本次付费 0；唯一账本 170 settled／0 unsettled，累计 USD1.139960389500000000，预算 USD100 不重置。[environment.json](environment.json) 保存实际环境及预算观察。

映射补验：两个 model 节点的入口／投影／绑定／链接检查0错误，设计结构 internal／formal=skip通过；执行形式任务0。首次临时 Python loader 缺 tooling src 搜索路径而 exit1，尚未执行 checker；失败原文及修正后的可重跑脚本保留。`final-mapping-check.tar.gz` SHA256 `182893b9cd755146f3a5f9dbc16b269e2f161718aff0d4bcb9be9bbd6e3a9ac1` 已逐字读回，原快照 README 不含此事后补记。未重跑或宣称全仓 realization／make 通过。

## 2026-10-01 归档位置变更

原运行结论和原始摘要保持。成批源码、制品及依赖归档已按用户选择移出 Git，原文件逐 SHA-256 保全；取回位置、字节摘要及历史提交映射见[归档迁移记录](../2026-10-01-checks-model-runtime-repository-cleanup/README.md)。原清单中的路径是运行时地址，读取外置文件时按迁移清单恢复，不能把本机保全称为远程备份。
