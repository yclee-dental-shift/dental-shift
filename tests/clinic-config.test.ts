import { describe, expect, it } from "vitest";
import { chairs } from "@/config/clinic.config";

function labelsAt(floor: number, building: "前棟" | "後棟"): string[] {
  return chairs
    .filter((chair) => chair.floor === floor && chair.building === building)
    .map((chair) => chair.label);
}

describe("chair layout", () => {
  it("has nine chairs with unique ids and labels", () => {
    expect(chairs).toHaveLength(9);
    expect(new Set(chairs.map((chair) => chair.id)).size).toBe(9);
    expect(chairs.map((chair) => chair.label)).toEqual([
      "1診", "2診", "3診", "4診", "5診", "6診", "7診", "8診", "9診",
    ]);
  });

  it("places chairs on the expected floor and building", () => {
    expect(labelsAt(1, "前棟")).toEqual(["1診", "2診", "3診"]);
    expect(labelsAt(2, "前棟")).toEqual(["4診", "5診", "6診", "7診"]);
    expect(labelsAt(2, "後棟")).toEqual(["8診", "9診"]);
    expect(labelsAt(1, "後棟")).toEqual([]);
  });
});
