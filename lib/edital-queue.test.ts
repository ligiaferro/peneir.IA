import { describe, expect, it, vi } from "vitest";
import { readEditaisInBackground } from "./edital-queue";

const target = (id: string) => ({ id, title: id, organization: "Órgão", summary: "" });

function fakeAdmin(claimed: (id: string) => boolean = () => true) {
  const rpc = vi.fn(async (_name: string, args: { p_opportunity_id: string }) => ({
    data: claimed(args.p_opportunity_id),
    error: null,
  }));
  return { rpc } as never;
}

describe("readEditaisInBackground", () => {
  it("respeita o limite de leituras simultâneas e lê todos", async () => {
    let current = 0;
    let peak = 0;
    const process = vi.fn(async () => {
      current += 1;
      peak = Math.max(peak, current);
      await new Promise((resolve) => setTimeout(resolve, 5));
      current -= 1;
    });
    const result = await readEditaisInBackground(
      fakeAdmin(),
      ["a", "b", "c", "d", "e"].map(target),
      { stopAt: Date.now() + 10_000, concurrency: 2, process },
    );
    expect(process).toHaveBeenCalledTimes(5);
    expect(peak).toBe(2);
    expect(result.started).toBe(5);
  });

  it("não lê o que outra instância já reservou", async () => {
    const process = vi.fn(async () => {});
    await readEditaisInBackground(fakeAdmin((id) => id !== "b"), [target("a"), target("b")], {
      stopAt: Date.now() + 10_000,
      process,
    });
    expect(process).toHaveBeenCalledTimes(1);
  });

  it("não começa leituras depois do prazo", async () => {
    const process = vi.fn(async () => {});
    const result = await readEditaisInBackground(fakeAdmin(), [target("a")], {
      stopAt: Date.now() - 1,
      process,
    });
    expect(process).not.toHaveBeenCalled();
    expect(result.deferred).toBe(1);
  });

  it("uma falha não impede as outras", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const process = vi.fn(async (_admin: unknown, { id }: { id: string }) => {
      if (id === "a") throw new Error("falhou");
    });
    await readEditaisInBackground(fakeAdmin(), [target("a"), target("b")], {
      stopAt: Date.now() + 10_000,
      process,
    });
    expect(process).toHaveBeenCalledTimes(2);
  });

  it("evita duplicar leituras pedidas em paralelo", async () => {
    const process = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const options = { stopAt: Date.now() + 10_000, process };
    const [first, second] = await Promise.all([
      readEditaisInBackground(fakeAdmin(), [target("x")], options),
      readEditaisInBackground(fakeAdmin(), [target("x")], options),
    ]);
    expect(process).toHaveBeenCalledTimes(1);
    expect(first.skipped + second.skipped).toBe(1);
  });
});
