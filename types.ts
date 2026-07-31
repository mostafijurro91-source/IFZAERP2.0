
export interface CompanyRecord {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export type Company = string; // Was: 'Transtec' | 'SQ Light' | 'SQ Cables'
export type UserRole = 'ADMIN' | 'STAFF' | 'DELIVERY' | 'CUSTOMER';
export type OrderAction = 'SALE' | 'RETURN' | 'REPLACE';

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
  portal_username?: string;
  portal_password?: string;
}

export interface Product {
  id: string;
  name: string;
  company: string;
  db_price?: number; // Dealer Buying Price
  mrp: number;
  tp: number;
  etp: number;
  stock: number;
  created_at?: string;
  category?: string;
}

export interface FastBookingCustomer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  company: string;
  isActive: boolean;
  created_at: string;
}

export interface FastBookingOrderItem {
  id: string;
  product_id: string;
  name: string;
  qty: number;
  unitPrice: number;
  delivered_qty: number;
}

export interface FastBookingOrder {
  id: string;
  customer_id: string;
  company: string;
  total_bill: number;
  total_deposit: number;
  items: FastBookingOrderItem[];
  status: 'PENDING' | 'PARTIAL' | 'COMPLETED';
  created_at: string;
  fast_booking_customers?: FastBookingCustomer;
  customer_name?: string;
}

export interface FastBookingTransaction {
  id: string;
  order_id: string;
  customer_id: string;
  company: string;
  amount: number;
  type: 'DEPOSIT' | 'REFUND';
  method: 'CASH' | 'BANK';
  note?: string;
  created_at: string;
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

export interface TransactionItem {
  id?: string;
  name: string;
  qty: number;
  price: number;
  note?: string;
  action?: 'SALE' | 'RETURN';
}

export interface Transaction {
  id: string;
  customer_id: string;
  amount: number;
  payment_type: 'DUE' | 'COLLECTION' | 'CASH';
  company: string;
  meta?: any;
  items?: TransactionItem[];
  created_at: string;
  customers?: Customer;
}

export interface MarketOrderItem {
  name: string;
  qty: number;
  action: OrderAction;
}

export interface MarketOrder {
  id: string;
  customer_id: string;
  status: 'PENDING' | 'ACCEPTED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  total_amount: number;
  items: MarketOrderItem[];
  created_at: string;
}

export interface CustomerFinancials {
  regularDue: number;
  totalSales: number;
  totalPaid: number;
}

export interface CompanyStats {
  regularDue: number;
  totalBill: number;
  totalPaid: number;
}

export interface OrderItem {
  id: string;
  name: string;
  mrp: number;
  qty: number;
  company: string;
  action: OrderAction;
}

export const formatCurrency = (amount: number | string) => {
  const value = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  return new Intl.NumberFormat('bn-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 0
  }).format(value).replace('BDT', '৳');
};
