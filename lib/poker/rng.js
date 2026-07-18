/**
 * Deterministic seeded RNG (mulberry32) so every simulation is reproducible.
 */
export class Rng {
  state;
  constructor(seed) {
    this.state = typeof seed === "number" ? seed >>> 0 : Rng.hashString(seed);
    if (this.state === 0) this.state = 0x9e3779b9;
  }
  static hashString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  /** Uniform float in [0, 1). */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Integer in [0, n). */
  int(n) {
    return Math.floor(this.next() * n);
  }
  /** Float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }
  /** Bernoulli trial. */
  chance(p) {
    return this.next() < p;
  }
  /** Sample an index from an array of non-negative weights. */
  weighted(weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return this.int(weights.length);
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }
  /** Approximately normal sample via central limit (sum of 6 uniforms). */
  gaussian(mean, std) {
    let s = 0;
    for (let i = 0; i < 6; i++) s += this.next();
    return mean + ((s - 3) / Math.sqrt(0.5)) * std;
  }
  /** Serializable internal state for checkpointing. */
  getState() {
    return String(this.state);
  }
  setState(s) {
    this.state = Number(s) >>> 0;
  }
}
