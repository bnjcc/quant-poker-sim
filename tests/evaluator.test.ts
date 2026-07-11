import { describe, expect, it } from "vitest";
import { cardsFromString, createDeck, shuffle } from "@/lib/poker/deck";
import { evaluate5, evaluate7 } from "@/lib/poker/evaluator";
import { Rng } from "@/lib/poker/rng";

describe("deck", () => {
  it("contains 52 unique cards", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    const keys = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    expect(keys.size).toBe(52);
  });

  it("shuffle is deterministic per seed and preserves the deck", () => {
    const a = shuffle(createDeck(), new Rng("seed-1"));
    const b = shuffle(createDeck(), new Rng("seed-1"));
    const c = shuffle(createDeck(), new Rng("seed-2"));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(new Set(a.map((x) => `${x.rank}${x.suit}`)).size).toBe(52);
  });
});

describe("rng", () => {
  it("reproduces sequences from saved state", () => {
    const r = new Rng("abc");
    r.next();
    const state = r.getState();
    const a = [r.next(), r.next(), r.next()];
    const r2 = new Rng("ignored");
    r2.setState(state);
    expect([r2.next(), r2.next(), r2.next()]).toEqual(a);
  });
});

describe("evaluate5", () => {
  const rank = (s: string) => evaluate5(cardsFromString(s));

  it("identifies each category", () => {
    expect(rank("AsKsQsJsTs").category).toBe("straight-flush");
    expect(rank("AsAhAdAc2s").category).toBe("four-of-a-kind");
    expect(rank("AsAhAdKcKs").category).toBe("full-house");
    expect(rank("As9s7s5s2s").category).toBe("flush");
    expect(rank("9s8h7d6c5s").category).toBe("straight");
    expect(rank("AsAhAd8c2s").category).toBe("three-of-a-kind");
    expect(rank("AsAhKdKc2s").category).toBe("two-pair");
    expect(rank("AsAh8d5c2s").category).toBe("pair");
    expect(rank("AsKh8d5c2s").category).toBe("high-card");
  });

  it("handles the wheel straight (A-5) and ranks it below a six-high straight", () => {
    const wheel = rank("Ah5s4d3c2s");
    expect(wheel.category).toBe("straight");
    expect(rank("6h5s4d3c2s").score).toBeGreaterThan(wheel.score);
  });

  it("compares kickers correctly", () => {
    expect(rank("AsAhKd5c2s").score).toBeGreaterThan(rank("AsAhQd5c2s").score);
    expect(rank("KsKhQdQc9s").score).toBeGreaterThan(rank("KsKhJdJcAs").score);
  });
});

describe("evaluate7", () => {
  it("finds the best five of seven", () => {
    const r = evaluate7(cardsFromString("AsKs2h3d QsJsTs"));
    expect(r.category).toBe("straight-flush");
  });

  it("split-pot equivalence: identical boards with irrelevant hole cards tie", () => {
    const board = "AhKhQhJhTh";
    const a = evaluate7(cardsFromString(`2s3d${board}`));
    const b = evaluate7(cardsFromString(`4c5c${board}`));
    expect(a.score).toBe(b.score);
  });
});

describe("fastScore7 cross-validation", () => {
  it("orders hands identically to evaluate7 across random 7-card samples", async () => {
    const { fastScore7 } = await import("@/lib/poker/evaluator");
    const rng = new Rng("xval");
    for (let t = 0; t < 500; t++) {
      const deck = shuffle(createDeck(), rng);
      const a = deck.slice(0, 7);
      const b = deck.slice(7, 14);
      const slowCmp = Math.sign(evaluate7(a).score - evaluate7(b).score);
      const fastCmp = Math.sign(fastScore7(a) - fastScore7(b));
      expect(fastCmp).toBe(slowCmp);
    }
  });
});
