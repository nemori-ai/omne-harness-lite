# RT4 结算：独立有限形式执行与主线核对

2026-09-27，独立 verification-developer `/root/b1_rt4_formal_verification` 在冻结输入上实际执行两轮 SANY／TLC。主线随后逐项读回两轮归档、核原日志退出及指定反例、核102运行输入与最终候选29输入，其中24形式文件未再改变。此事件只报告有限模型；不接受新正文、实际IO或十三操作实现。

| 运行 | 实际结果 | 精确范围 |
| --- | --- | --- |
| run1 | **Fail**：SANY／3正通过，5负指定反例；UnknownAsAbsent exit75，下一态不完整，不能算第6个负控通过 | 旧模型 `345bec…`，原失败完整保留 |
| run2 | **Pass，有限模型**：全新SANY、3正完成空间、6负均exit12命中自己的invariant，轨迹由执行者逐份解释 | Settlement.tla `d7f25d31fa24a25560bf67d4bc9adf0ccb9b7a9f66606f9a56023f9e2e9049f5`；revision2 manifest `ce6c18d5884b24dbf81423becaa48f4672b7a45fd84a95ee5a474b8a1405bd64`，受测contract `27f547649025f9a7c94a499355ed25a94c72fed01e875a263e0a38cc0add8772` |

三正向 distinct 为12194／30965／6187、队列0。六负分别命中 LateCorrect、NoOrphanMessage、ClaimsWholeBatch、UnknownNotAbsence、PendingOwned、NoSettlementThroughUnknownOpened。修正后的 UnknownAsAbsent 真实轨迹 Prepare→Submit→LoseAck→Recover，无StopOld，pending仍true／stopped仍false时 unsafeAbsence=true；不是语法或工具错误。负控找到指定反例即停，不声称完成负配置空间。

Java Temurin21.0.12.1+1 与 TLA tools `2026.09.12.025210` 的实际版本及二进制hash、精确argv／cwd／PID／终态／原始输出／输入快照均在两份闭合归档。每任务一worker、最多三并行、测量期限300秒，全部实际终止、无timeout。这是测量边界，不是产品默认策略。

## 原件与读回

- [run1报告原字节](run1-REPORT.txt)、[run1归档](run1-evidence.tar.gz)、[run1机器结果](run1-results.json)：210成员，SHA256 `7ec0da63cbb34d644d6318dc261f358be8dfa765cbdb08d1830956be551cebb8`。
- [run2报告原字节](run2-REPORT.txt)、[run2归档](run2-evidence.tar.gz)、[run2机器结果](run2-results.json)：193成员，SHA256 `326923543737c3146994004048a51db7f752eab8e317ee7a8e1b024de0512e2f`。
- [主线核对](root-verification.json)、[现场核对源码](root-verification.py)、[文件hash](input-and-output-hashes.json)。两轮原报告以txt保存原Markdown字节；解包后原相对链接对应各自文件。现场核对源码使用执行时HUB路径；重现形式运行应恢复各归档inputs，沿保存argv指定Java／JAR、调整cwd与独立metadir，不修改cfg／常量／oracle。

两份归档共403成员全部逐字读回；run2全部102 source输入仍匹配。最终revision3的contract `4a31cb8bc98ae5bbb55a28c671ff84a8f86520747de7dd07c180787183651689` 只改正文／导航等五文档，24形式资源与run2完全一致；run2没有执行这份新正文及其四组新规范向量。起草／评审三修订的 [191文件归档](../../proposals/model-request-adaptation/reviews/model-request-runtime-v4-2026-09-27.tar.gz) 保持原字节。原报告中 `human_interpretation_recorded_by_verification_agent` 字段是执行agent的文本判读，不是人类审核或总体签收。

## 不能推出的结果

模型限定两个结算者、一个抽象业务身份、一条序列日志、一个sent／终结边界及有限noise／Budget；没有公平或活性承诺。StopOld／RecoverOpened为抽象给定动作，实际完整合法读权、身份／codec、旧物理写者停止、IO／同步／恢复、多值headers、观测、全部十三操作及37认证均未验证。保留owner不保证未来获调度，有限Budget不是默认重试数。OneResponse／FirstTokenCorrect无各自独立负开关，不宣称独立validity已证。没有产品测试、付费或无条件证明；新规格接受另由决定与registry登记。
