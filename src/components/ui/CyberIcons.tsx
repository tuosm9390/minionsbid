// Cyber-Pixel UI에서 사용할 로컬 SVG 아이콘 세트
import React from "react";

export interface CyberIconProps extends Omit<
  React.SVGProps<SVGSVGElement>,
  "width" | "height"
> {
  size?: number;
  strokeWidth?: number;
}

export type CyberIcon = React.ComponentType<CyberIconProps>;

function defineIcon(body: React.ReactNode): CyberIcon {
  const Icon = ({
    size = 24,
    strokeWidth = 2,
    color = "currentColor",
    ...props
  }: CyberIconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      color={color}
      strokeWidth={strokeWidth}
      aria-hidden={props["aria-hidden"]}
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {body}
      </g>
    </svg>
  );

  Icon.displayName = "CyberIcon";
  return Icon;
}

export const Check = defineIcon(
  <>
    <path d="M5 12.5L10 17.5L19 6.5" />
  </>,
);

export const CheckSquare = defineIcon(
  <>
    <path d="M4 4H20V20H4V4Z" />
    <path d="M7 12.5L10.5 16L17 8" />
  </>,
);

export const X = defineIcon(
  <>
    <path d="M6 6L18 18" />
    <path d="M18 6L6 18" />
  </>,
);

export const AlertTriangle = defineIcon(
  <>
    <path d="M12 3L22 20H2L12 3Z" />
    <path d="M12 9V14" />
    <path d="M12 17H12.01" />
  </>,
);

export const Moon = defineIcon(
  <>
    <path d="M18 16.5C16.7 17.5 15 18 13.2 18C9.2 18 6 14.8 6 10.8C6 8.9 6.7 7.2 8 6C8.1 10.2 11.7 13.9 16 14C16.7 14 17.4 13.9 18 13.7V16.5Z" />
  </>,
);

export const Hourglass = defineIcon(
  <>
    <path d="M7 3H17" />
    <path d="M7 21H17" />
    <path d="M8 3V8L12 12L8 16V21" />
    <path d="M16 3V8L12 12L16 16V21" />
    <path d="M9 8H15" />
    <path d="M9 16H15" />
  </>,
);

export const Crown = defineIcon(
  <>
    <path d="M4 18H20" />
    <path d="M5 16L6 7L10 11L12 5L14 11L18 7L19 16H5Z" />
  </>,
);

export const MessageSquare = defineIcon(
  <>
    <path d="M4 5H20V16H9L5 20V16H4V5Z" />
    <path d="M8 9H16" />
    <path d="M8 12H14" />
  </>,
);

export const Settings = defineIcon(
  <>
    <path d="M12 8V3" />
    <path d="M12 21V16" />
    <path d="M8 12H3" />
    <path d="M21 12H16" />
    <path d="M5.5 5.5L8.5 8.5" />
    <path d="M15.5 15.5L18.5 18.5" />
    <path d="M18.5 5.5L15.5 8.5" />
    <path d="M8.5 15.5L5.5 18.5" />
    <path d="M9 9H15V15H9V9Z" />
  </>,
);

export const LogOut = defineIcon(
  <>
    <path d="M10 5H5V19H10" />
    <path d="M13 12H21" />
    <path d="M17 8L21 12L17 16" />
  </>,
);

export const HelpCircle = defineIcon(
  <>
    <path d="M12 21C17 21 21 17 21 12C21 7 17 3 12 3C7 3 3 7 3 12C3 17 7 21 12 21Z" />
    <path d="M9 9C9.5 7.7 10.5 7 12 7C13.8 7 15 8.1 15 9.7C15 12 12 12 12 15" />
    <path d="M12 18H12.01" />
  </>,
);

export const Link = defineIcon(
  <>
    <path d="M9 8H7C4.8 8 3 9.8 3 12C3 14.2 4.8 16 7 16H9" />
    <path d="M15 8H17C19.2 8 21 9.8 21 12C21 14.2 19.2 16 17 16H15" />
    <path d="M8 12H16" />
  </>,
);

export const Link2 = Link;

export const Timer = defineIcon(
  <>
    <path d="M9 3H15" />
    <path d="M12 3V6" />
    <path d="M12 21C16.4 21 20 17.4 20 13C20 8.6 16.4 5 12 5C7.6 5 4 8.6 4 13C4 17.4 7.6 21 12 21Z" />
    <path d="M12 9V13L15 15" />
  </>,
);

export const Clock3 = Timer;

export const Trophy = defineIcon(
  <>
    <path d="M8 4H16V10C16 13 14 15 12 15C10 15 8 13 8 10V4Z" />
    <path d="M8 6H4V8C4 10.2 5.8 12 8 12" />
    <path d="M16 6H20V8C20 10.2 18.2 12 16 12" />
    <path d="M12 15V19" />
    <path d="M8 21H16" />
    <path d="M9 19H15" />
  </>,
);

export const Plus = defineIcon(
  <>
    <path d="M12 5V19" />
    <path d="M5 12H19" />
  </>,
);

export const PlusSquare = defineIcon(
  <>
    <path d="M4 4H20V20H4V4Z" />
    <path d="M12 8V16" />
    <path d="M8 12H16" />
  </>,
);

export const Gavel = defineIcon(
  <>
    <path d="M5 20H14" />
    <path d="M12 18L20 10" />
    <path d="M14 5L19 10" />
    <path d="M8 11L13 16" />
    <path d="M9 4L20 15" />
  </>,
);

export const Medal = defineIcon(
  <>
    <path d="M8 3L12 9L16 3" />
    <path d="M12 21C15.3 21 18 18.3 18 15C18 11.7 15.3 9 12 9C8.7 9 6 11.7 6 15C6 18.3 8.7 21 12 21Z" />
    <path d="M12 12L13 14H15L13.5 15.5L14 18L12 16.7L10 18L10.5 15.5L9 14H11L12 12Z" />
  </>,
);

export const RefreshCw = defineIcon(
  <>
    <path d="M20 7V13H14" />
    <path d="M4 17V11H10" />
    <path d="M19 13C18.4 16.4 15.5 19 12 19C9.9 19 8 18.1 6.7 16.7L4 14" />
    <path d="M5 11C5.6 7.6 8.5 5 12 5C14.1 5 16 5.9 17.3 7.3L20 10" />
  </>,
);

export const RefreshCcw = RefreshCw;
export const RotateCcw = RefreshCw;

export const Users = defineIcon(
  <>
    <path d="M9 11C10.7 11 12 9.7 12 8C12 6.3 10.7 5 9 5C7.3 5 6 6.3 6 8C6 9.7 7.3 11 9 11Z" />
    <path d="M15.5 10C16.9 10 18 8.9 18 7.5C18 6.1 16.9 5 15.5 5" />
    <path d="M3 19C3.7 15.8 5.8 14 9 14C12.2 14 14.3 15.8 15 19H3Z" />
    <path d="M14.5 14.5C17.2 14.7 19 16.2 20 19" />
  </>,
);

export const Upload = defineIcon(
  <>
    <path d="M12 16V4" />
    <path d="M7 9L12 4L17 9" />
    <path d="M5 16V20H19V16" />
  </>,
);

export const ArrowRight = defineIcon(
  <>
    <path d="M4 12H20" />
    <path d="M14 6L20 12L14 18" />
  </>,
);

export const ExternalLink = ArrowRight;

export const CalendarDays = defineIcon(
  <>
    <path d="M4 5H20V21H4V5Z" />
    <path d="M8 3V7" />
    <path d="M16 3V7" />
    <path d="M4 10H20" />
    <path d="M8 14H8.01" />
    <path d="M12 14H12.01" />
    <path d="M16 14H16.01" />
    <path d="M8 18H8.01" />
    <path d="M12 18H12.01" />
  </>,
);

export const Flag = defineIcon(
  <>
    <path d="M6 21V4" />
    <path d="M6 4H18L16 9L18 14H6" />
  </>,
);

export const Trash2 = defineIcon(
  <>
    <path d="M4 7H20" />
    <path d="M9 7V4H15V7" />
    <path d="M7 7L8 21H16L17 7" />
    <path d="M10 11V17" />
    <path d="M14 11V17" />
  </>,
);

export const BarChart3 = defineIcon(
  <>
    <path d="M5 20V11" />
    <path d="M12 20V5" />
    <path d="M19 20V14" />
    <path d="M3 20H21" />
  </>,
);

export const Swords = defineIcon(
  <>
    <path d="M4 20L20 4" />
    <path d="M14 4H20V10" />
    <path d="M20 20L4 4" />
    <path d="M4 4H10" />
    <path d="M4 4V10" />
  </>,
);

export const Lock = defineIcon(
  <>
    <path d="M6 10H18V21H6V10Z" />
    <path d="M8 10V7C8 4.8 9.8 3 12 3C14.2 3 16 4.8 16 7V10" />
    <path d="M12 14V17" />
  </>,
);

export const LockOpen = defineIcon(
  <>
    <path d="M6 10H18V21H6V10Z" />
    <path d="M8 10V7C8 4.8 9.8 3 12 3C13.7 3 15.1 4 15.7 5.5" />
    <path d="M12 14V17" />
  </>,
);

export const Save = defineIcon(
  <>
    <path d="M5 4H17L20 7V20H4V4H5Z" />
    <path d="M8 4V10H16V4" />
    <path d="M8 20V15H16V20" />
  </>,
);

export const Shield = defineIcon(
  <>
    <path d="M12 3L20 6V11C20 16 16.8 19.5 12 21C7.2 19.5 4 16 4 11V6L12 3Z" />
  </>,
);

export const ChevronLeft = defineIcon(
  <>
    <path d="M15 6L9 12L15 18" />
  </>,
);

export const ChevronRight = defineIcon(
  <>
    <path d="M9 6L15 12L9 18" />
  </>,
);

export const Copy = defineIcon(
  <>
    <path d="M8 8H20V20H8V8Z" />
    <path d="M4 16V4H16" />
  </>,
);
