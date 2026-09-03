/**
 * Gate for the "bot is thinking" insight pill. The pill prints the acting
 * bot's Chen score, made hand and draws — hidden information while the hero
 * is still in the hand. It may be shown once the hero has folded, or at any
 * time when the player has explicitly switched study mode on (a study aid
 * that knowingly reveals hidden cards).
 */
export function canRevealBotThinking(o: { heroFolded: boolean; studyMode: boolean }): boolean {
  return o.heroFolded || o.studyMode
}
