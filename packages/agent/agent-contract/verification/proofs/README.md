# verification/proofs

本目录保存明确前提下的局部证明。它不证明整个 Agent 的安全性或活性。

## 允许的内容

保存性质、前提、推导、实现映射及能够推翻性质的验证资源。

## 边界

下面的证明只覆盖终结清单中 accepted-input 的处置。Journal 的当前资格、权威事件完整性、共同提交原子性和原调用收场仍是前提，各由原拥有者验证。有限模型检查和成员测试不能代替这些前提。

## 维护

被证明的承诺变化时，复核证明是否仍然成立。

## 本包事实

### 输入读取不代表输入已处理

在固定 Journal revision 上，记 A 为已接受输入集合，E 为已提交事件序列。T(E) 是 E 中 input-taken 事件列出的输入及其批次映射。读取缓存 R 只保存可重建的读取结果，不属于 T 的定义域。

inputs 读取不提交 input-taken，因此 E 不变，T(E) 也不变。无论 R 新增多少读取结果，未处理输入都不会因读取而进入 T。新 input-taken 提交改变 E 后，下一版本才允许得到新的 T。这证明只读查询不会使终结清单从 pending 或 held 变成 settled。

两个 Journal 的实现从 source.events 或 execution.events 建立 takenInputs 映射，不再从批次读取缓存推断处理事实。具体位置为 Agent 的 `src/testing/journal-finishing.ts` 和 Session adapters 的 `src/testing/journal.ts`。

### 节点失败保留未处理输入

令 F 表示 conclusion.kind=fail 且 failure.kind=node-failed，C 表示 conclusion.kind=cancelled。每个 i∈A 的处置 D 定义为：

1. i∈T(E) 时，D(i)=settled，保留该批次。
2. i∉T(E) 且 F 或 C 成立时，D(i)=held，保留原输入和 input-read 接续。
3. 其余情况下，D(i)=pending(input-disposition)。

三个分支互斥且覆盖 A，所以 D 在合法输入上是全函数。第二分支不修改 E，因此不会制造 input-taken。普通 fail 和 complete 都不满足 F 或 C，不能通过该分支越过未处理输入。

held 项保留 value、acceptance、origin、taken=null 和原 execution 的读取接续。此结论依赖 Journal 已保存完整原输入及其受理事实。它不授予跨租户读取或向后继 execution 重投的权利。

该规则只改变 accepted-input 项。原 Model/Tool、未定写、控制、Passage、卡片及其他保管项仍使用原判定。只要任一所需项仍为 unknown 或 pending，既有 tryFinish 条件就不能得到 ended。因此节点失败不是清空责任的捷径。

### 可执行守护与未证明部分

共同 conformance 的 `node-failed input custody` 场景分别验证普通失败、complete、节点失败、已处理与未处理输入混合，以及未知 Model 调用。它们通过公开 Journal 端口读取原输入、准备清单、尝试终结并读回原事实。前两例也能检出把读取缓存误作 input-taken 的实现。

这些局部推导不证明异常分类正确、Agent 必定进入收尾、存储断电耐久、取消的全部交错或任意并发活性。现有 Finishing 模型未单独建模 node-failed，不能用其旧运行记录声称覆盖该分支。候选 FailureClosure 的输入保管动作与生产实现仍需整波的映射和组合验收。
