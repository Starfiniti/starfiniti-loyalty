export const MERCHANT_TIME_ZONE = "Europe/Ljubljana";

type LocalDateTimeParts = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}>;

function zoneOffsetMinutes(instant: number): number | null {
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone: MERCHANT_TIME_ZONE,
    timeZoneName: "longOffset",
    hour: "2-digit",
  })
    .formatToParts(new Date(instant))
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/u.exec(zone ?? "");
  if (!match) return null;
  const magnitude = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -magnitude : magnitude;
}

function partsInMerchantZone(instant: number): LocalDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MERCHANT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function sameLocalDateTime(
  left: LocalDateTimeParts,
  right: LocalDateTimeParts,
) {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

export function parseMerchantLocalDateTime(input: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(input);
  if (!match) return null;
  const requested: LocalDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const wallClockAsUtc = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute,
  );
  const offsets = new Set(
    [-86_400_000, 0, 86_400_000]
      .map((delta) => zoneOffsetMinutes(wallClockAsUtc + delta))
      .filter((offset): offset is number => offset !== null),
  );
  const candidates = [...offsets]
    .map((offset) => wallClockAsUtc - offset * 60_000)
    .filter((instant) =>
      sameLocalDateTime(partsInMerchantZone(instant), requested),
    );
  return candidates.length === 1 ? new Date(candidates[0]!) : null;
}
