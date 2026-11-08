import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("runs at most `limit` workers at once and keeps result order", async () => {
    let running = 0;
    let peak = 0;
    const delays = [30, 5, 20, 1, 10, 15];
    const results = await mapWithConcurrency(delays, 3, async (delay, index) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, delay));
      running -= 1;
      return index * 10;
    });
    expect(results).toEqual([0, 10, 20, 30, 40, 50]);
    expect(peak).toBe(3);
  });

  it("handles empty input and invalid limits", async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 0, async (n) => n * 2)).toEqual([2, 4]);
  });
});
