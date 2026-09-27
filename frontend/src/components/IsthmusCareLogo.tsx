// Isthmus Care logo: paw-print Capitol dome on the isthmus, in a ring badge.
// Usage: <IsthmusCareLogo size={48} />  or  <IsthmusCareLogo size={24} variant="icon" />
import * as React from "react";

type Props = {
  size?: number;
  /** "full" has the lake wave; "icon" is bolder for small sizes (under ~40px). */
  variant?: "full" | "icon";
  color?: string;       // ring + art
  background?: string;  // inside the ring
  title?: string;
  className?: string;
};

export const BRAND_RED = "#B83A2E";
export const BRAND_CREAM = "#FBF5EC";

export function IsthmusCareLogo({
  size = 48,
  variant = "full",
  color = BRAND_RED,
  background = BRAND_CREAM,
  title = "Isthmus Care",
  className,
}: Props) {
  const icon = variant === "icon";
  const outerToe = icon ? { rx: 8.5, ry: 11 } : { rx: 7.5, ry: 10 };
  const innerToe = icon ? { rx: 9.5, ry: 12 } : { rx: 8.5, ry: 11 };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 160 160"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      <circle cx="80" cy="80" r="72" fill={background} stroke={color} strokeWidth={icon ? 10 : 7} />
      <g fill={color}>
        <path d="M54 84 A26 26 0 0 1 106 84 L106 91 A11 11 0 0 1 95 102 L65 102 A11 11 0 0 1 54 91 Z" />
        <ellipse cx="43.6" cy="63" {...outerToe} transform="rotate(-36 43.6 63)" />
        <ellipse cx="65.6" cy="44.5" {...innerToe} transform="rotate(-12 65.6 44.5)" />
        <ellipse cx="94.4" cy="44.5" {...innerToe} transform="rotate(12 94.4 44.5)" />
        <ellipse cx="116.4" cy="63" {...outerToe} transform="rotate(36 116.4 63)" />
        <rect x="30" y="108" width="100" height={icon ? 10 : 8} rx={icon ? 5 : 4} />
      </g>
      {!icon && (
        <path
          d="M50 128 q7.5 -6 15 0 t15 0 t15 0 t15 0"
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export default IsthmusCareLogo;
