# W1 第 1 轮评审：SPEC 表达（摘要）

判据页 `harness-design-handbook/references/review/expression.md`。两份 SPEC 都有阻断。

## Skill
- 阻断 S-B1：`resolve` 对依据是否核对内容摘要，SPEC L230、L249 与套件用例三处说法不一（套件要求改 digest 就答 `basis-not-lawful`；组页 L238 把摘要核对放在读取第 7 步）。
- 应修：S-M1 字节范围合法性与 65536 的含义未封闭；S-M2 `open` 的要求比组页严、`digest` 义务没写；S-M3 WeakSet 登记依赖同一模块实例；S-M4 `SafeReason` 只定词形，披露义务没落到端口；S-M5 最后一次端口调用期间中止的结果两读；S-M6 文本条目是否保留 BOM；S-M7 export 上限只答了不分批；S-M8 资产正文的 scripts/settings 是否适用跨项规则；S-M9 组页「链接与非常规文件拒绝为 malformed」在端口契约里没有通路；S-M10 与组页的偏离没登记、缺「行号→条款」封闭表。
- 建议：schema description 漏列三项差异；长度单位不统一；SPEC 重抄类型形状；依据指向任务 tmp；`sealSnapshot` 对 `rootName` 无约束；格式。

## MCP
- 阻断 M-B1：`process-env` 凭据句柄没有兑现通路（`CredentialHandle` 只有 `authorize/reportRejection/release`，替身靠 WeakMap 旁路）。
- 阻断 M-B2：`env.source: setting` 没有声明通路（`deriveDeclarations` 只产三项固定设置），缺值与几种组合未定。
- 阻断 M-B3：`cancelTask` 只限发起者，但没有机制也没有答复；`queryTask`、`taskResult` 同样触及 SYS-TENANT。
- 阻断 M-B4：组页 604 行「配置错误的报告形状」标为已封闭，实际只封闭了缺值；非法配值无法进入品牌类型，`AdoptionView` 三种做法结果不同。
- 应修 M-M1–M-M11：V4 覆盖面；授权发现取值来源与元数据取不到；`reportRejection` 由谁调用；S1 套不上 `closeAll`/`list`；需要连接的状态口与缺凭据的读口答复；`instructions` 截断边界与摘要；失败码总表与类型漂移（`not-connected`、`superseded`、`listing-incomplete`、UE unknown）；设施名词法两契约不同；`NotApplicable` 两读；准备失败残留进程无处报告；445 的后果没写。
- 建议：封闭表三处引用错位；C3/D2/D5 细则；E5/O4 措辞；依据指向 tmp 与波次名；schema `$id` 约定；类型重抄；小的在途情形。
- 范围外：明文 http 政策；601、445 未封闭是否可接受；组页残留（MCP L171；Skill L18/L34/L65/L346/L433）。
