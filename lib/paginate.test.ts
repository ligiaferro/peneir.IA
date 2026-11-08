import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "@/lib/paginate";

describe("fetchAllPages", () => {
  it("junta as páginas até receber uma incompleta", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [1, 2], error: null })
      .mockResolvedValueOnce({ data: [3, 4], error: null })
      .mockResolvedValueOnce({ data: [5], error: null });
    await expect(fetchAllPages(fetchPage, 2)).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage.mock.calls).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it("para na primeira página vazia", async () => {
    const fetchPage = vi.fn().mockResolvedValue({ data: [], error: null });
    await expect(fetchAllPages(fetchPage, 2)).resolves.toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("propaga o erro", async () => {
    const error = { message: "falhou" };
    const fetchPage = vi.fn().mockResolvedValue({ data: null, error });
    await expect(fetchAllPages(fetchPage, 2)).rejects.toBe(error);
  });
});
