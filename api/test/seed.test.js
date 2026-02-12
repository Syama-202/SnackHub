// The seed rows are consistent before they reach MySQL: ids unique, references resolve,
// everything labelled as demo data, and the built-in test cases are present (doc 23).
import { describe, expect, it } from 'vitest';
import { seedRows } from '../seed/seed.js';

const rows = seedRows();
const ids = (list, key = 'id') => list.map((r) => r[key]);

describe('seed rows', () => {
  it('has unique ids and emails', () => {
    for (const key of ['users', 'addresses', 'sellers', 'products', 'riders']) {
      expect(new Set(ids(rows[key])).size).toBe(rows[key].length);
    }
    expect(new Set(ids(rows.users, 'email')).size).toBe(rows.users.length);
  });

  it('every reference points at a seeded row', () => {
    const users = new Set(ids(rows.users));
    const sellers = new Set(ids(rows.sellers));
    const products = new Set(ids(rows.products));
    expect(rows.sellers.every((s) => users.has(s.user_id))).toBe(true);
    expect(rows.riders.every((r) => users.has(r.user_id))).toBe(true);
    expect(rows.addresses.every((a) => users.has(a.user_id))).toBe(true);
    expect(rows.products.every((p) => sellers.has(p.seller_id))).toBe(true);
    expect(rows.stock.every((s) => products.has(s.product_id))).toBe(true);
  });

  it('is clearly fake', () => {
    expect(rows.users.every((u) => u.email.endsWith('@example.test'))).toBe(true);
    expect(rows.users.every((u) => /demo/i.test(u.name))).toBe(true);
    expect(rows.sellers.every((s) => s.licence_no.startsWith('FAKE-'))).toBe(true);
    expect(rows.addresses.every((a) => a.line.includes('(demo)'))).toBe(true);
  });

  it('keeps the built-in test cases', () => {
    const mirchi = rows.products.find((p) => p.seller_id === 1 && p.title === 'Mirchi Bajji');
    expect(rows.stock.find((s) => s.product_id === mirchi.id).qty).toBe(3);
    expect(rows.stock.some((s) => s.qty === 0)).toBe(true);
    expect(rows.sellers.some((s) => s.busy_extra_min === 6)).toBe(true);
    expect(rows.sellers.map((s) => s.status)).toEqual(expect.arrayContaining(['suspended', 'pending']));
    expect(rows.riders.some((r) => r.status === 'OFFLINE')).toBe(true);
  });

  it('fits the table constraints', () => {
    expect(rows.products.every((p) => p.price_paise > 0 && (p.mrp_paise === null || p.mrp_paise >= p.price_paise))).toBe(true);
    expect(rows.sellers.every((s) => s.radius_km > 0 && s.radius_km <= 10)).toBe(true);
    expect(rows.stock.every((s) => s.qty >= 0)).toBe(true);
    expect(JSON.parse(rows.policies[0].config).version).toBe(rows.policies[0].id);
  });
});
