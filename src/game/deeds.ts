/** Camp loot: what razing a camp pays, by strength and round. */
import { CONFIG } from './config'

export function campLoot(strength: number, round: number) {
  const c = CONFIG.rewards.camp
  return { gold: c.base + c.perStrength * strength + c.perRound * round, resource: c.resPerStrength * strength }
}
