import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import { api } from './api';
import { actions } from '../store/webStore';

export function useAddresses() {
  // Customer-only endpoints: other roles would get 403 on every poll
  const isCustomer = useSelector((s) => s.auth.user?.role === 'customer');
  return useQuery({ queryKey: ['addresses'], queryFn: () => api('/me/addresses'), enabled: isCustomer, staleTime: 60_000 });
}

/** The selected delivery point. Guests browse from the demo Guntur address. */
export function useDeliveryPoint() {
  const addressId = useSelector((s) => s.ui.addressId);
  const { data } = useAddresses();
  const fallback = { id: 1, label: 'Guntur (demo)', line: 'Brodipet, Guntur (demo)', lat: 16.3152, lng: 80.4301, cityId: 'guntur' };
  return data?.find((a) => a.id === addressId) || fallback;
}

export function useNearbyProducts() {
  const p = useDeliveryPoint();
  return useQuery({ queryKey: ['products', p.lat, p.lng], queryFn: () => api(`/products?lat=${p.lat}&lng=${p.lng}`), staleTime: 30_000 });
}

export function useNearbySellers(temp) {
  const p = useDeliveryPoint();
  return useQuery({ queryKey: ['sellers', p.lat, p.lng, temp || 'ANY'], queryFn: () => api(`/sellers?lat=${p.lat}&lng=${p.lng}${temp ? `&temp=${temp}` : ''}`), staleTime: 30_000 });
}

export function useCart() {
  // Customer-only endpoints: other roles would get 403 on every poll
  const isCustomer = useSelector((s) => s.auth.user?.role === 'customer');
  return useQuery({ queryKey: ['cart'], queryFn: () => api('/cart'), enabled: isCustomer, staleTime: 10_000 });
}

/**
 * Server cart (GET/PUT /cart) with an optimistic update (doc 5.1).
 * Returns setQty(product, qty, { replace }).
 */
export function useSetCartQty() {
  const qc = useQueryClient();
  const dispatch = useDispatch();
  return useMutation({
    mutationFn: ({ product, qty, replace }) => api('/cart', { method: 'PUT', body: { productId: product.id, qty, replace } }),
    onMutate: async ({ product, qty }) => {
      await qc.cancelQueries({ queryKey: ['cart'] });
      const prev = qc.getQueryData(['cart']);
      if (prev && (!prev.sellerId || prev.sellerId === product.sellerId)) {
        const exists = prev.items.find((i) => i.productId === product.id);
        let items = exists ? prev.items.map((i) => (i.productId === product.id ? { ...i, qty } : i)) : [...prev.items, { productId: product.id, qty, title: product.title, pricePaise: product.pricePaise, servingTemp: product.servingTemp, art: product.art, weight: product.weight, stock: product.stock }];
        items = items.filter((i) => i.qty > 0);
        qc.setQueryData(['cart'], { ...prev, sellerId: items.length ? product.sellerId : null, items, subtotalPaise: items.reduce((s, i) => s + i.pricePaise * i.qty, 0) });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['cart'], ctx.prev),
    onSuccess: (data) => {
      qc.setQueryData(['cart'], data);
      dispatch(actions.bumpCart());
    },
  });
}

export function useNotifications() {
  // Customer-only endpoints: other roles would get 403 on every poll
  const isCustomer = useSelector((s) => s.auth.user?.role === 'customer');
  return useQuery({ queryKey: ['notifications'], queryFn: () => api('/me/notifications'), enabled: isCustomer, refetchInterval: 4000 });
}

export function useOrders() {
  // Customer-only endpoints: other roles would get 403 on every poll
  const isCustomer = useSelector((s) => s.auth.user?.role === 'customer');
  return useQuery({ queryKey: ['orders'], queryFn: () => api('/orders'), enabled: isCustomer, refetchInterval: 5000 });
}
