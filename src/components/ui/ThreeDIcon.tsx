// 3D 포인트 아이콘을 렌더링하는 이미지 컴포넌트
import Image from "next/image";
import { cn } from "@/lib/utils";

export type ThreeDIconName =
  | "trophy"
  | "medal"
  | "crown"
  | "cube"
  | "shield"
  | "door"
  | "link"
  | "checkMarkButton"
  | "moneyBag"
  | "calendar"
  | "hallOfFame"
  | "cardFileBox"
  | "fileFolder"
  | "openFileFolder";

interface ThreeDIconProps {
  name: ThreeDIconName;
  alt: string;
  size?: number;
  className?: string;
  priority?: boolean;
}

const THREE_D_ICON_SRC: Record<ThreeDIconName, string> = {
  trophy: "/icons/3d/trophy_3d.png",
  medal: "/icons/3d/medal-front-color.png",
  crown: "/icons/3d/crown_3d.png",
  cube: "/icons/3d/cube-front-color.png",
  shield: "/icons/3d/shield-front-color.png",
  door: "/icons/3d/door_3d.png",
  link: "/icons/3d/link_3d.png",
  checkMarkButton: "/icons/3d/check_mark_button_3d.png",
  moneyBag: "/icons/3d/money_bag_3d.png",
  calendar: "/icons/3d/tear-off_calendar_3d.png",
  hallOfFame: "/icons/3d/trophy_3d.png",
  cardFileBox: "/icons/3d/card_file_box_3d.png",
  fileFolder: "/icons/3d/file_folder_3d.png",
  openFileFolder: "/icons/3d/open_file_folder_3d.png",
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
      className={cn(
        "inline-block h-auto w-auto shrink-0 object-contain",
        className,
      )}
    />
  );
}
