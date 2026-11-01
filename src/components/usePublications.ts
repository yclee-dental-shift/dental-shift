"use client";

import { readPublications, savePublication, subscribePublications } from "@/data/publication-store";
import { emptyPublication, type MonthPublication } from "@/domain/rules/publication";
import { useSyncExternalStore } from "react";

const EMPTY: Record<string, MonthPublication> = {};

export function usePublications() {
  const publications = useSyncExternalStore(subscribePublications, readPublications, () => EMPTY);
  const publicationOf = (month: string) => publications[month] ?? emptyPublication(month);
  return { publications, publicationOf, savePublication };
}
