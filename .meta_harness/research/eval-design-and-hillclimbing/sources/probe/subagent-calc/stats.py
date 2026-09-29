import math
z = 1.959963984540054  # z_{0.025}
zb = 0.8416212335729143  # z_{0.20}

def wilson(p, n, z=z):
    c = (p + z*z/(2*n)) / (1 + z*z/n)
    h = (z/(1 + z*z/n)) * math.sqrt(p*(1-p)/n + z*z/(4*n*n))
    return c-h, c+h

def binom_cdf(k, n, p):
    return sum(math.comb(n,i)*p**i*(1-p)**(n-i) for i in range(0,k+1))

def clopper(k, n, a=0.05):
    # lower: p s.t. P(X>=k)=a/2 ; upper: p s.t. P(X<=k)=a/2
    def bis(f, lo, hi):
        for _ in range(200):
            m=(lo+hi)/2
            if f(m): hi=m
            else: lo=m
        return (lo+hi)/2
    lo = 0.0 if k==0 else bis(lambda p: 1-binom_cdf(k-1,n,p) >= a/2, 0, 1)
    hi = 1.0 if k==n else bis(lambda p: binom_cdf(k,n,p) <= a/2, 0, 1)
    return lo, hi

def newcombe_diff(p1,n1,p2,n2):
    l1,u1 = wilson(p1,n1); l2,u2 = wilson(p2,n2)
    d = p1-p2
    lo = d - math.sqrt((p1-l1)**2 + (u2-p2)**2)
    hi = d + math.sqrt((u1-p1)**2 + (p2-l2)**2)
    return lo, hi

def fisher_two_sided(a,b,c,d):
    # table [[a,b],[c,d]] rows=groups, cols=success/fail
    n1=a+b; n2=c+d; k=a+c; N=n1+n2
    def pmf(x): return math.comb(n1,x)*math.comb(n2,k-x)/math.comb(N,k)
    p0=pmf(a); lo=max(0,k-n2); hi=min(k,n1)
    return sum(pmf(x) for x in range(lo,hi+1) if pmf(x)<=p0*(1+1e-9))

def fmt(t): return f"[{t[0]*100:.1f}%, {t[1]*100:.1f}%]"

print("== Wilson 95% (z=1.96) ==")
for n in (14, 30, 42):
    for p in (0.905, 0.786):
        print(f"n={n:3d} p={p:.3f} Wilson {fmt(wilson(p,n))}  width={100*(wilson(p,n)[1]-wilson(p,n)[0]):.1f}pp")
print("\n== integer counts near the reported values ==")
for k,n in ((13,14),(12,14),(11,14),(27,30),(24,30),(38,42),(33,42),(19,21)):
    w=wilson(k/n,n); cp=clopper(k,n)
    print(f"{k}/{n}={k/n*100:.2f}%  Wilson {fmt(w)}  Clopper-Pearson {fmt(cp)}")
print("\n== k/42 check: 38/42, 33/42 ==", round(38/42*100,2), round(33/42*100,2), " 19/21=",round(19/21*100,2), " 11/14=", round(11/14*100,2), " 12.67/14 ->", round(0.905*14,3))

print("\n== Newcombe (hybrid Wilson) 95% CI for difference 90.5%-78.6%, treated as independent samples ==")
for n in (14,30,42):
    print(f"n1=n2={n}: diff={11.9:.1f}pp  CI {fmt(newcombe_diff(0.905,n,0.786,n))}")
print("Fisher exact two-sided, 38/42 vs 33/42 (as if 84 independent trials):", round(fisher_two_sided(38,4,33,9),4))
print("Fisher exact two-sided, 13/14 vs 11/14:", round(fisher_two_sided(13,1,11,3),4))
print("Fisher exact two-sided, 27/30 vs 24/30 (~90%/80% at n=30):", round(fisher_two_sided(27,3,24,6),4))

print("\n== Paired exact sign test (McNemar exact) on 14 items: min discordant pairs all in one direction ==")
for d in range(3,9):
    p=2*(0.5**d)
    print(f"{d} discordant, all favour A: two-sided p={min(1,p):.4f}")
for (b,c) in ((6,1),(7,1),(7,2),(8,2)):
    n=b+c; p=2*binom_cdf(min(b,c),n,0.5)
    print(f"b={b},c={c}: two-sided exact p={min(1,p):.4f}")

print("\n== Design effect for 3 repeats per ticket (m=3), n_eff = 42/(1+(m-1)*rho) ==")
for rho in (0,0.25,0.5,0.75,1.0):
    ne=42/(1+2*rho); w=wilson(0.905,ne)
    print(f"rho={rho}: n_eff={ne:.1f}  Wilson for 90.5% {fmt(w)}")

print("\n== Miller (2024) eq.10 MDE with his fictional parameters (omega^2=1/9, sigma^2=1/6), alpha=.05, power=.8 ==")
for n in (14,30,44,198):
    for K in (1,3,10):
        d=(z+zb)*math.sqrt((1/9 + (1/6)/K + (1/6)/K)/n)
        print(f"n={n:3d} K={K:2d}: MDE={d*100:.1f}pp")

print("\n== Adaptive-analysis scale quantities (order-of-magnitude only, constants unspecified in sources) ==")
for n in (14,30,44,1000,10000):
    for k in (24,):
        print(f"n={n:5d}: sqrt(k/n) with k=24 -> {math.sqrt(k/n):.3f};  1/sqrt(n) -> {1/math.sqrt(n):.3f};  (log k / n)^(1/3) -> {(math.log(k)/n)**(1/3):.3f}; resolution 1/n -> {100/n:.1f}pp")
