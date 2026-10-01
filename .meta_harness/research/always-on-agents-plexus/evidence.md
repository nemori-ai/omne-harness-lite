# 来源与实际查证范围

## E1：论文与两项关键原引文

[独立读数](notes/paper.md)在读取本项目机制之前封存；[来源清单](notes/paper-sources.json)列作者、日期、版本、阅读范围、下载字节哈希。主论文136页，未独立检查435篇全部文献，也未复现AOEP。GEM与ACRFence原文专门追引核查。论文是作者报告，实验不是本项目实测。

JSON 中 `local_files` 相对于本工作区 `tmp/always-on-synthesis-20261001/paper/`，原始PDF/HTML及分页文本保留在那里；本包只收敛笔记和精确线上版本，未将原始论文作为随包附件。哈希支持持有这些原件时复核，不宣称本包已离线封装全部源字节。

## E2：OpenAI 的公开产品说明

原文：[中文](https://openai.com/zh-Hans-CN/index/how-we-build-safety-security-and-privacy-into-dots/)、[英文](https://openai.com/index/how-we-build-safety-security-and-privacy-into-dots/)，发布日期2026-09-29，本次web工具访问2026-10-01。定位为“为每个 Dot 提供受保护的工作空间”“安全登录”“掌控你的信息”“Dot 会持续寻找提供帮助的机会”“在 Dot 行动前进行独立检查”。

厂商自述：执行代码的环境与关键防护系统分离；安全登录避免凭据进入上下文；断开连接不清除既有上下文；主动研究使用代码限制的只读工具，后续动作仍需常规检查；自动审核不在Dot可修改的环境内。只读不代表无权限限制。文章没有给出底层存储、审核模型或事务协议，也不是独立运行验证。curl获取403，未保存完整HTML；保留URL、日期与段落定位，不伪造快照哈希。

## E3：Plexus 与 Personal Edition

[读数](notes/plexus.md)、[精确路径与提交](notes/plexus-sources.json)。来源为项目源码、产品/接口文本、已有验证记录及公开站点；未读取密钥、个人数据、运行服务或重跑测试。`sources.json` 在封存笔记中的简称对应本包 `plexus-sources.json`。

Personal Edition 为 `d1f4e5342abe2526bc0ac1e147e340558f7de618`；匹配Plexus为 `d84421fcf981b0c7d3f624ba95a62d81523f6402`、软件0.9.1/协议0.1.4。个人版资源接口仍是 implementation-ahead-candidate，ADR-C027为Proposed。代码观察、作者已有运行记录、架构接受是三种证据，不互换。

## E4：Harness lite 与昨天的候选报告

[覆盖读数](notes/harness.md)、[77个文件的摘要与坐标](notes/harness-sources.json)。本地HEAD `2a04c2322a7b679133654acc3c4241effaade4be`；昨日Relay报告是工作区候选材料。沿现行product/registry/spec/realization与提案定向核对，未采用design_legacy。没有执行框架测试；接受契约不能证明完整生产链已运行。

[issue清单](notes/issue-inventory.json)保存全状态成功查询的结果及获取限制：只有#18，与本主题无关；非PR或全部历史讨论普查。后续查询偶发EOF，没有捏造更新。远端main晚于本地的实现进度未混入本地设计结论。

## E5：合并与独立评审

[补篇入口](../../design/record/proposals/ai-assistant-saas-projection/supplements/always-on-20261001/README.md)导航解释、应用判断与Claude Fable评审处置。三份独立笔记按封存字节复制，主线的取舍另写，不倒改笔记以迎合合并结论。

## E6：主线定向原文复核与精度修正

[复核记录](notes/root-recheck.md)逐项写明主线直接核对坐标、仍仅转述的部分及后续搜索范围；E1的pilot细分数字、E3其他源码细节没有全部由主线逐行再核。R1后保留初版笔记字节，60分钟默认值/workflow撤销范围及摘要归属判断以该复核及rev 3正文为准。
