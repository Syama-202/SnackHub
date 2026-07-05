import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchFavourites } from '../../store/slices/profile';
import ProductCard, { ProductCardSkeleton } from '../../components/product/Card';
import { Button, EmptyState } from '../../components/ui';

/** Snacks the customer saved, kept on the account. One that cannot be ordered now says why. */
const Favourites = () => {
  const dispatch = useDispatch();
  const { favourites, favouritesLoaded } = useSelector((state) => state.profile);

  useEffect(() => {
    dispatch(fetchFavourites());
  }, [dispatch]);

  if (favouritesLoaded && favourites.length === 0)
    return (
      <div className="page pt-10">
        <EmptyState icon="heart" title="No favourites yet" body="Tap the heart on any snack to save it here. Favourites follow your account to every device." action={<Link to="/shop"><Button>Find snacks</Button></Link>} />
      </div>
    );

  return (
    <div className="page pt-6">
      <h1 className="page-title">Favourites</h1>
      <p className="mt-1 text-grey-600">Saved to your account. Prices and stock are today’s.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {!favouritesLoaded && Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}
        {favourites.map((p) => (
          <div key={p.id} className="flex flex-col">
            <ProductCard product={p} className="h-full" closed={Boolean(p.unavailable)} />
            {p.unavailable && <p className="mt-1 px-1 text-xs font-semibold text-grey-600">{p.unavailable}</p>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Favourites;
