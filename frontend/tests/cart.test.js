// The cart slice (src/store/slices/cart.jsx): a change shows at once, the server's answer
// replaces it, and a refused change rolls back to what was there before.
import { describe, expect, it } from 'vitest';
import reducer, { resetCart, selectCartCount, setCartQty } from '../src/store/slices/cart.jsx';

const product = { id: 7, sellerId: 3, slug: 'murukku', title: 'Murukku (demo)', pricePaise: 6000, servingTemp: 'AMBIENT' };
const pending = (arg) => setCartQty.pending('req-1', arg);
const start = () => reducer(undefined, resetCart());

describe('cart', () => {
  it('adds a line at once and works out the subtotal', () => {
    const state = reducer(start(), pending({ product, qty: 2 }));
    expect(state.items).toMatchObject([{ productId: 7, qty: 2 }]);
    expect(state.subtotalPaise).toBe(12000);
    expect(state.sellerId).toBe(3);
    expect(selectCartCount({ cart: state })).toBe(2);
  });

  it('rolls back when the server refuses the change', () => {
    const one = reducer(reducer(start(), pending({ product, qty: 1 })), setCartQty.fulfilled({ sellerId: 3, items: [{ productId: 7, qty: 1, pricePaise: 6000 }], subtotalPaise: 6000 }, 'req-1', { product, qty: 1 }));
    const tried = reducer(one, pending({ product, qty: 5 }));
    expect(tried.items[0].qty).toBe(5);
    const back = reducer(tried, setCartQty.rejected(new Error('OUT_OF_STOCK'), 'req-1', { product, qty: 5 }));
    expect(back.items[0].qty).toBe(1);
    expect(back.subtotalPaise).toBe(6000);
    expect(back.snapshot).toBeNull();
  });

  it('removes a line set to zero and forgets the shop when the cart is empty', () => {
    const state = reducer(reducer(start(), pending({ product, qty: 1 })), pending({ product, qty: 0 }));
    expect(state.items).toEqual([]);
    expect(state.sellerId).toBeNull();
  });

  it('leaves the cart alone when the snack is from another shop (the server asks first)', () => {
    const state = reducer(start(), pending({ product, qty: 1 }));
    const other = reducer(state, pending({ product: { ...product, id: 9, sellerId: 4 }, qty: 1 }));
    expect(other.items).toHaveLength(1);
    expect(other.sellerId).toBe(3);
  });
});
