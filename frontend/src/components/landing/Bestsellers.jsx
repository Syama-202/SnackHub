import { Link } from 'react-router-dom';
import Carousel from '../ui/Carousel';
import { SectionTitle } from '../ui';
import ProductCard, { ProductCardSkeleton } from '../product/Card';
import { useNearbyProducts } from '../../hooks/useCatalog';

export default function Bestsellers() {
  const { items: data, isLoading } = useNearbyProducts();
  const list = (data || []).filter((p) => p.bestseller || p.trending).sort((a, b) => b.rating - a.rating).slice(0, 10);
  return (
    <section className="mx-auto max-w-7xl px-4 py-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle eyebrow="Bestsellers near you" title="The Snacks Everyone's Talking About." />
        <Link to="/shop?sort=bestsellers" className="font-extrabold text-orange-text">See all</Link>
      </div>
      <div className="mt-8">
        <Carousel label="Bestsellers">
          {isLoading && Array.from({ length: 4 }, (_, i) => <div key={i} className="w-[70%] shrink-0 sm:w-[40%] lg:w-[23%]"><ProductCardSkeleton /></div>)}
          {list.map((p) => (
            <div key={p.id} className="w-[70%] shrink-0 snap-start sm:w-[40%] lg:w-[23%]">
              <ProductCard product={p} className="h-full" />
            </div>
          ))}
        </Carousel>
      </div>
    </section>
  );
}
