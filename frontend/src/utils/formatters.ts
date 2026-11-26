export function formatPKR(amount: number, compact = true): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (compact) {
    if (abs >= 1_000_000_000) return `${sign}PKR ${(abs / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${sign}PKR ${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}PKR ${(abs / 1_000).toFixed(0)}K`;
  }
  return `${sign}PKR ${Math.round(abs).toLocaleString('en-US')}`;
}

export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPktTime(date: Date = new Date()): string {
  return (
    date.toLocaleString('en-GB', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }) + ' PKT'
  );
}

export function formatCoord(lat: number, lon: number): string {
  return `${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`;
}
