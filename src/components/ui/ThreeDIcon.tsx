// 3dicons.co 기반 포인트 아이콘을 렌더링하는 이미지 컴포넌트
import Image from "next/image";
import { cn } from "@/lib/utils";

export type ThreeDIconName = "trophy" | "medal" | "crown" | "cube" | "shield";

interface ThreeDIconProps {
  name: ThreeDIconName;
  alt: string;
  size?: number;
  className?: string;
  priority?: boolean;
}

const THREE_D_ICON_SRC: Record<ThreeDIconName, string> = {
  trophy: "/icons/3d/trophy-front-color.png",
  medal: "/icons/3d/medal-front-color.png",
  crown: "/icons/3d/crown-front-color.png",
  cube: "/icons/3d/cube-front-color.png",
  shield: "/icons/3d/shield-front-color.png",
};

export function ThreeDIcon({
  name,
  alt,
  size = 40,
  className,
  priority = false,
}: ThreeDIconProps) {
  return (
    <Image
      src={THREE_D_ICON_SRC[name]}
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      className={cn("inline-block h-auto w-auto shrink-0 object-contain", className)}
    />
  );
}
