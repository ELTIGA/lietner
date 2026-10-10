const MS_PER_DAY = 86_400_000;

/**
 * Local calendar day as an integer. Uses the local Y/M/D projected onto UTC so
 * DST shifts and time zones never move a card by a day.
 */
export function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

export function dayToDate(day: number): Date {
  const utc = new Date(day * MS_PER_DAY);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

let dayOffset = 0;

/** Dev-only clock shift, e.g. `?today=+3`. */
export function setDayOffset(offset: number): void {
  dayOffset = offset;
}

export function today(): number {
  return dayNumber(new Date()) + dayOffset;
}
