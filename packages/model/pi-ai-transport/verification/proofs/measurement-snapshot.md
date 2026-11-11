# 异步计量输入一致性的安全证明

本文是待独立审阅的人工归纳证明，没有机器演绎检查。有限TLC检查对象是 [MeasurementSnapshot](../models/measurement/MeasurementSnapshot.tla)。它只证明本次调用消费值的一致性，不证明BPE算法、SHA-256抗碰撞或供应商预算规则。契约依据见 [SPEC](../../SPEC.md)。

## 命题与抽象

输入是四个分量的值记录。token代表完整tokenInput及单位对应，calibration代表anchor及outputs，limits代表context和全部限制，metadata代表profile、supplier、parameters、representation adoption和media等其余被消费值。这些分量各用0/1枚举的TLC配置是有限反例搜索。下述证明适用于各分量任意非空集合，因而不限于二值。

`external`可在任意两步之间变成该类型的任意值。`owned`是Begin同步取得、与external没有可变引用的完整值。countSource、digestSource、checkSource记录各计算消费的源值，不是token数量、摘要字符串或预算结果。记录源值使证明不依赖不同输入可能恰好算出相同摘要或计数这一偶合。

令 `I = TypeOK ∧ CountSnapshot ∧ DigestSnapshot ∧ CheckSnapshot`。关闭BadLiveDigest与BadLiveChecks后，命题是 `Spec ⇒ []I`。所有计算都用同一份owned，于是存在一个调用入口处的输入值v，使count、digest和checks分别等于其各自确定性函数作用于v的结果。这里函数实现正确性是另一个义务，不从来源相同推出算法正确。

## 初始态

Init使external属于输入类型，owned及三个source都取external，phase为idle。所有类型成立。三个一致性蕴含的条件都为假，所以I成立。

## 每个动作保持I

| 动作 | 推导 |
| --- | --- |
| `Mutate` | 只改external，保持属于输入类型。owned和全部source、phase不变，故任何已有一致性都不受影响。该动作可反复发生，无需限制调用者修改次数。 |
| `Begin` | 只在idle执行。它把external同一个值同时赋给owned和countSource，再把phase改成awaiting。因此CountSnapshot成立。另两个性质尚未要求source相等。此动作没有await，外部mutation不能夹在两次取值之间。 |
| `CountFinished` | 只把awaiting改为digest，所有值不变。CountSnapshot继续成立，另外两个性质尚未触发。 |
| `Digest` | 正常分支将digestSource设为owned，并把phase改为checks。CountSnapshot未变，新触发的DigestSnapshot成立。 |
| `Checks` | 正常分支将checkSource设为owned，并把phase改为done。前两项未变，新触发的CheckSnapshot成立。 |
| stuttering | 状态不变，所以I保持。 |

Next正好是这六类步骤，故 `I ∧ Next ⇒ I'`。按有限前缀长度归纳得 `Spec ⇒ []I`。此安全结论不要求计数Promise最终结束。

## 公开交接和实现义务

`measureCalibrated`须在首个await之前取得自己拥有的完整消费值。只复制外层对象不满足这里的值语义。嵌套tokenInput、units、media、context、limits、profile/supplier采用、parameters和calibration也须脱离调用方引用。没有实际读取的assembled不进入transport计量值；它的所有权属于提供该表示的调用链。

源码用structuredClone复制普通数据值，随后calibratedAmount、calibratedDigest、inputCheck与exactChecks都读取克隆。模型不证明structuredClone运行时、恶意getter/Proxy或共享可变内存的处理。输入须遵循公开数据契约，不能借`readonly`类型断言运行时没有别名。规则对象、tokenizer和回调是提供者能力；它们须在本次调用期间兑现固定配置及纯数据解释契约。这是家族/计量器提供者的组合前提，没有在模型中克隆函数或主体身份。

对于多个同时计量，每份调用都有不同的owned及source状态。Mutate可任意修改调用者持有的共享输入，但无法写入任何owned。将单调用证明逐实例应用，就得到每份结果对应自己的入口快照，不要求所有调用共享同一个时刻。这不证明提供者内部资源调度或授权隔离。

若tokenizer最终返回、后续本地计算不抛出且回调被调度，则有限phase链到done。没有该前提时允许永久awaiting，本文不声称无条件活性。
