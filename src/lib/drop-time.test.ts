import { describe, it, expect } from "vitest";
import {
  toLocalInputValue,
  fromLocalInputValue,
  getDropUrgency,
  formatDropCountdown,
  dropDiffMs,
} from "./drop-time";

describe("toLocalInputValue / fromLocalInputValue", () => {
  it("returns empty string for falsy / invalid input", () => {
    expect(toLocalInputValue("")).toBe("");
    expect(toLocalInputValue(null)).toBe("");
    expect(toLocalInputValue("not-a-date")).toBe("");
    expect(fromLocalInputValue("")).toBe("");
    expect(fromLocalInputValue("nope")).toBe("");
  });

  it("round-trips a local datetime-local value through ISO without drift", () => {
    const local = "2026-06-30T14:30";
    const iso = fromLocalInputValue(local);
    expect(iso).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    // round-trip back to local input should preserve the wall clock the admin typed
    expect(toLocalInputValue(iso)).toBe(local);
  });

  it("preserves the absolute moment regardless of viewer offset", () => {
    // A UTC instant interpreted via Date is anchored to that instant; the
    // local-input representation reflects the viewer's offset, but the ISO is stable.
    const iso = "2026-01-15T09:00:00.000Z";
    const local = toLocalInputValue(iso);
    // Whatever the local string is, converting back yields the same UTC instant.
    expect(fromLocalInputValue(local)).toBe(iso);
  });
});

describe("getDropUrgency", () => {
  it("classifies remaining time into urgency tiers", () => {
    expect(getDropUrgency(0)).toBe("none");
    expect(getDropUrgency(-5)).toBe("none");
    expect(getDropUrgency(30 * 1000)).toBe("huge");
    expect(getDropUrgency(60 * 1000)).toBe("huge");
    expect(getDropUrgency(60 * 1000 + 1)).toBe("strong");
    expect(getDropUrgency(10 * 60 * 1000)).toBe("strong");
    expect(getDropUrgency(10 * 60 * 1000 + 1)).toBe("soft");
    expect(getDropUrgency(60 * 60 * 1000)).toBe("soft");
    expect(getDropUrgency(60 * 60 * 1000 + 1)).toBe("none");
    expect(getDropUrgency(5 * 60 * 60 * 1000)).toBe("none");
  });
});

describe("formatDropCountdown", () => {
  it("renders HH:MM:SS for drops within 72h", () => {
    expect(formatDropCountdown(0)).toBe("00:00:00");
    expect(formatDropCountdown(1500)).toBe("00:00:01");
    expect(formatDropCountdown(65 * 1000)).toBe("00:01:05");
    expect(formatDropCountdown(2 * 3600 * 1000 + 5 * 60 * 1000 + 9 * 1000)).toBe("02:05:09");
    // Exactly 72h still uses HH:MM:SS
    expect(formatDropCountdown(72 * 3600 * 1000)).toBe("72:00:00");
  });

  it("collapses to days+hours past 72h", () => {
    expect(formatDropCountdown(72 * 3600 * 1000 + 1)).toBe("3D 00H");
    expect(formatDropCountdown(5 * 86400 * 1000 + 7 * 3600 * 1000)).toBe("5D 07H");
  });

  it("clamps negatives to zero", () => {
    expect(formatDropCountdown(-1000)).toBe("00:00:00");
  });
});

describe("dropDiffMs", () => {
  it("returns positive remaining ms for future targets", () => {
    const now = Date.parse("2026-06-01T00:00:00.000Z");
    expect(dropDiffMs("2026-06-01T00:00:10.000Z", now)).toBe(10_000);
  });

  it("clamps past targets to 0", () => {
    const now = Date.parse("2026-06-01T00:00:00.000Z");
    expect(dropDiffMs("2026-05-01T00:00:00.000Z", now)).toBe(0);
  });

  it("returns 0 for invalid ISO", () => {
    expect(dropDiffMs("garbage", Date.now())).toBe(0);
  });
});
