// Formatação pt-BR compartilhada pelas páginas (antes cada uma tinha cópia).
// Datas puras (YYYY-MM-DD) formatam por split — evita o shift de fuso de
// passar por Date; timestamps (Date/ISO com hora) usam o fuso local.

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  if (value instanceof Date) return value.toLocaleDateString('pt-BR');
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  return new Date(value).toLocaleDateString('pt-BR');
}

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}
