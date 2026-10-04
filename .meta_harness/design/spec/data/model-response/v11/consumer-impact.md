# MR11 ACK后继消费者影响（candidate）

MR10 S-46/S-47→MR11 S-49：合法ACK释放例外；Pending/final自身字段不变，回送原值不重造校准或派生；Schema直接依赖MS8/CA4。

推荐/采用不自动迁移消费者。runtime、消息原子写方、费用读面与内容存储必须同时采用ACK边界；任一方仍按旧“永久全文可取”处理，不能宣称完成迁移。原未ACK路径保持，单轨后继不留永久noGC模式。

## 批内对齐及证据边界

PF-013 rev17 §6.19为ACK新依据，其余需求只继承source-alignment列出的已消费范围。四后继统一CallKey/creationKey及现有失败域；ACK不是处分，ModelCallAcknowledgedRecord唯一归MS8，Pending完整值唯一归MR11，Usage/Cost归CA4，ACK操作/清理责任归RT12。相同ResponseId原事实在final、ACK小见证、ready间选择一次；先核所有仍需可核来源，不以优先级隐藏矛盾。

RT12→MR11/MS8/CA4，MR11→MS8/CA4，MS8→CA4；CA不反向引用MR/MS。MS8原CredentialScope/ResponseId等防环就地表示沿D-060 M2，与MR11逐字形状/含义对齐；ACK witness引用MS内已有def，未新增第二同义定义。MS8 created仍MP6、dispatched仍MP5；MR11原响应仍MP5。SL3和CB3/LC6等其余依赖精确保持。纯invokeModel不加Session/ACK；纯sum仍显式收已选一份账。

所有前驱冻结内容保持。继承模型/实例仅证明原配置表达的性质；本批不重跑或重登为新ACK证明。lineage.json仅表达legacy baseline迁入，不适合普通后继，因此不改；id-namespaces无新族。catalog登记四candidate/resources与真实消费clause，covers新增ACK范围，formal-tasks仅ACK两个正配置；负控不登记成功任务。

## 版本与资源影响

字段或来源边界需改：runtime ACK/小读面/后继结算及Storage保留，消息ACK形状/当前写权/同批，费用读面来源选择。可保持实现签名：CA纯sum、普通invoke、MR纯值形状；不能仅凭升版预设全部包重写。四契约/三Schema是新candidate；其他依赖只按既有精确版本消费。
