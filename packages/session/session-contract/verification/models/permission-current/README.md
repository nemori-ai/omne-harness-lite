# 会话权限配值与当前读取

这是 C3b 的有限设计模型。它不证明产品代码已经实现配值，也不证明写入者有资格。实际写入资格、原动作和来源保管仍由各自拥有者保护。

## 状态与性质

一个会话的一个权限关口有持久修订与配值。配值是缺席、允许或禁止。合法写入和清除都改变修订。读取保留修订和值；捕获在同一提交边界比较原修订。修订不同返回 changed，不能把旧读取保存成 current。重启丢弃内存读取，保留已提交值。

- `CapturedMatchesCommit` 要求每个成功 current 与它的捕获时点一致。已经交回的结果不因之后的写入而违反该性质，所以它不是永久许可。
- `DurableValue` 要求重启不重置已提交的配值。它不把配值缺席与来源不可用合并。
- `TypeOK` 检查有限域与记录形状。

令持久状态为 S=(revision,value)，预读为 R。捕获全化为 C(S,R)=current(R)，当且仅当 R.revision=S.revision；其余有预读的情况返回 changed。每次设值和清除增加修订，则任意两次不同提交不能有同一修订。因此 revision 相等蕴含值未被另一次提交改变。重启保持持久状态，此结论不依赖进程实例。

这是安全性论证，不保证调用最终成功，不保证撤权与外部副作用原子。没有取得预读时不能调用 Capture；实际协议必须将缺失来源表达为不可用。

## 有限范围与负控

`MaxRevision=2`，允许任意交错的读取、捕获及至多一次重启。归档、授权、组织来源、多个关口和原动作围栏不在本模型内。Write 假定调用方已经具有该写入资格。

| 配置 | 故意删掉的规则 | 必须违反 |
| --- | --- | --- |
| positive.cfg | 无 | 所有不变量保持 |
| bad-stale-capture.cfg | 捕获不核修订 | CapturedMatchesCommit |
| bad-clear-revision.cfg | 清除不改修订 | CapturedMatchesCommit |
| bad-restart.cfg | 重启把持久值改成缺席 | DurableValue |

## 复跑

设置 `TLA2TOOLS_JAR` 指向实际 TLC JAR。在仓库根执行以下命令，把 cfg 换成表中各项。输出写任务 tmp。

```sh
java -Xmx256m -cp "$TLA2TOOLS_JAR" tlc2.TLC -workers 1 -seed 1 \
  -metadir tmp/formal/session-permission-current \
  -config packages/session/session-contract/verification/models/permission-current/positive.cfg \
  packages/session/session-contract/verification/models/permission-current/PermissionCurrent.tla
```

正例须退出 0 并报告没有错误。负控须退出 12，且明确报告表中指定不变量被违反。语法错误、工具缺失和超时均不算负控成功。`expect.txt` 同时支持现有 [WSL 运行入口](../run-tlc.sh)。不在正式目录保存一次运行的状态图或日志。

## 实现接续义务

Session 拥有配值、清除和修订。持久写入在提交边界认回当前资格；非空 evidence 不是证明。Governance 捕获必须消费 Session 拥有者提供的同事务事实，或在同事务验证预读修订。应用不得读 Session 私表拼装 current。独立验收必须用真实 SQL 的受控交错验证这些接点，不能用本模型代替实现测试。
