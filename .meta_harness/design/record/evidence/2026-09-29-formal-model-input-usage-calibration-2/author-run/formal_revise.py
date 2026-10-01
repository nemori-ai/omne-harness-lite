from pathlib import Path
p=Path('.meta_harness/design/spec/capabilities/model-request-runtime/v10/formal/UsageCalibration.tla');s=p.read_text()
s=s.replace('Window, Reserved, Margin','Window, Reserved, Margin, StableSuccessor')
s=s.replace('CHOOSE r \\in Candidates: \\A q \\in Candidates: r.id>=q.id','CHOOSE r \\in Candidates: \\A q \\in Candidates:\n    IF Bug="KeepOldAnchor" THEN r.id<=q.id ELSE r.id>=q.id')
s=s.replace('ChangeOldPrefix == /\\ s.phase="edit"','ChangeOldPrefix == /\\ ~StableSuccessor /\\ s.phase="edit"').replace('ChangeBasis == /\\ s.phase="edit"','ChangeBasis == /\\ ~StableSuccessor /\\ s.phase="edit"')
s=s.replace('PlanFull == /\\ s.phase="edit" /\\ Candidates={}','PlanFull == /\\ s.phase="edit" /\\ (Candidates={} \\/ Bug="NeverUseAnchor")')
s=s.replace('PlanMarginal == /\\ s.phase="edit" /\\ Candidates#{}','PlanMarginal == /\\ s.phase="edit" /\\ Candidates#{} /\\ Bug#"NeverUseAnchor"')
s=s.replace('EventuallyDone == <>(s.phase="done")','''EventuallyDone == <>(s.phase="done")
\* Scope: stable-prefix/basis configuration, accurate observations, finite next calls.
\* The id here is the finite causal dispatch index, not a lexicographic real-world id.
UsesAnchor(i) == s.call=i+1 /\\ PlanActive /\\ s.plan.marginal /\\ s.plan.anchor.id=i
AccurateCommitted(i) == s.call=i /\\ s.phase="committed"
 /\\ s.received.kind="accurate" /\\ i \\in s.receipts
ReanchorProgress == \\A i \\in 1..(MaxCalls-1): AccurateCommitted(i) ~> UsesAnchor(i)
\* Ensures the first reanchor path actually occurs; rejection cannot satisfy it.
EventuallyReanchored == <>UsesAnchor(1)''')
p.write_text(s)
for cfg in list(p.parent.glob('UsageCalibration_*.cfg'))+list((p.parent/'validity-check').glob('UsageCalibration_*.cfg')):
 t=cfg.read_text().replace(' Margin = 0',' Margin = 0\n StableSuccessor = FALSE');cfg.write_text(t)
q=p.parent/'UsageCalibration_ReanchorProgress.cfg';q.write_text((p.parent/'UsageCalibration_Progress.cfg').read_text().replace('MaxCalls = 2','MaxCalls = 3').replace('Window = 12','Window = 100').replace('StableSuccessor = FALSE','StableSuccessor = TRUE').replace('PROPERTY EventuallyDone','PROPERTIES\n EventuallyDone\n ReanchorProgress\n EventuallyReanchored'))
for bug in ['NeverUseAnchor','KeepOldAnchor']:
 t=q.read_text().replace('Bug = "None"','Bug = "'+bug+'"');a=t.index('INVARIANTS');t=t[:a]+'PROPERTY ReanchorProgress\n';(p.parent/'validity-check'/('UsageCalibration_'+bug+'.cfg')).write_text(t)
