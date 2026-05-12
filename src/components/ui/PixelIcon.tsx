"use client";

import React from "react";
import { motion, Variants, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CyberIcon } from "@/components/ui/CyberIcons";

export type IconAnimation = "idle" | "urgent" | "success" | "active";

interface PixelIconProps {
  /** SVG icon component */
  icon: CyberIcon;
  /** Size in pixels (default: 24) */
  size?: number;
  /** Tailwind color class or HEX (default: currentColor) */
  color?: string;
  /** Stroke width for pixel effect (default: 3) */
  strokeWidth?: number;
  /** Animation state */
  animation?: IconAnimation;
  /** Additional styling classes */
  className?: string;
  /** Accessibility label. If provided, role="img" is used. If not, aria-hidden="true" is used. */
  label?: string;
  /** If true, ensures a minimum touch target size of 44px (default: false) */
  isInteractive?: boolean;
}

const animationVariants: Variants = {
  idle: {
    x: 0,
    y: 0,
    scale: 1,
    opacity: 1,
  },
  urgent: {
    x: [-2, 2, -2, 2, 0],
    transition: {
      duration: 0.4,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
  success: {
    scale: [1, 1.25, 1],
    transition: {
      duration: 0.5,
      ease: "backOut",
    },
  },
  active: {
    opacity: [1, 0.5, 1],
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: "linear",
    },
  },
};

const reducedAnimationVariants: Variants = {
  idle: {
    x: 0,
    y: 0,
    scale: 1,
    opacity: 1,
  },
  urgent: {
    opacity: [1, 0.72, 1],
    transition: {
      duration: 1.4,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
  success: {
    scale: [1, 1.08, 1],
    transition: {
      duration: 0.3,
      ease: "easeOut",
    },
  },
  active: {
    opacity: [1, 0.82, 1],
    transition: {
      duration: 2.2,
      repeat: Infinity,
      ease: "linear",
    },
  },
};

/**
 * PixelIcon - A standardized icon component for the Cyber-Pixel theme.
 * Uses SVG icons with custom pixel-art styling and Framer Motion animations.
 */
export function PixelIcon({
  icon: Icon,
  size = 24,
  color = "currentColor",
  strokeWidth = 3,
  animation = "idle",
  className,
  label,
  isInteractive = false,
}: PixelIconProps) {
  const shouldReduceMotion = useReducedMotion();
  const isDecorative = !label;
  const variants = shouldReduceMotion
    ? reducedAnimationVariants
    : animationVariants;

  return (
    <motion.div
      className={cn(
        "inline-flex items-center justify-center align-middle transition-all",
        isInteractive && "min-w-[44px] min-h-[44px]",
        className
      )}
      variants={variants}
      animate={animation}
      initial="idle"
      role={isDecorative ? undefined : "img"}
      aria-label={label}
      aria-hidden={isDecorative ? "true" : undefined}
      style={{ width: isInteractive ? undefined : size, height: isInteractive ? undefined : size }}
    >
      <Icon
        size={size}
        className={cn(color)}
        strokeWidth={strokeWidth}
        style={{
          shapeRendering: "crispEdges",
        }}
      />
      {/* Fallback for Screen Readers if icon fails to render or for pure semantic completeness */}
      {label && <span className="sr-only">{label}</span>}
    </motion.div>
  );
}
