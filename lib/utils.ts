export const parseAmount = (v: any): number => {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/[,\s]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export const toLocale = (v: any) => parseAmount(v).toLocaleString();
