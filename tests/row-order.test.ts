import { describe, expect, it } from "vitest";
import { moveId, sortByOrder } from "@/components/useRowVisibility";

const people = ["a", "b", "c", "d"].map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((person) => person.id);

describe("班表人員拖動排序", () => {
  it("沒排過照原本順序；排過的在前、其他照原本順序接在後面", () => {
    expect(ids(sortByOrder(people, []))).toEqual(["a", "b", "c", "d"]);
    expect(ids(sortByOrder(people, ["c", "a"]))).toEqual(["c", "a", "b", "d"]);
    // 其他組的 ID 不影響這一組。
    expect(ids(sortByOrder(people, ["x", "d"]))).toEqual(["d", "a", "b", "c"]);
  });

  it("移到目標的前面或後面", () => {
    expect(moveId(["a", "b", "c", "d"], "d", "b", false)).toEqual(["a", "d", "b", "c"]);
    expect(moveId(["a", "b", "c", "d"], "a", "c", true)).toEqual(["b", "c", "a", "d"]);
    expect(moveId(["a", "b", "c", "d"], "b", "b", true)).toEqual(["a", "b", "c", "d"]);
    // 不同組（不在清單裡）不動。
    expect(moveId(["a", "b"], "x", "a", false)).toEqual(["a", "b"]);
  });
});
