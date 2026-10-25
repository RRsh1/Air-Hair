"use client";

import { useEffect } from "react";

/** Centers an element horizontally once, e.g. today's frame in the film strip. */
export function ScrollIntoView({ targetId }: { targetId: string }) {
  useEffect(() => {
    document.getElementById(targetId)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" });
  }, [targetId]);
  return null;
}
