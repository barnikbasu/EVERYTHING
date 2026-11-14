import jsQR from 'jsqr';
import { fileToCanvas } from '../utils/mediaUtils';

export function calculateEmi(principal: number, annualRatePct: number, tenureMonths: number) {
  if (principal <= 0 || tenureMonths <= 0) {
    return { emi: 0, totalPayment: 0, totalInterest: 0 };
  }
  const r = annualRatePct / 12 / 100;
  if (r === 0) {
    const emi = principal / tenureMonths;
    return { emi, totalPayment: principal, totalInterest: 0 };
  }
  const factor = Math.pow(1 + r, tenureMonths);
  const emi = (principal * r * factor) / (factor - 1);
  const totalPayment = emi * tenureMonths;
  const totalInterest = totalPayment - principal;
  return { emi, totalPayment, totalInterest };
}

export function calculateGst(amount: number, ratePct: number, mode: 'exclusive' | 'inclusive') {
  if (mode === 'exclusive') {
    const tax = amount * (ratePct / 100);
    return { baseAmount: amount, gstAmount: tax, totalAmount: amount + tax };
  }
  const base = amount / (1 + ratePct / 100);
  const tax = amount - base;
  return { baseAmount: base, gstAmount: tax, totalAmount: amount };
}

export function calculateDateDiff(dateA: string, dateB: string) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return null;
  }
  const start = a <= b ? a : b;
  const end = a <= b ? b : a;
  const diffMs = end.getTime() - start.getTime();
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { years, months, days, totalDays, totalWeeks: Math.floor(totalDays / 7), totalHours: totalDays * 24 };
}

export type UnitCategory = 'length' | 'mass' | 'data' | 'temperature' | 'speed';

const UNIT_FACTORS: Record<Exclude<UnitCategory, 'temperature'>, Record<string, number>> = {
  length: {
    m: 1,
    km: 1000,
    cm: 0.01,
    mm: 0.001,
    mi: 1609.344,
    ft: 0.3048,
    in: 0.0254,
  },
  mass: {
    kg: 1,
    g: 0.001,
    mg: 0.000001,
    lb: 0.45359237,
    oz: 0.0283495231,
  },
  data: {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  },
  speed: {
    'm/s': 1,
    'km/h': 1 / 3.6,
    mph: 0.44704,
    knots: 0.514444,
  },
};

export const UNIT_OPTIONS: Record<UnitCategory, string[]> = {
  length: ['m', 'km', 'cm', 'mm', 'mi', 'ft', 'in'],
  mass: ['kg', 'g', 'mg', 'lb', 'oz'],
  data: ['B', 'KB', 'MB', 'GB', 'TB'],
  temperature: ['C', 'F', 'K'],
  speed: ['m/s', 'km/h', 'mph', 'knots'],
};

export function convertUnits(value: number, category: UnitCategory, from: string, to: string): number {
  if (!Number.isFinite(value)) return 0;
  if (category === 'temperature') {
    let celsius = value;
    if (from === 'F') celsius = ((value - 32) * 5) / 9;
    else if (from === 'K') celsius = value - 273.15;

    if (to === 'C') return celsius;
    if (to === 'F') return (celsius * 9) / 5 + 32;
    return celsius + 273.15;
  }

  const factors = UNIT_FACTORS[category];
  const base = value * (factors[from] ?? 1);
  return base / (factors[to] ?? 1);
}

export function getTextStats(text: string) {
  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, '').length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text ? text.split(/\r?\n/).length : 0;
  const sentences = text.trim() ? text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length : 0;
  const readingMinutes = Math.max(0, Math.ceil(words / 225));
  return { chars, charsNoSpaces, words, lines, sentences, readingMinutes };
}

export function convertCase(
  text: string,
  target: 'upper' | 'lower' | 'title' | 'sentence' | 'camel' | 'snake' | 'kebab'
): string {
  switch (target) {
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'title':
      return text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    case 'sentence':
      return text.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase());
    case 'camel': {
      const words = text
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
      return words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
    }
    case 'snake':
      return text
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    case 'kebab':
      return text
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
  }
}

export async function decodeQrFromImageFile(file: File): Promise<{ text: string | null }> {
  const { canvas, ctx } = await fileToCanvas(file);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imgData.data, imgData.width, imgData.height);
  return { text: code ? code.data : null };
}
