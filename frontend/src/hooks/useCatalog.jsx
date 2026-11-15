import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchProducts, fetchSellers } from '../store/slices/products';
import { selectDeliveryPoint } from '../store/slices/profile';

/**
 * Reloads a list of snacks when the next one changes state by the clock (a serving time
 * starts or ends, a shop opens or closes), and every few minutes for stock. The server works
 * the state out; this only asks again at the right moment.
 */
export function useAvailabilityRefresh(items, reload, { every = 5 * 60_000 } = {}) {
  const next = items.reduce((soonest, p) => {
    const a = p.availability;
    for (const t of [a?.nextAt, a?.closesAt]) if (t && t > Date.now() && t < soonest) soonest = t;
    return soonest;
  }, Infinity);
  useEffect(() => {
    if (!items.length) return undefined;
    // a little after the change, never more than "every" away, never sooner than 20 s
    const wait = Math.max(20_000, Math.min(every, next - Date.now() + 2_000));
    const t = setTimeout(reload, wait);
    return () => clearTimeout(t);
  }, [next, items.length, reload, every]);
}

/** Snacks near the selected delivery point, loaded into the products slice. */
export function useNearbyProducts() {
  const dispatch = useDispatch();
  const point = useSelector(selectDeliveryPoint);
  const { items, itemsKey, isLoading, error } = useSelector((state) => state.products);
  const key = `${point.lat},${point.lng},${point.pincode ?? ''}`;
  const load = useCallback(() => dispatch(fetchProducts({ lat: point.lat, lng: point.lng, pincode: point.pincode })), [dispatch, point.lat, point.lng, point.pincode]);
  useEffect(() => {
    load();
  }, [load]);
  const current = itemsKey === key;
  // served-later snacks become orderable (and others stop) by themselves
  const reload = useCallback(() => dispatch(fetchProducts({ lat: point.lat, lng: point.lng, pincode: point.pincode, fresh: true })), [dispatch, point.lat, point.lng, point.pincode]);
  useAvailabilityRefresh(current ? items : [], reload);
  return { items: current ? items : [], isLoading: isLoading || (!current && !error), error, point, retry: load };
}

/** Verified shops that can reach the selected delivery point. */
export function useNearbySellers() {
  const dispatch = useDispatch();
  const point = useSelector(selectDeliveryPoint);
  const sellers = useSelector((state) => state.products.sellers);
  useEffect(() => {
    dispatch(fetchSellers({ lat: point.lat, lng: point.lng, pincode: point.pincode }));
  }, [dispatch, point.lat, point.lng, point.pincode]);
  return sellers;
}
