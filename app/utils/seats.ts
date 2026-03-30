/**
 * Seat position assignment and coordinate calculation for 2–8 player tables.
 * Positions are assigned clockwise from the dealer button.
 * Coordinates place seats around an elliptical table using polar math.
 */

const POSITION_MAPS: Record<number, string[]> = {
  2: ['D/SB', 'BB'],
  3: ['D/BTN', 'SB', 'BB'],
  4: ['D/BTN', 'SB', 'BB', 'UTG'],
  5: ['D', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'CO'],
}

/**
 * Returns an array indexed by seat number, where each value is the
 * position label for that seat given the dealer's seat index.
 */
export function assignPositions(playerCount: number, dealerSeat: number): string[] {
  const template = POSITION_MAPS[playerCount]
  if (!template) throw new Error(`Invalid player count: ${playerCount}`)

  const positions = new Array<string>(playerCount)
  for (let i = 0; i < playerCount; i++) {
    const seatIndex = (dealerSeat + i) % playerCount
    positions[seatIndex] = template[i]
  }
  return positions
}

/**
 * Returns the seat index for a given position label.
 */
export function findSeatByPosition(
  positions: string[],
  label: string,
): number {
  return positions.findIndex(p => p === label || p.includes(label))
}

/**
 * Calculates seat coordinates around an elliptical table.
 * Hero is always at seat 0 (bottom center).
 * Returns { x, y } percentages relative to the table container.
 */
export function getSeatCoordinates(
  seatIndex: number,
  totalSeats: number,
): { x: number; y: number } {
  // Start from bottom (π/2) and go clockwise (subtract angle for CW direction)
  const angle = (Math.PI / 2) - (seatIndex / totalSeats) * 2 * Math.PI
  const rx = 45 // horizontal radius (% of container)
  const ry = 38 // vertical radius (% of container)

  return {
    x: 50 - rx * Math.cos(angle),
    y: 50 + ry * Math.sin(angle),
  }
}
