const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TUESDAY = 2;
const SUNDAY = 0;

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
