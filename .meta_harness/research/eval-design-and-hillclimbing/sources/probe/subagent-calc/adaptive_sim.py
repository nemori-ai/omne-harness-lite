# Toy model (my own assumptions, NOT from any source):
# - Each test item i has a baseline logit a_i ~ N(mu, 1.5^2) chosen so that population mean accuracy ~0.78.
# - Each round a candidate patch adds item-specific logit effects e_i ~ N(delta, tau^2) to the CURRENT version.
#   delta = true population-level effect of the patch (0 = no generalisable benefit).
# - Evaluating a version on the test set = K Bernoulli draws per item; score = mean over items of per-item mean.
# - Keep/revert rule: keep candidate iff its test score >= current version's test score measured in the same round (re-evaluated).
# - Final report: (a) test score of final kept version re-measured once; (b) "best test score seen across rounds" (select-best).
# - Truth: expected accuracy on FRESH items from the same population with the accumulated patch effects
#   (fresh items draw their own independent e_i, so item-specific luck does not carry over).
import random, math
def sig(x): return 1/(1+math.exp(-x))
def run(n, rounds=24, K=3, tau=0.6, delta=0.0, mu=1.6, sd=1.5, reps=4000, seed=0):
    rng=random.Random(seed)
    gap_final=0; gap_best=0; true_final=0; true_base=0; rep_final=0; rep_best=0
    for r in range(reps):
        a=[rng.gauss(mu,sd) for _ in range(n)]
        cur=a[:]  # current logits on test items
        accepted=0
        def score(logits):
            return sum(sum(rng.random()<sig(x) for _ in range(K))/K for x in logits)/len(logits)
        best=score(cur)
        for t in range(rounds):
            cand=[x+rng.gauss(delta,tau) for x in cur]
            s_cur=score(cur); s_c=score(cand)
            if s_c>=s_cur:
                cur=cand; accepted+=1; best=max(best,s_c)
            else:
                best=max(best,s_cur)
        final_reported=score(cur)
        # truth on fresh items: accumulated effect = sum of `accepted` independent N(delta,tau^2)
        M=4000; tf=0; tb=0
        for _ in range(M):
            x=rng.gauss(mu,sd); tb+=sig(x)
            tf+=sig(x+rng.gauss(delta*accepted, tau*math.sqrt(accepted)) if accepted else x)
        tf/=M; tb/=M
        rep_final+=final_reported; rep_best+=best; true_final+=tf; true_base+=tb
    k=reps
    return rep_final/k, rep_best/k, true_final/k, true_base/k
for n in (14,30,100):
    for delta in (0.0,0.15):
        rf,rb,tf,tb=run(n,delta=delta,reps=600 if n<100 else 300)
        print(f"n={n:3d} delta={delta:.2f}: true base={tb*100:.1f}%  true final={tf*100:.1f}%  reported final (re-measured)={rf*100:.1f}%  best-seen on test={rb*100:.1f}%  | optimism(final)={100*(rf-tf):+.1f}pp  optimism(best)={100*(rb-tf):+.1f}pp")
print("--- sensitivity: tau=0.3 ---")
for n in (14,30):
    rf,rb,tf,tb=run(n,delta=0.0,tau=0.3,reps=600,seed=1)
    print(f"n={n:3d} delta=0 tau=0.3: true final={tf*100:.1f}% reported final={rf*100:.1f}% best-seen={rb*100:.1f}% | optimism(final)={100*(rf-tf):+.1f}pp optimism(best)={100*(rb-tf):+.1f}pp")
print("--- sensitivity: K=1 ---")
for n in (14,30):
    rf,rb,tf,tb=run(n,delta=0.0,K=1,reps=600,seed=2)
    print(f"n={n:3d} delta=0 K=1: true final={tf*100:.1f}% reported final={rf*100:.1f}% best-seen={rb*100:.1f}% | optimism(final)={100*(rf-tf):+.1f}pp optimism(best)={100*(rb-tf):+.1f}pp")
