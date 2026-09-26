"use client";

import type { ReactNode } from "react";
import { ChromaticImage } from "@/components/ui/chromatic-image";
import { cn } from "@/lib/utils";

// Textured fills for the WebGL hover effect (public/textures).
const TEXTURES = {
  badger: { src: "/textures/badger.svg", bg: "#c5050c" },
  pine: { src: "/textures/pine.svg", bg: "#1d5c4f" },
} as const;

/**
 * Button face with the chromatic hover effect: the textured background tilts and
 * splits into color fringes under the pointer; the label stays crisp on top.
 * Put it inside a <button> or <Link> — this is only the visual.
 */
export function ChromaticLabel({
  children,
  texture = "badger",
  className,
}: {
  children: ReactNode;
  texture?: keyof typeof TEXTURES;
  className?: string;
}) {
  const t = TEXTURES[texture];
  return (
    <ChromaticImage
      src={t.src}
      alt=""
      backgroundColor={t.bg}
      zoom={0.12}
      displacement={0.07}
      chromaticShift={0.018}
      tilt={0.15}
      className={cn(
        "flex items-center justify-center rounded-xl px-5 py-3 font-semibold text-white",
        className,
      )}
    >
      <span className="relative z-10 [text-shadow:0_1px_2px_rgb(0_0_0/0.3)]">{children}</span>
    </ChromaticImage>
  );
}
