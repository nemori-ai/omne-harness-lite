"""Scoped Litestream 0.5.17 file-replica probe; no production data or power-loss claim."""
from pathlib import Path
import hashlib, json, os, platform, signal, sqlite3, subprocess, tempfile, time
ROOT=Path(__file__).resolve().parent
BINARY=ROOT/'bin/litestream'
RUN=Path(tempfile.mkdtemp(prefix='omne-ls-', dir='/tmp'))
DB=RUN/'center.db'; REPLICA=RUN/'replica'; SOCKET=RUN/'control.sock'
report={'run':str(RUN),'platform':platform.platform(),'sqlite':sqlite3.sqlite_version,'binary_sha256':hashlib.sha256(BINARY.read_bytes()).hexdigest(),'events':[]}
def event(name, **detail): report['events'].append({'name':name, **detail})
def cli(*args, ok=True):
    start=time.monotonic(); r=subprocess.run([str(BINARY),*map(str,args)],capture_output=True,text=True,timeout=15)
    event('command',args=list(map(str,args)),exit=r.returncode,stdout=r.stdout,stderr=r.stderr,elapsed_ms=round((time.monotonic()-start)*1000,2))
    if ok: assert r.returncode==0,r.stderr
    return r
def sync(ok=True): return cli('sync','-wait','-json','-timeout','2','-socket',SOCKET,DB,ok=ok)
def restore(label):
    dst=RUN/(label+'.db'); cli('restore','-json','-integrity-check','full','-o',dst,'file://'+str(REPLICA))
    with sqlite3.connect(dst) as db:return db.execute('select * from security_fact order by id').fetchall()
con=sqlite3.connect(DB); con.execute('pragma journal_mode=wal'); con.execute('pragma synchronous=full')
con.execute('create table security_fact(id integer primary key, revision integer not null)'); con.execute('insert into security_fact values(1,1)'); con.commit()
CONFIG=RUN/'litestream.yml'
CONFIG.write_text(f'''socket:
  enabled: true
  path: {SOCKET}
dbs:
  - path: {DB}
    replica:
      type: file
      path: {REPLICA}
      sync-interval: 1h
''')
proc=None
try:
    with (RUN/'daemon.log').open('w') as log:
        proc=subprocess.Popen([str(BINARY),'replicate','-config',str(CONFIG)],stdout=log,stderr=subprocess.STDOUT)
        end=time.monotonic()+8
        while not SOCKET.exists():
            assert proc.poll() is None, (RUN/'daemon.log').read_text()
            assert time.monotonic()<end,'socket timeout'
            time.sleep(.05)
        result=json.loads(sync().stdout); assert result['replica_txid']>=result['txid']>0
        assert restore('initial')==[(1,1)]
        proc.send_signal(signal.SIGSTOP)
        con.execute('update security_fact set revision=2 where id=1'); con.commit()
        assert restore('without-barrier')==[(1,1)]
        failed=sync(ok=False); assert failed.returncode!=0
        event('paused_replication',local_revision=2,restored_revision=1,sync_exit=failed.returncode)
        proc.send_signal(signal.SIGCONT)
        result=json.loads(sync().stdout); assert result['replica_txid']>=result['txid']>0
        assert restore('with-barrier')==[(1,2)]
        event('barrier_restore',revision=2)
        # A local rollback is another write; replication itself does not know the upgrade commit decision.
        con.execute('update security_fact set revision=1 where id=1'); con.commit(); sync()
        assert restore('replicated-rollback')==[(1,1)]
        event('rollback_is_replicated',revision=1)
        proc.kill(); proc.wait(timeout=3)
        assert restore('after-daemon-kill')==[(1,1)]
        event('restore_after_sigkill',revision=1)
        report['status']='pass'
finally:
    con.close()
    if proc and proc.poll() is None:
        proc.send_signal(signal.SIGCONT); proc.terminate()
        try: proc.wait(timeout=3)
        except subprocess.TimeoutExpired: proc.kill(); proc.wait()
    (ROOT/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':report.get('status','failed'),'run':str(RUN),'events':len(report['events'])}))
