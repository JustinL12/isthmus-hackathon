import { animate, type AnimationPlaybackControls } from "framer-motion";

// Gentle page scrolling for the decision screen. The browser's `behavior: "smooth"`
// is short and abrupt; this eases in and out, takes longer for longer distances,
// and hands control back the moment the person scrolls, touches or presses a key.

let running: AnimationPlaybackControls | null = null;
const TAKEOVER = ["wheel", "touchstart", "keydown"] as const;

export function smoothScrollTo(top: number) {
  running?.stop();
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const target = Math.max(0, Math.min(top, max));
  const distance = Math.abs(target - window.scrollY);
  if (distance < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo(0, target);
    return;
  }

  const stop = () => running?.stop();
  const release = () => TAKEOVER.forEach((type) => window.removeEventListener(type, stop));
  TAKEOVER.forEach((type) => window.addEventListener(type, stop, { passive: true }));

  running = animate(window.scrollY, target, {
    duration: Math.min(1.6, Math.max(0.9, distance / 700)),
    ease: [0.65, 0, 0.35, 1],
    onUpdate: (y) => window.scrollTo(0, y),
    onComplete: release,
    onStop: release,
  });
}
