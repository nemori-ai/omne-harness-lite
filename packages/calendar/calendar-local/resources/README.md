# resources

本目录说明 Calendar 本地运行资产的定位、出处与发行责任。实际字节在包内 data，读取入口由[公开 API](../docs/public-api.md)导航。

## 允许的内容

发行种子、原始来源、知识元数据、来源许可与完整性索引。单次下载日志和 QA 输出留任务 tmp。

## 边界

createShippedCalendarSeedRegistry 与 shippedCalendarSeedRelease 从根入口导出。metadata 给出 packRef、releaseRef、releaseDate 和 packHash，registry 读取 `data/seeds/calendar-2026-11-03.json` 原始字节并核 SHA-256。调用方显式接入 registry 和完整 importSeed 输入；导入模块不会安装日历或启动刷新。发行包的 data 清单、包内读取路径和实际 pack 字节须由发行拥有者一并核对，工作区存在文件不代表完成发行接受。

发行 pack 的每历 entry 保存快照、政策与原材料身份。`data/seeds/inputs.json`、`raw/` 和 `evidence/` 保存来源、取得依据及许可材料，固定 hash 以发行元数据为准，不在多页复制。损坏、缺材料、hash 不匹配或政策 unknown 明确失败，不降成默认日历。所声明种子至少覆盖发行自然年及权威已发布更远范围，逐历 critical 不得发行，warning 必须声明。

CN 保留 lanceliao truth、cg-zhou 独立 oracle/horizon 与 gov.cn 回链。`data/cn-in-lieu/` 的 chinese-days@1.5.9 静态 JSON、provenance.json 和 MIT LICENSE 只补 inLieu 的两个既有检查，不是新独立 oracle。其血统来自 chinesecalendar，超出补充覆盖不推算。封套保留原 truth 与补充原文、来源、版本、覆盖及摘要。

US 固定法条为 govinfo USCODE-2023 §6103，保守制品依据与 OPM/FR 分开。无 METHOD 的 OPM ICS 仅在全部事件 DTSTAMP 合法且不晚于取得时点时采用组件修订依据，不宣称法律知识实时完整。发行 FR 语料显式限制 publication_date 为 2025-01-01 至 2026-11-02，截止为 America/New_York 2026-11-02 当日末；完成 count/pages 与实际记录校验后才采用该有界知识。发行计算窗口为 2025-01-01 至 2030-12-25，不虚构以后 oracle 覆盖。窗口、完整性、原文摘要和许可材料由本次发行输入唯一保存，HTTP Date、下载和安装时点不能替代知识截至。

## 维护

更新种子时同步原文、知识 resolver 依据、摘要、许可索引、公开读取入口和包内运行资产清单。不得用新的可变远端材料重写旧发行身份。种子跨合法安装 scope 使用来源 authority 身份，本机 SQL rawReference 不成为 pack 的可移植身份。

## 本包事实

A1 有具名三历离线种子读取入口与来源资产。本页不宣称当前 pack 已经通过发行门禁或真实系统装配。seed=null 的构件模式不降低完整发行物的离线义务。
