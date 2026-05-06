export const formatCurrency = (amount, currency = 'KES') =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format(amount ?? 0);

export const formatDate = (date) =>
  new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(new Date(date));

export const formatDateTime = (date) =>
  new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));

export const formatNumber = (n) =>
  new Intl.NumberFormat('en-KE').format(n ?? 0);

export const truncate = (str, len = 40) =>
  str?.length > len ? `${str.slice(0, len)}…` : str;
