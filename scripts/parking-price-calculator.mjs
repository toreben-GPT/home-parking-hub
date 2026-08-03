const MINUTES_PER_DAY = 24 * 60;

function assertInteger(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} は${minimum}以上${maximum}以下の整数で指定してください。`);
  }
}

function normalizedBand(band, index) {
  assertInteger(band.startMinute, `timeBands[${index}].startMinute`, { maximum: MINUTES_PER_DAY - 1 });
  assertInteger(band.endMinute, `timeBands[${index}].endMinute`, { maximum: MINUTES_PER_DAY - 1 });
  assertInteger(band.unitMinutes, `timeBands[${index}].unitMinutes`, { minimum: 1 });
  assertInteger(band.unitYen, `timeBands[${index}].unitYen`);
  if (band.maximumYen !== null && band.maximumYen !== undefined) {
    assertInteger(band.maximumYen, `timeBands[${index}].maximumYen`);
  }

  const duration = band.startMinute === band.endMinute
    ? MINUTES_PER_DAY
    : (band.endMinute - band.startMinute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return { ...band, maximumYen: band.maximumYen ?? null, duration };
}

function validateRules(rules) {
  if (!rules || !Array.isArray(rules.timeBands) || rules.timeBands.length === 0) {
    throw new Error("24時間料金の計算には、1件以上の時間帯ルールが必要です。");
  }
  if (rules.rolling24HourMaximumYen !== null && rules.rolling24HourMaximumYen !== undefined) {
    assertInteger(rules.rolling24HourMaximumYen, "rolling24HourMaximumYen");
  }

  const bands = rules.timeBands.map(normalizedBand);
  for (let minute = 0; minute < MINUTES_PER_DAY; minute += 1) {
    const matches = bands.filter((band) => {
      const elapsed = (minute - band.startMinute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
      return elapsed < band.duration;
    });
    if (matches.length !== 1) {
      throw new Error(`時刻${formatMinute(minute)}を覆う時間帯ルールは1件である必要があります（現在${matches.length}件）。`);
    }
  }
  return bands;
}

function costForStartMinute(startMinute, bands, rolling24HourMaximumYen) {
  const occupiedMinutes = new Map();
  for (let offset = 0; offset < MINUTES_PER_DAY; offset += 1) {
    const absoluteMinute = startMinute + offset;
    const bandIndex = bands.findIndex((band) => {
      const localMinute = ((absoluteMinute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
      const elapsed = (localMinute - band.startMinute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
      return elapsed < band.duration;
    });
    const band = bands[bandIndex];
    const occurrence = Math.floor((absoluteMinute - band.startMinute) / MINUTES_PER_DAY);
    const key = `${bandIndex}:${occurrence}`;
    occupiedMinutes.set(key, (occupiedMinutes.get(key) ?? 0) + 1);
  }

  let total = 0;
  for (const [key, minutes] of occupiedMinutes) {
    const bandIndex = Number(key.split(":", 1)[0]);
    const band = bands[bandIndex];
    const normalCharge = Math.ceil(minutes / band.unitMinutes) * band.unitYen;
    total += band.maximumYen === null ? normalCharge : Math.min(normalCharge, band.maximumYen);
  }
  return rolling24HourMaximumYen === null
    ? total
    : Math.min(total, rolling24HourMaximumYen);
}

export function formatMinute(minute) {
  const normalized = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

/**
 * Evaluates every possible minute of entry and returns the lowest charge for
 * exactly 24 hours. Fixed time-band maxima are applied independently to each
 * occurrence of that band; an entry-based 24-hour maximum caps the total.
 */
export function calculateCheapest24HourPrice(rules) {
  const bands = validateRules(rules);
  const rollingMaximum = rules.rolling24HourMaximumYen ?? null;
  let amountYen = Number.POSITIVE_INFINITY;
  const cheapestEntryMinutes = [];

  for (let startMinute = 0; startMinute < MINUTES_PER_DAY; startMinute += 1) {
    const candidate = costForStartMinute(startMinute, bands, rollingMaximum);
    if (candidate < amountYen) {
      amountYen = candidate;
      cheapestEntryMinutes.length = 0;
      cheapestEntryMinutes.push(startMinute);
    } else if (candidate === amountYen) {
      cheapestEntryMinutes.push(startMinute);
    }
  }

  return {
    amountYen,
    cheapestEntryMinutes,
    exampleEntryTime: formatMinute(cheapestEntryMinutes[0]),
  };
}

export function applyCalculated24HourPrices(input, rulesByDayType) {
  const weekday = calculateCheapest24HourPrice(rulesByDayType.weekday);
  const holiday = calculateCheapest24HourPrice(rulesByDayType.holiday);
  return {
    ...input,
    pricing: {
      ...input.pricing,
      patternPrices: {
        ...input.pricing.patternPrices,
        "W-24": { amountYen: weekday.amountYen, needsConfirmation: false },
        "H-24": { amountYen: holiday.amountYen, needsConfirmation: false },
      },
    },
  };
}
