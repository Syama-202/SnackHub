import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchProducts, fetchSellers } from '../store/slices/products';
import { selectDeliveryPoint } from '../store/slices/profile';

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
