export function inr(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function inrPerKg(value: number): string {
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}/kg`
}

export function kg(value: number): string {
  return `${new Intl.NumberFormat('en-IN').format(value)}kg`
}
