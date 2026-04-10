import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Minions Bid",
    short_name: "Minions Bid",
    description: "미니언즈(소모임) 전용 실시간 경매 드래프트 플랫폼",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f4f2",
    theme_color: "#FDE047",
    lang: "ko-KR",
    categories: ["sports", "games", "productivity"],
    icons: [
      {
        src: "/favicon.png",
        sizes: "874x900",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/favicon.png",
        sizes: "874x900",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "명예의 전당",
        short_name: "명예의 전당",
        url: "/hall-of-fame",
        icons: [{ src: "/favicon.png", sizes: "874x900", type: "image/png" }],
      },
      {
        name: "리그 일정",
        short_name: "리그 일정",
        url: "/league-schedule",
        icons: [{ src: "/favicon.png", sizes: "874x900", type: "image/png" }],
      },
    ],
  };
}
