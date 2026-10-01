# 2026-09-27 模型目录与凭据副本联合验证

本次保全三段实际运行：`joint/` 的顺序、故障、关闭和原三次并发失败；`race-probe/` 的一次计时诊断；`race-corrected/` 的一次受控修正并发运行。各子目录保留原报告、运行脚本、命令、原始 stdout/stderr、退出码及输入/证据 SHA 清单；根 `archive.sha256` 逐文件核对复制后的字节。运行先后及失败原文没有改写。施工 brief 和只读假设分析仍留各原工作树 tmp，不进入本运行档案；原清单按原路径保留，复制后的归档完整性以根清单核对。

适用输入为 [D-075](../../decisions/model-credential-source-projection/decision.md) 采用的 `model-profile-directory/v3` 与 model-only `credential-custodian-local/v2` 提供者。实际产品包经公共入口接入 Cordis、真实 SQLite 文件、真实组织治理 standing、目录绑定 reader 与预置 32 字节 0600 本地密钥。`joint/` 的 13 个顺序/故障/重启/关闭场景通过；原并发程序三次都在第二 bind 返回允许的 `unavailable`，当时不足以证明成功排序。`race-probe/` 一次计时排除 5 秒 SQLite busy timeout 的解释，发现第二个独立 LeaseClock 的就绪状态是混杂因素，不能据此断定 SQLite 产品缺陷。

`race-corrected/` 使用两条独立真实 SQLite 连接及同一个 live LeaseClock，唯一一次运行 exit 0。store 先于 bind、bind 先于迟到 store、匹配 read 先于 bind 三种实际交错，均检查了操作返回、持久绑定/副本行、旧来源拒绝与新来源正文。脚本、原始输出和报告在原 spoke 的 SHA 分别为 `2be93ee2174031aaa9203dca49cb12d53199eb299c6360f1ddb99c6ffb73cd6b`、`692d54bff631c22957a9888d546897561bbeca2221739bd5ed58e867990d857d`、`063edcf96ae612c59fb2bd3bb08a133b38dfb5865518d9c187180d61c511a208`，复制后可由根清单再核。

联合包层事实支持 V3-14/15/16 与 MCR-V3～V8 的**部分**子项；V3-15/MCR-V4 整体仍 Partial。账号/登录/租户身份在夹具中预置或替代，未使用真实认证 bootstrap；未执行 unbind 竞态、失锁变异、PostgreSQL、进程杀死后的凭据读、产品 runtime 凭据失败零 HTTP、正式验收应用或 37 模型生产认证。脚本内 fetch 计数零只代表该夹具。[原联合报告](joint/REPORT.md) 与 [修正并发报告](race-corrected/REPORT.md) 逐项列出通过断言和未覆盖面；二者不能互相覆盖原失败。

本次没有 OpenRouter 请求或付费；未执行形式模型。证据是实际测试结果，不提升规格或提供者接受状态。后续真实认证装配与服务路径由 `model-request-acceptance` 应用 owner 接续。
