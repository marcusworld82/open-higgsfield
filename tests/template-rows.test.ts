import { describe, expect, it } from "vitest";

import { cleanInsert, cleanPatch, recordToInsert, rowIdOf, rowToRecord, templateId } from "@/openhiggsfield/template-rows";
import type { RunRecord } from "@/openhiggsfield/history";

const rowId = "249325a3-de67-40e5-92ed-2f8eee415027";

describe("template rows", () => {
  it("maps ids both ways", () => {
    expect(rowIdOf(templateId(rowId))).toBe(rowId);
    expect(rowIdOf("run-123")).toBeNull();
    expect(rowIdOf("template-not-a-uuid")).toBeNull();
  });

  it("round-trips a record", () => {
    const record = {
      id: "run-1",
      name: "  My look  ",
      surface: "image",
      kind: "image",
      modelId: "soul-2",
      modelLabel: "Soul 2",
      prompt: "a lake at dawn",
      ratio: "1 / 1",
      meta: "1080p",
      urls: ["https://example.com/a.png"],
      status: "completed",
      art: "",
      createdAt: 0,
      favorite: true,
      settings: { quality: "high" },
      inputs: [{ role: "reference", url: "https://example.com/r.png" }],
    } as RunRecord;
    const insert = recordToInsert(record);
    expect(insert.name).toBe("My look");
    expect(insert.favorite).toBe(true);
    const back = rowToRecord({ ...insert, id: rowId, created_at: "2026-10-07T22:54:20Z" }, () => "art");
    expect(back.id).toBe(templateId(rowId));
    expect(back.prompt).toBe("a lake at dawn");
    expect(back.inputs).toEqual(record.inputs);
    expect(back.createdAt).toBe(Date.parse("2026-10-07T22:54:20Z"));
  });

  it("cleans patches", () => {
    expect(cleanPatch({ name: "  New  ", favorite: false })).toEqual({ name: "New", favorite: false });
    expect(cleanPatch({ name: "" })).toEqual({ name: null });
    expect(cleanPatch({ prompt: "p", user_id: "someone-else" })).toEqual({ prompt: "p" });
    expect(() => cleanPatch({})).toThrow();
    expect(() => cleanPatch({ favorite: "yes" })).toThrow();
    expect(() => cleanPatch(null)).toThrow();
  });

  it("cleans inserts and drops unknown fields", () => {
    const row = cleanInsert({
      surface: "video",
      model_id: "kling",
      user_id: "someone-else",
      inputs: [{ role: "start", url: "u" }, { role: "evil", url: "u" }],
      urls: ["a", 5],
    });
    expect(row).not.toHaveProperty("user_id");
    expect(row.inputs).toEqual([{ role: "start", url: "u" }]);
    expect(row.urls).toEqual(["a"]);
    expect(row.model_label).toBe("kling");
    expect(() => cleanInsert({ surface: "audio", model_id: "x" })).toThrow();
    expect(() => cleanInsert({ surface: "image" })).toThrow();
  });
});
