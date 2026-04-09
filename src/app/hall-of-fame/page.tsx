import { getHallOfFameEntries } from "@/features/hall-of-fame/api/hallOfFameActions";
import { HallOfFameClient } from "./HallOfFameClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "명예의 전당 | Minions Bid",
  description: "미니언즈 리그 역대 우승팀 기록",
};

export default async function HallOfFamePage() {
  const entries = await getHallOfFameEntries();

  return <HallOfFameClient initialEntries={entries} />;
}
