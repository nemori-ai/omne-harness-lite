(ns uml-viewer.domain.config)

(def crap-thresholds
  "CRAP μ+σ. Lower is better: green, yellow, then red."
  {:green 8
   :yellow 12
   :red 20})

(def mutation-thresholds
  "Mutation score as 0–1. Higher is better: red, yellow, then green."
  {:red 0.80
   :yellow 0.90
   :green 1.00})

(def grade-best 10.0)
(def grade-mid 5.5)
(def grade-worst 1.0)

(defn crap-band
  "Traffic light for a CRAP score. Missing counts as red."
  [score]
  (if (nil? score)
    :red
    (let [{:keys [green yellow]} crap-thresholds]
      (cond
        (<= score green) :green
        (<= score yellow) :yellow
        :else :red))))

(defn mutation-band
  "Traffic light for a mutation score in 0–1. Missing counts as red."
  [score]
  (if (nil? score)
    :red
    (let [{:keys [red yellow]} mutation-thresholds]
      (cond
        (<= score red) :red
        (<= score yellow) :yellow
        :else :green))))

(defn- lerp [x x0 x1 y0 y1]
  (if (= (double x0) (double x1))
    (double y0)
    (let [t (/ (- (double x) (double x0))
               (- (double x1) (double x0)))]
      (+ y0 (* t (- y1 y0))))))

(defn- along
  "Clamp `x` onto stops `[x0 x1 x2]` mapped to `[y0 y1 y2]`."
  [x x0 x1 x2 y0 y1 y2]
  (cond
    (<= x x0) y0
    (<= x x1) (lerp x x0 x1 y0 y1)
    (<= x x2) (lerp x x1 x2 y1 y2)
    :else y2))

(defn crap-risk
  "μ+σ from a CRAP map, or nil."
  [crap]
  (when (:mu crap)
    (+ (double (:mu crap)) (double (or (:sigma crap) 0)))))

(defn crap-grade
  "CRAP μ+σ on the 1–10 scale (10 is best). Missing counts as red (1)."
  [score]
  (if (nil? score)
    grade-worst
    (let [{:keys [green yellow red]} crap-thresholds]
      (along (double score) green yellow red
             grade-best grade-mid grade-worst))))

(defn mutation-ratio
  "Killed / (killed + survived), or nil when there is no mutant data."
  [m]
  (when (map? m)
    (let [k (:killed m)
          s (:survived m)]
      (when (or k s)
        (let [n (+ (double (or k 0)) (double (or s 0)))]
          (when (pos? n)
            (/ (double (or k 0)) n)))))))

(defn mutation-grade
  "Mutation ratio on the 1–10 scale (10 is best). Missing counts as red (1)."
  [score]
  (if (nil? score)
    grade-worst
    (let [{:keys [red yellow green]} mutation-thresholds]
      (along (double score) red yellow green
             grade-worst grade-mid grade-best))))

(defn combined-grade
  "Average of present 1–10 grades. Nil when both are missing."
  [crap-g mut-g]
  (let [xs (filter some? [crap-g mut-g])]
    (when (seq xs)
      (/ (double (reduce + xs)) (count xs)))))

(defn worse-crap
  "The CRAP map with higher μ+σ.
  Nil is no candidate yet. A map with no μ counts as red."
  [a b]
  (cond
    (nil? a) b
    (nil? b) a
    :else
    (let [ra (crap-risk a)
          rb (crap-risk b)]
      (cond
        (nil? ra) a
        (nil? rb) b
        (> ra rb) a
        :else b))))

(defn worse-mutants
  "The killed/survived pair with the lower (worse) mutation ratio.
  Nil is no candidate yet. A pair with no ratio yields to a measured one."
  [a b]
  (cond
    (nil? a) b
    (nil? b) a
    :else
    (let [ra (mutation-ratio a)
          rb (mutation-ratio b)]
      (cond
        (and (nil? ra) (nil? rb)) a
        (nil? ra) b
        (nil? rb) a
        (< ra rb) a
        :else b))))
