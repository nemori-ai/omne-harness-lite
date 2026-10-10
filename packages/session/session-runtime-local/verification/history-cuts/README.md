# History cut publication model

`HistoryCuts.tla` checks two readers, at most three appended rows and one journal generation. Readers observe a fixed prefix, then commit or fail. Only a committed read can publish while the owner is open. A late read cannot replace a later head. Each cut retains the identity counts from its own rows.

Run `java -cp /opt/tlaplus/tla2tools.jar tlc2.TLC -config HistoryCuts.cfg HistoryCuts.tla` from this directory. The three alternative configurations deliberately violate commit ordering, fixed-cut answers or monotone head publication. Each must fail its corresponding invariant.

This finite safety model does not model JavaScript scheduling, SQLite, JSON validation, allocation size, multiple generations or borrow drain. The actual SQLite tests in `tests/runtime.spec.ts` cover rollback, out-of-order atomic completion, closure, retained-root limits and sharing between a head and its borrow. The model does not prove unrestricted runtime correctness or a hard heap bound.
