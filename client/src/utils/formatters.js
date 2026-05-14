export const formatCurrency = (amount, currency = 'KES') =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format(amount ?? 0);

export const formatDate = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  return isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(d);
};

export const formatDateTime = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  return isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
};

export const formatNumber = (n) =>
  new Intl.NumberFormat('en-KE').format(n ?? 0);

export const truncate = (str, len = 40) =>
  str?.length > len ? `${str.slice(0, len)}…` : str;
