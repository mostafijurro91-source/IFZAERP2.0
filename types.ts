export type Company = 'Transtec' | 'SQ Light' | 'SQ Cables';
export type UserRole = 'ADMIN' | 'STAFF' | 'DELIVERY';
export interface User { id: string; name: string; role: UserRole; company: Company; username: string; customer_id?: string; }
export const formatCurrency = (amount: any) => { return new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(amount || 0).replace('BDT', '৳'); };