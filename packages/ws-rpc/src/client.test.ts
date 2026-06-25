import { describe, expect, it } from "vitest";
import { backoffDelay } from "./client";

describe("backoffDelay", () => {
  it("grows exponentially from the minimum", () => {
    expect(backoffDelay(0, 1500, 30_000)).toBe(1500);
    expect(backoffDelay(1, 1500, 30_000)).toBe(3000);
    expect(backoffDelay(2, 1500, 30_000)).toBe(6000);
    expect(backoffDelay(3, 1500, 30_000)).toBe(12_000);
  });

  it("caps at the maximum", () => {
    expect(backoffDelay(10, 1500, 30_000)).toBe(30_000);
    expect(backoffDelay(100, 1500, 30_000)).toBe(30_000);
  });
});
