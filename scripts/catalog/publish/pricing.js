'use strict';

const CURRENCY_INCREMENTS = Object.freeze({ USD: '0.1', JPY: '100', CNY: '0.1' });

function gcd(a, b) {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

function decimalFraction(value, label = 'value') {
  const raw = String(value).trim();
  const match = raw.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new TypeError(`${label} must be a plain decimal`);
  const scale = 10n ** BigInt((match[3] || '').length);
  const sign = match[1] === '-' ? -1n : 1n;
  const numerator = sign * BigInt(`${match[2]}${match[3] || ''}`);
  const divisor = gcd(numerator, scale);
  return { numerator: numerator / divisor, denominator: scale / divisor };
}

function ceilDiv(numerator, denominator) {
  if (numerator < 0n || denominator <= 0n) throw new RangeError('ceilDiv accepts non-negative values only');
  return (numerator + denominator - 1n) / denominator;
}

function formatFraction(numerator, denominator, decimals) {
  const scale = 10n ** BigInt(decimals);
  const scaled = numerator * scale / denominator;
  const whole = scaled / scale;
  if (!decimals) return whole.toString();
  return `${whole}.${(scaled % scale).toString().padStart(decimals, '0')}`;
}

function calculateCatalogPrice({ sourceAmount, fxRate = '1', currency, markupBps = 2000 }) {
  const normalizedCurrency = String(currency || '').toUpperCase();
  const incrementValue = CURRENCY_INCREMENTS[normalizedCurrency];
  if (!incrementValue) throw new RangeError(`Unsupported catalog currency: ${currency}`);
  if (!Number.isInteger(markupBps) || markupBps < 2000) throw new RangeError('markupBps must be an integer of at least 2000');

  const source = decimalFraction(sourceAmount, 'sourceAmount');
  const fx = decimalFraction(fxRate, 'fxRate');
  if (source.numerator <= 0n || fx.numerator <= 0n) throw new RangeError('sourceAmount and fxRate must be positive');

  const rawNumerator = source.numerator * fx.numerator * BigInt(10000 + markupBps);
  const rawDenominator = source.denominator * fx.denominator * 10000n;
  const increment = decimalFraction(incrementValue, 'rounding increment');
  const incrementCount = ceilDiv(
    rawNumerator * increment.denominator,
    rawDenominator * increment.numerator,
  );
  const finalNumerator = incrementCount * increment.numerator;
  const finalDenominator = increment.denominator;
  const decimals = normalizedCurrency === 'JPY' ? 0 : 2;

  return Object.freeze({
    currency: normalizedCurrency,
    markupBps,
    roundingIncrement: incrementValue,
    unroundedAmount: formatFraction(rawNumerator, rawDenominator, 6),
    catalogAmount: formatFraction(finalNumerator, finalDenominator, decimals),
  });
}

module.exports = { CURRENCY_INCREMENTS, calculateCatalogPrice };
