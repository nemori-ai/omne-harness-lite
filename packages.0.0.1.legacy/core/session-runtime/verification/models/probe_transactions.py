"""SQLite protocol prototype; does not implement Session provider ports."""
from pathlib import Path
import sqlite3, tempfile, json

with tempfile.TemporaryDirectory(prefix='session-design-') as d:
    db=sqlite3.connect(str(Path(d)/'state.db'),isolation_level=None)
    db.executescript('CREATE TABLE journal(seq INTEGER PRIMARY KEY, kind TEXT, id TEXT); CREATE TABLE pending(id TEXT PRIMARY KEY); CREATE TABLE adopted(id TEXT PRIMARY KEY); CREATE TABLE execution(call TEXT PRIMARY KEY, owner TEXT);')
    # Atomic failure between two participants leaves neither side committed.
    db.execute('BEGIN IMMEDIATE')
    db.execute("INSERT INTO journal(kind,id) VALUES('accepted','rollback')")
    db.execute("INSERT INTO pending VALUES('rollback')")
    db.execute('ROLLBACK')
    assert db.execute('SELECT COUNT(*) FROM journal').fetchone()[0]==0
    assert db.execute('SELECT COUNT(*) FROM pending').fetchone()[0]==0
    # A deterministic unbounded pattern prefix: every speculative read loses tail.
    db.execute("INSERT INTO pending VALUES('original')")
    speculative_success=0
    for i in range(100):
        tail=db.execute('SELECT COUNT(*) FROM journal').fetchone()[0]
        db.execute("INSERT INTO journal(kind,id) VALUES('unrelated',?)",(str(i),))
        if tail==db.execute('SELECT COUNT(*) FROM journal').fetchone()[0]:speculative_success+=1
    assert speculative_success==0
    # Each locked current-state decision commits even while the stream continues.
    claimed=0
    for i in range(100):
        key='input'+str(i)
        db.execute('BEGIN IMMEDIATE')
        db.execute("INSERT INTO journal(kind,id) VALUES('accepted',?)",(key,))
        db.execute('INSERT INTO pending VALUES(?)',(key,))
        db.execute('COMMIT')
        db.execute('BEGIN IMMEDIATE')
        rows=db.execute('SELECT id FROM pending ORDER BY id LIMIT 1').fetchall()
        for (item,) in rows:
            db.execute('INSERT INTO adopted VALUES(?)',(item,))
            db.execute("INSERT INTO journal(kind,id) VALUES('adopted',?)",(item,))
            db.execute('DELETE FROM pending WHERE id=?',(item,));claimed+=1
        db.execute('COMMIT')
    assert claimed==100
    # A duplicate proof can read the prior owner, but cannot insert a new owner.
    db.execute('BEGIN IMMEDIATE');db.execute("INSERT INTO execution VALUES('call','owner1')");db.execute('COMMIT')
    duplicate_starts=0
    for candidate in ['owner2','owner3']:
        try:
            db.execute('BEGIN IMMEDIATE');db.execute('INSERT INTO execution VALUES(?,?)',('call',candidate));db.execute('COMMIT');duplicate_starts+=1
        except sqlite3.IntegrityError:db.execute('ROLLBACK')
    assert duplicate_starts==0 and db.execute('SELECT owner FROM execution').fetchone()[0]=='owner1'
    out={'scope':'SQLite deterministic protocol prototype, not product provider/migration/concurrent scheduler proof','sqlite':sqlite3.sqlite_version,'rollback_both_participants':True,'speculative_pattern_retries':100,'locked_claims_with_continuing_appends':claimed,'duplicate_new_execution_owners':duplicate_starts}
    print(json.dumps(out));db.close()
