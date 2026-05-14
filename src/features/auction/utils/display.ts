export const getTierImage = (tier: string) => {
  const map: Record<string, string> = {
    챌린저: "Challenger",
    그랜드마스터: "Grandmaster",
    마스터: "Master",
    다이아: "Diamond",
    에메랄드: "Emerald",
    플레티넘: "Platinum",
    플래티넘: "Platinum",
    골드: "Gold",
    실버: "Silver",
    브론즈: "Bronze",
    아이언: "Iron",
    언랭: "Iron",
  };
  
  // Find the matching base tier by checking if the input tier contains any of the keys
  const baseTier = Object.keys(map).find(key => tier.includes(key)) || tier;
  const englishTier = map[baseTier] || baseTier;
  return `/Rank=${englishTier}.png`;
};

export const getExactTierImage = (tier: string) => {
  const map: Record<string, string> = {
    챌린저: "Challenger",
    그랜드마스터: "Grandmaster",
    마스터: "Master",
    다이아: "Diamond",
    에메랄드: "Emerald",
    플레티넘: "Platinum",
    플래티넘: "Platinum",
    골드: "Gold",
    실버: "Silver",
    브론즈: "Bronze",
    아이언: "Iron",
  };

  const englishTier = map[tier.trim()];
  return englishTier ? `/Rank=${englishTier}.png` : null;
};

export const getPositionImage = (pos: string) => {
  const normalized = pos.trim().toLowerCase();
  if (normalized.includes("탑") || normalized.includes("top"))
    return "/main_position_top.svg";
  if (
    normalized.includes("정글") ||
    normalized.includes("jg") ||
    normalized.includes("jungle")
  )
    return "/main_position_jg.svg";
  if (normalized.includes("미드") || normalized.includes("mid"))
    return "/main_position_mid.svg";
  if (
    normalized.includes("원딜") ||
    normalized.includes("bot") ||
    normalized.includes("ad") ||
    normalized.includes("adc")
  )
    return "/main_position_bot.webp";
  if (
    normalized.includes("서폿") ||
    normalized.includes("서포터") ||
    normalized.includes("sup")
  )
    return "/main_position_sup.svg";
  return "/main_position_top.svg"; // fallback
};
