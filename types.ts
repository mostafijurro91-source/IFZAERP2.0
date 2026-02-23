
export type Company = 'Transtec' | 'SQ Light' | 'SQ Cables';
export type UserRole = 'ADMIN' | 'STAFF' | 'DELIVERY' | 'CUSTOMER';

export enum Type {
  TYPE_UNSPECIFIED = 'TYPE_UNSPECIFIED',
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  INTEGER = 'INTEGER',
  BOOLEAN = 'BOOLEAN',
  ARRAY = 'ARRAY',
  OBJECT = 'OBJECT',
  NULL = 'NULL',
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  company: Company;
  username: string;
  customer_id?: string;
}

export interface Customer {
  id: string;
  name: string;
  address: string;
  phone?: string;
  area?: string;
}

export interface Product {
  id: string;
  name: string;
  company: string;
  mrp: number;
  tp: number;
  etp: number;
  stock: number;
  created_at?: string;
  category?: string;
}

export interface BookingItem {
  id: string;
  product_id: string;
  name: string;
  qty: number;
  unitPrice: number;
  delivered_qty: number;
}

export interface Booking {
  id: string;
  customer_id: string;
  company: string;
  product_name: string;
  qty: number;
  items: BookingItem[];
  advance_amount: number;
  total_amount: number;
  status: 'PENDING' | 'PARTIAL' | 'COMPLETED';
  created_at: string;
  customer_name?: string;
}

export interface Advertisement {
  id: string;
  title: string;
  content: string;
  company: Company;
  type: 'NEW_PRODUCT' | 'OFFER' | 'PARTS' | 'NOTICE' | 'OFFICIAL_CATALOG';
  image_url?: string;
  external_url?: string;
  created_at: string;
}

export const formatCurrency = (amount: number | string) => {
  const value = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  return new Intl.NumberFormat('bn-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 0
  }).format(value).replace('BDT', '৳');
};
