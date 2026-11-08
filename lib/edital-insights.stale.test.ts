import { describe, expect, it } from "vitest";
import { isEditalProcessingStale } from "./edital-insights";

const now = Date.parse("2026-11-08T13:30:00Z");

describe("isEditalProcessingStale", () => {
  it("considera interrompida a leitura parada há mais de 10 minutos", () => {
    expect(isEditalProcessingStale({ status: "processing", updatedAt: "2026-11-08T13:00:00Z" }, now)).toBe(true);
  });

  it("mantém como em andamento a leitura recente", () => {
    expect(isEditalProcessingStale({ status: "processing", updatedAt: "2026-11-08T13:25:00Z" }, now)).toBe(false);
  });

  it("só vale para leituras em andamento e com data conhecida", () => {
    expect(isEditalProcessingStale({ status: "ready", updatedAt: "2026-11-08T10:00:00Z" }, now)).toBe(false);
    expect(isEditalProcessingStale({ status: "processing", updatedAt: null }, now)).toBe(false);
  });
});
