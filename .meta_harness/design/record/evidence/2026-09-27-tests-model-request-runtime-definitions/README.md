# 完整模型定义公共增量：revision7 有限实施签收

2026-09-27，主线在 HUB 源码基线 `976534bf17190bbfdaf9e3b87c5abbc2aa70b552` 核对并技术签收本页列出的 D082 公共增量。施工提交 `09417eafffe4ae10f084e0bb2a9154e2fa18f0ca` 已合入，共享 implementation revision7；期间观察 HUB `6f4f8c76` 的变化仅为并行设计采用，受测 2070 项源码／dist／规范输入逐项一致。采用依据为 [D082](../../decisions/model-definition-projection-adoption/decision.md) 及精确 [v4-definition-design](../../../realization/packages/model/pi-ai-transport/v4-definition-design.md)，其 SHA256 `13f0bdfe97c885fd521da924b6c1d432577d1f669c22081ea5eafd147f61ceda`；MP3／RT3／MS4／MR4 未改。人的总体交付接受不由本次代替。

## 实际范围与结果

| 检查 | 实际结果及范围 |
| --- | --- |
| HUB 集成 | transport175／175、runtime6／6；transport build／typecheck、runtime build、源码规则检查均退出0。原始命令和输出在源码归档 `input/hub-integration/`；独立执行者没有重跑这些组件测试 |
| 独立公开制品 | 从冻结HUB实际重新 pack、offline deploy并构成两份仓库外依赖闭合制品，精确 Cordis4.0.4；两目录各 root／behavior／真旧A迁移／完整新owner排空四模式通过，最终正向各50次本机HTTPS，共100次 |
| 完整声明与纯面 | 完整具名非官方 fixture 经公开core judge；八项值／缺席、精确大整数及小数域、七项drop/select留痕、extra原名／保护／Unicode次序；根及四纯面零资源且无需Cordis。缺／旧／非JSON definitions在创建资源前拒绝；显式空factory自有Agent须close，不称factory为纯函数 |
| 配置与身份 | 两位置各38配置对照、35非法配置逐个零HTTP；原JSON与独立Ajv Draft2020-12双向一致。全值同key比较、route联集和明确route、冻结完整binding/config及跨host／clone拒绝。局部声明专有TTL准确发出，不证明真实上游采纳 |
| 真实迁移与排空 | 真正A来自原 [r6 durable制品](../2026-09-27-tests-model-request-runtime-boundaries/README.md)，不由新版代码合成；A/B两位置各一次请求，B不能接管原计划。另各一次完整新版owner流/socket/read已停但callback未结束时cleanup仍0，完成后才释放；晚清理不删除新版。正向所有实际HTTPS Agent均destroy、live socket／queue及服务器终态socket为0 |
| 双语社区文档 | 两model包README／README_ZH的12个TS块从当前pack逐字提取，两目录各类型编译并实际执行12个模块，合计24模块；真实插件装卸和两个语言runtime helper均另经受控HTTPS调用 |
| 故障负控 | 最终8份独立compiled副本恢复缺省、旧形状补值、Schema失配、G22夹取、unknown extra透传、新B接管真A、全值同key比较失效、资源close省略；均先解析成功、实际exit1命中指定AssertionError，不把语法／loader错误算检出 |

[独立报告原文快照](independent-REPORT.txt)、[机器摘要](independent-summary.json)、[8负控原始结果](independent-negative-results.json)、[终态限定](terminal-clarification.json)与[主线核对结果](root-verification.json)保全原字节。原 Markdown 字节以 .txt 保存为原始证据，不改报告或其结论；独立报告中的原相对路径在源码归档 `input/independent/` 下；解包后可按原链接读取全部脚本、输入、原始输出与失败尝试。旧r6运行及A代码仍是旧范围，不重标签为r7认证。

## 保全与可复核性

主线现场核对2070冻结输入及2628证据文件，均无漂移；独立公开制品归档全部64490常规文件逐字读回比较、3030链接核目标在各自制品内，共67520成员。源码／配置／所有运行与测量失败归档2648个文件，亦全部逐字读回核对。主线初次测量把证据metadata当标量hash、把早期负控目录误算为后一批目录深度，两项测量错误及原结果均保留，修正后0错误，没有改产品或降低oracle。公开制品的通用live credential格式扫描0命中；这不是读取实际凭据后的窗口扫描或全部秘密分类证明。精确文件及摘要见[input-and-output-hashes.json](input-and-output-hashes.json)。

- `source-config-and-runs.tar.gz`：SHA256 `c15bd4563f11bc173cf4ab34ddce0dbc00bb347592f5cb05d8888093cbb89d8a`，2648文件。
- `closed-public-artifacts-r7.tar.gz`：SHA256 `f9da1622b6b04854bc824e10e03701bc36541ef73f668a7d9aeec50462720eea`，68,668,315字节，67520文件／链接。
- `pi-ai-transport-r7.tgz`：SHA256 `6d6e3e99f058fcc5b9b0b89848efd59f4e9e221b0bb3a490a6f5e6b39fa50f56`。
- `model-request-runtime-r7.tgz`：SHA256 `e46048027e33b55603a5b6afb009064758cfecf056b05c260eb13255d582e5dc`。

负控终态不能概括为全socket0：`new-B-takes-over-A`已发2请求，末服务器快照仍sockets1／closed1，随后3个实际Agent已destroy且无live socket／queue，子进程因指定断言退出1、非timeout；没有更晚服务器快照，不称该负控最终socket0。资源省略负控有76个Agent未destroy，即使socket／queue为0仍正确失败。正向终态完整证据与上述缺陷副本的故意失败分别陈述。

## 签收边界

签收的是公共完整声明承载、参数／配置机制及上述有限进程内迁移。ND-V1的正式模型来源值、ND-V6全部official role／配置、全部布局真实可附着性以及ND-G1～3均未由fixtures闭合。37目标身份从历史采用研究集合独立对照，只证明固定目标未缺漏，不宣称重新逐ID获得产品批准。旧默认37五字段贡献及两pilot已删除；当前供给必须显式完整定义，具名fixtures不是official发布。

当前37正式完整能力／配置冻结、输入窗口与单图计量、跨参数约束、真实模态来源、G22当前上限、上游TTL冷暖／到期及production认证仍未完成；认证 **0／37**。目录durable adopt/history、租户服务、十三操作、耐久结算／恢复、全观测、所有T／SC／G和整体交付不在本次通过范围。没有运行形式工具或付费请求，不声称无条件证明或全仓绿灯。唯一预算账本仍170 settled／0 unsettled、USD1.139960389500000000，USD100不重置。

主线登记后检查的原命令／输出与映射快照另见 [post-registration-checks.tar.gz](post-registration-checks.tar.gz)。初次 internal 检查发现搬移后的原 Markdown 相对链接18项失效；原报告逐字保存为 .txt 快照，原目录及链接材料仍完整封存在源码归档，维护入口指向快照。修正后的 internal design／formal=skip 退出0（13.887秒）、diff check退出0。没有因此改报告、产品或原始运行结论。

## 2026-10-01 归档位置变更

原运行结论和原始摘要保持。成批源码、制品及依赖归档已按用户选择移出 Git，原文件逐 SHA-256 保全；取回位置、字节摘要及历史提交映射见[归档迁移记录](../2026-10-01-checks-model-runtime-repository-cleanup/README.md)。原清单中的路径是运行时地址，读取外置文件时按迁移清单恢复，不能把本机保全称为远程备份。
