"use client";

import gsap from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Character flip from components/ui/flipping-word-swap.tsx, adapted for headings:
// that component swaps two words on hover; this one flips whenever `text` changes
// and wraps at word boundaries, so full sentences fit on narrow screens.

const segmenter =
  typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
const characters = (word: string) =>
  segmenter ? Array.from(segmenter.segment(word), ({ segment }) => segment) : Array.from(word);

export function FlipText({
  text,
  className,
  duration = 450,
}: {
  text: string;
  className?: string;
  /** Duration of each character flip in milliseconds. */
  duration?: number;
}) {
  const container = useRef<HTMLSpanElement>(null);
  const [layers, setLayers] = useState<{ current: string; previous: string | null }>({
    current: text,
    previous: null,
  });

  // New text: keep the old one on screen to flip out while the new one flips in.
  if (text !== layers.current) setLayers({ current: text, previous: layers.current });

  useLayoutEffect(() => {
    if (layers.previous == null) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = gsap.context(() => {
      const outgoing = gsap.utils.toArray<HTMLElement>('[data-flip="previous"]');
      const incoming = gsap.utils.toArray<HTMLElement>('[data-flip="current"]');
      const each = reduceMotion ? 0 : duration / 1000;
      // Same feel as the swap component, but capped so long sentences still finish in ~1.5s.
      const stagger = reduceMotion ? 0 : Math.min(0.044, 0.9 / Math.max(incoming.length, 1));

      gsap.set(incoming, { rotationX: -82, opacity: 0, transformOrigin: "center bottom" });
      gsap
        .timeline({ onComplete: () => setLayers((l) => ({ ...l, previous: null })) })
        .to(outgoing, {
          rotationX: 82,
          opacity: 0,
          duration: each,
          stagger,
          ease: "power2.in",
          transformOrigin: "center top",
        })
        .to(incoming, { rotationX: 0, opacity: 1, duration: each, stagger, ease: "power2.out" }, `<${each * 0.62}`);
    }, container);
    return () => context.revert();
  }, [layers, duration]);

  const renderLayer = (value: string, layer: "current" | "previous") => (
    <span aria-hidden className="col-start-1 row-start-1 [perspective:800px]">
      {value.split(" ").map((word, w) => (
        <span key={`${layer}-${w}`}>
          {w > 0 && " "}
          <span className="inline-block whitespace-nowrap">
            {characters(word).map((character, c) => (
              <span
                key={c}
                data-flip={layer}
                className="inline-block [backface-visibility:hidden] [will-change:transform,opacity]"
              >
                {character}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );

  return (
    <span ref={container} className={cn("grid", className)}>
      <span className="sr-only">{layers.current}</span>
      {layers.previous != null && renderLayer(layers.previous, "previous")}
      {renderLayer(layers.current, "current")}
    </span>
  );
}
