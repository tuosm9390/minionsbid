import { describe, expect, it } from "vitest";
import {
  DEFAULT_BID_INCREMENT,
  normalizeBidIncrement,
} from "./auctionMode";

describe("normalizeBidIncrement", () => {
  it("기본값과 유효한 정수 단위를 사용한다", () => {
    expect(normalizeBidIncrement(undefined)).toBe(DEFAULT_BID_INCREMENT);
    expect(normalizeBidIncrement(50)).toBe(50);
  });

  it("잘못된 값은 기본값으로 보정한다", () => {
    expect(normalizeBidIncrement(0)).toBe(DEFAULT_BID_INCREMENT);
    expect(normalizeBidIncrement(-10)).toBe(DEFAULT_BID_INCREMENT);
    expect(normalizeBidIncrement(1.5)).toBe(DEFAULT_BID_INCREMENT);
    expect(normalizeBidIncrement("abc")).toBe(DEFAULT_BID_INCREMENT);
  });

  it("최대 단위를 넘지 않도록 보정한다", () => {
    expect(normalizeBidIncrement(200_000)).toBe(100_000);
  });
});
