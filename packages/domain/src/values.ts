export type MinorUnit = number & { readonly __brand: "MinorUnit" };
export type Points = number & { readonly __brand: "Points" };

function requireSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value))
    throw new TypeError(`${name} must be a safe integer`);
  return value;
}

export function minorUnit(value: number): MinorUnit {
  return requireSafeInteger(value, "Minor unit") as MinorUnit;
}

export function points(value: number): Points {
  return requireSafeInteger(value, "Points") as Points;
}

export function addPoints(left: Points, right: Points): Points {
  return points(left + right);
}
