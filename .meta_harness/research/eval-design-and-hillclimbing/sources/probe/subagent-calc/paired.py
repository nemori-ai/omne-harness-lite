import math, itertools
def t_sf_two_sided(t, df):
    # numeric integration of Student t pdf
    c = math.gamma((df+1)/2)/(math.sqrt(df*math.pi)*math.gamma(df/2))
    f = lambda x: c*(1+x*x/df)**(-(df+1)/2)
    # integrate from |t| to large
    a=abs(t); b=a+200; N=200000; h=(b-a)/N
    s=f(a)+f(b)+sum((4 if i%2 else 2)*f(a+i*h) for i in range(1,N))
    return 2*s*h/3
def paired_t(d):
    n=len(d); m=sum(d)/n; sd=math.sqrt(sum((x-m)**2 for x in d)/(n-1)); t=m/(sd/math.sqrt(n))
    return m,t,t_sf_two_sided(t,n-1)
def wilcoxon_exact(d):
    nz=[x for x in d if x!=0]; n=len(nz)
    absd=sorted(set(abs(x) for x in nz))
    # average ranks for ties
    vals=sorted(abs(x) for x in nz); ranks={}
    i=0
    while i<n:
        j=i
        while j<n and vals[j]==vals[i]: j+=1
        ranks[vals[i]]=(i+1+j)/2; i=j
    W=sum(ranks[abs(x)] for x in nz if x>0)
    rs=[ranks[abs(x)] for x in nz]
    tot=sum(rs); obs=min(W,tot-W); cnt=0; ext=0
    for signs in itertools.product((0,1),repeat=n):
        w=sum(r for r,s in zip(rs,signs) if s); cnt+=1
        if min(w,tot-w)<=obs+1e-12: ext+=1
    return W, ext/cnt
third=1/3
scen={
 "A: 5 tickets +1/3, 9 tickets 0 (net +1.67 tickets, no regressions)": [third]*5+[0]*9,
 "B: 7 tickets +1/3, 2 tickets -1/3, 5 tickets 0 (net +1.67)": [third]*7+[-third]*2+[0]*5,
 "C: 2 tickets +1, 1 ticket +1/3, 1 ticket -2/3, rest 0 (net +1.67)": [1,1,third,-2*third]+[0]*10,
}
for k,d in scen.items():
    m,t,p=paired_t(d); W,pw=wilcoxon_exact(d)
    print(f"{k}\n   mean diff={m*100:.1f}pp  paired t={t:.2f} p={p:.3f}  Wilcoxon exact p={pw:.3f}")
