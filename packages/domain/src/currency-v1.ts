import type {
  CurrencyConversionAmountV1,
  CurrencyConversionContextV1,
} from "@starfiniti/contracts/currency";

const MAX_BIGINT = 9_223_372_036_854_775_807n;

function positiveInteger(value: string, label: string): bigint {
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new TypeError(`${label} must be a positive integer string`);
  }
  return BigInt(value);
}

function nonNegativeInteger(value: string, label: string): bigint {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new TypeError(`${label} must be a non-negative integer string`);
  }
  return BigInt(value);
}

function precisionFactor(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0 || value > 6) {
    throw new RangeError(`${label} must be between zero and six`);
  }
  return 10n ** BigInt(value);
}

export function convertCurrencyMinorAmountV1(
  input: Readonly<{
    amountKey: string;
    sourceAmountMinor: string;
    context: CurrencyConversionContextV1;
  }>,
): CurrencyConversionAmountV1 {
  const sourceAmount = nonNegativeInteger(
    input.sourceAmountMinor,
    "Source amount",
  );
  if (sourceAmount > MAX_BIGINT) {
    throw new RangeError("Source amount exceeds the supported bigint range");
  }
  const rateNumerator = positiveInteger(
    input.context.snapshot.rateNumerator,
    "Rate numerator",
  );
  const rateDenominator = positiveInteger(
    input.context.snapshot.rateDenominator,
    "Rate denominator",
  );
  const sourceFactor = precisionFactor(
    input.context.snapshot.sourceMinorUnitDigits,
    "Source minor-unit digits",
  );
  const baseFactor = precisionFactor(
    input.context.snapshot.baseMinorUnitDigits,
    "Base minor-unit digits",
  );
  const exactNumerator = sourceAmount * rateNumerator * baseFactor;
  const exactDenominator = rateDenominator * sourceFactor;
  const quotient = exactNumerator / exactDenominator;
  const remainder = exactNumerator % exactDenominator;
  const baseAmount =
    remainder * 2n >= exactDenominator ? quotient + 1n : quotient;
  if (baseAmount > MAX_BIGINT) {
    throw new RangeError("Converted amount exceeds the supported bigint range");
  }
  return {
    amountKey: input.amountKey,
    sourceAmountMinor: sourceAmount.toString(),
    baseAmountMinor: baseAmount.toString(),
    exactNumerator: exactNumerator.toString(),
    exactDenominator: exactDenominator.toString(),
    roundingDeltaNumerator: (
      baseAmount * exactDenominator -
      exactNumerator
    ).toString(),
  };
}

export function convertCurrencyMinorBatchV1(
  input: Readonly<{
    context: CurrencyConversionContextV1;
    amounts: readonly Readonly<{
      amountKey: string;
      sourceAmountMinor: string;
    }>[];
  }>,
): readonly CurrencyConversionAmountV1[] {
  const keys = new Set<string>();
  return input.amounts.map((amount) => {
    if (keys.has(amount.amountKey)) {
      throw new TypeError(
        `Duplicate conversion amount key: ${amount.amountKey}`,
      );
    }
    keys.add(amount.amountKey);
    return convertCurrencyMinorAmountV1({
      ...amount,
      context: input.context,
    });
  });
}
