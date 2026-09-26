"use client";

import {
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { createContext, type ReactNode, useContext, useRef } from "react";
import { cn } from "@/lib/utils";

// Magnetic hover from components/ui/magnetic-dock.tsx, adapted for text cards: the
// dock resizes icon-only squares by horizontal distance; cards keep their size and
// scale/lift by 2D distance, so it also works when they stack on narrow screens.
// Mouse-driven only (no effect on touch), and off with prefers-reduced-motion.

const SPRING = { damping: 20, stiffness: 300, mass: 0.5 }; // same feel as the dock

const PointerContext = createContext<{ x: MotionValue<number>; y: MotionValue<number> } | null>(null);

export function MagneticCards({ children, className }: { children: ReactNode; className?: string }) {
  const x = useMotionValue(Infinity);
  const y = useMotionValue(Infinity);
  const reducedMotion = useReducedMotion() ?? false;
  return (
    <PointerContext.Provider value={{ x, y }}>
      <div
        className={className}
        onMouseMove={
          reducedMotion
            ? undefined
            : (event) => {
                x.set(event.clientX);
                y.set(event.clientY);
              }
        }
        onMouseLeave={() => {
          x.set(Infinity);
          y.set(Infinity);
        }}
      >
        {children}
      </div>
    </PointerContext.Provider>
  );
}

export function MagneticCard({
  children,
  className,
  maxScale = 1.06,
  reach = 280,
  lift = 10,
}: {
  children: ReactNode;
  className?: string;
  /** Scale when the pointer is at the card's center. */
  maxScale?: number;
  /** Distance in px at which the pull fades out. */
  reach?: number;
  /** How far (px) the card floats up at full pull. */
  lift?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pointer = useContext(PointerContext);
  if (!pointer) throw new Error("MagneticCard must be inside MagneticCards");

  const distance = useTransform([pointer.x, pointer.y], ([px, py]: number[]) => {
    const card = ref.current?.getBoundingClientRect();
    if (!card || !Number.isFinite(px)) return reach;
    return Math.hypot(px - (card.left + card.width / 2), py - (card.top + card.height / 2));
  });
  const scale = useSpring(useTransform(distance, [0, reach], [maxScale, 1]), SPRING);
  const y = useTransform(scale, (s) => ((s - 1) / (maxScale - 1)) * -lift);

  return (
    <motion.div ref={ref} style={{ scale, y }} className={cn("will-change-transform", className)}>
      {children}
    </motion.div>
  );
}
