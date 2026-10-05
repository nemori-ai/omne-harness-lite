# Policy and persistence

The accepted R1-T5 slice separates CAS decisions from SQLite operations. Private record ports expose inspect and whole-row replacement. The SQL provider binds them inside the original storage callback.

The policy retains token ownership, failure priority and admission rules. The provider retains the original layout, initialization and transaction ownership. The open factory selects the binding. Neither layer adds a retry, commit, decoder or recovery policy.

The returned instance owns storage. Its close waits for directory synchronization too. This ownership differs from a service that borrows storage. Recheck this boundary if the storage callback or resource lifecycle changes.

These private ports add functions and calls. Complexity and real consumer behavior require measurement. This decision does not claim lower total complexity or completed domain acceptance.
