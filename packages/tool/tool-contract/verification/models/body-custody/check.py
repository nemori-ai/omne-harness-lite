#!/usr/bin/env python3
"""Run bounded TLC cases; exact named counterexamples, not generic errors, pass negatives."""
import argparse, hashlib, json, os, pathlib, re, subprocess, time
ROOT = pathlib.Path(__file__).resolve().parent
JAR_SHA256 = '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'
CASES = [('Handoff','positive',None),('Custody','positive',None),
         ('Handoff','early','NoResponsibilityGap'),('Handoff','duplicate','AtMostOneAppend'),
         ('Custody','late-read','NoLateRead'),('Custody','native-delete','IndependentUseProtected'),
         ('Custody','revive','NoRevival'),('Custody','renew','FixedDeadline'),('Custody','reexecute','EffectStable'),
         ('Writer','positive',None),('Writer','early-publish','PublishSound'),
         ('Writer','drop-pending','NoPendingLost'),('Writer','late-accept','NoLateAdmission'),
         ('Materialization','positive',None),('Materialization','early-raw','RawUntilCommit'),
         ('Materialization','delete-data','FinalDataRecoverable'),
         ('Materialization','early-activate','ActivationOnlyAtCommit'),
         ('Materialization','unknown-cleanup','UnknownIsNotFailure')]
parser=argparse.ArgumentParser()
parser.add_argument('--case')
parser.add_argument('--jar', default=os.environ.get('TLA2TOOLS_JAR'))
parser.add_argument('--out', required=True)
args=parser.parse_args()
if not args.jar:
    parser.error('--jar or TLA2TOOLS_JAR is required')
JAR=pathlib.Path(args.jar).resolve()
if not JAR.is_file() or hashlib.sha256(JAR.read_bytes()).hexdigest()!=JAR_SHA256:
    parser.error('expected the pinned TLC 1.7.4 jar')
OUT=pathlib.Path(args.out).resolve()
(OUT/'logs').mkdir(parents=True,exist_ok=True)
env={**os.environ, 'NO_COLOR':'1', 'TERM':'dumb', 'LC_ALL':'C'}
results=[]
if args.case and args.case not in {f'{m}-{c}' for m,c,_ in CASES}:
    parser.error('unknown case')
for module, case, expected in CASES:
    name=f'{module}-{case}'
    if args.case and args.case != name: continue
    cmd=['java','-Xmx768m','-XX:+UseParallelGC','-cp',str(JAR),'tlc2.TLC','-workers','1','-cleanup','-metadir',str(OUT/'states'/name),'-config',f'{name}.cfg',f'{module}.tla']
    started=time.monotonic()
    try:
        run=subprocess.run(cmd,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=60,env=env)
        output=run.stdout; code=run.returncode
    except subprocess.TimeoutExpired as error:
        output=(error.stdout or b'').decode() if isinstance(error.stdout,bytes) else (error.stdout or '')
        code=124
    (OUT/'logs'/f'{name}.log').write_text(output)
    violations=re.findall(r'Invariant (\w+) is violated',output)
    passed=(code==0 and 'Model checking completed. No error has been found.' in output) if expected is None else (code==12 and violations==[expected])
    result={'case':name,'modelSha256':hashlib.sha256((ROOT/f'{module}.tla').read_bytes()).hexdigest(),'configSha256':hashlib.sha256((ROOT/f'{name}.cfg').read_bytes()).hexdigest(),'expectedInvariant':expected,'exitCode':code,'passed':passed,'violations':violations,'seconds':round(time.monotonic()-started,3),'stateStats':re.findall(r'[\d,]+ states generated, [\d,]+ distinct states found, [\d,]+ states left on queue.',output),'command':cmd}
    results.append(result); print(json.dumps(result),flush=True)
summary={'jar':str(JAR),'jarSha256':hashlib.sha256(JAR.read_bytes()).hexdigest(),'java':subprocess.run(['java','-version'],capture_output=True,text=True).stderr,'cases':results,'passed':all(r['passed'] for r in results)}
out=OUT/('summary-'+args.case+'.json' if args.case else 'summary.json'); out.write_text(json.dumps(summary,indent=2)+'\n')
raise SystemExit(0 if summary['passed'] else 1)
