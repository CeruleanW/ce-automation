const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TUESDAY = 2;
const SUNDAY = 0;

/** Return the Drive folder name for the term containing `now`. */
export function currentTermFolderName(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month <= 3) return `${year} 01-03 (Winter)`;
  if (month <= 6) return `${year} 04-06 (Spring)`;
  if (month <= 8) return `${year} 07-08 (Summer)`;
  return `${year} 09-11 (Fall)`;
}

/** Return the Drive folder name for the next term after `now`. */
export function nextTermFolderName(now: Date = new Date()): string {
  let year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month <= 3) return `${year} 04-06 (Spring)`;
  if (month <= 6) return `${year} 07-08 (Summer)`;
  if (month <= 8) return `${year} 09-11 (Fall)`;
  year += 1;
  return `${year} 01-03 (Winter)`;
}

function rollForwardTo(targetDay: number, date: Date): Date {
  const day = date.getUTCDay();
  let delta = targetDay - day;
  if (delta < 0) {
    delta += 7;
  }
  return new Date(date.getTime() + delta * MS_PER_DAY);
}

export function emailSendDeadline(courseStart: Date): Date {
  // Tuesday on or after (courseStart - 14d).
  const base = new Date(courseStart.getTime() - 14 * MS_PER_DAY);
  return rollForwardTo(TUESDAY, base);
}

export function promotionDay(courseStart: Date): Date {
  // Sunday on or after (courseStart - 14d).
  const base = new Date(courseStart.getTime() - 14 * MS_PER_DAY);
  return rollForwardTo(SUNDAY, base);
}
