import type { Outfit } from "@family-display/contract";
export function chooseOutfit(tempMaxC: number, precipitationChance: number): Outfit {
  if (precipitationChance > 50) return "raincoat";
  if (tempMaxC > 20) return "tshirt";
  if (tempMaxC >= 14) return "long-sleeve";
  if (tempMaxC >= 8) return "hoodie";
  return "coat";
}
