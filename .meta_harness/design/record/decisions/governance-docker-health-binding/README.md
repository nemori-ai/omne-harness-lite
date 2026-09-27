# D-072 · Docker 健康探针的单进程公开入口绑定

[决定](decision.md)接受既有公开main函数的同进程调用，关闭包装器另起CLI子进程的生命周期缺口。EC3/HT3、停止协议、Docker健康命令和原健康判据不变；[精确快照](provider-snapshot.json)只记录设计采用，不表示实现或新制品已验证。
