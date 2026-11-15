import { useNavigate } from 'react-router-dom';
import { Button, Pill } from '../ui';

export default function Offers() {
  const navigate = useNavigate();
  const offers = [
    { title: 'Regional combo packs', body: 'Three cities, one box of favourites.', badge: 'Combo' },
    { title: 'Tea-time bundles', body: 'Murukku, chekkalu and biscuits for the 5 pm craving.', badge: 'Bundle' },
    { title: 'Festive collections', body: 'Ariselu, laddu and ghewar for the season.', badge: 'Festive' },
  ];
  return (
    <section id="offers" className="page scroll-mt-24 py-12">
      <div className="relative overflow-hidden rounded-[32px] bg-primary p-8 sm:p-12">
        <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/25 blur-2xl" aria-hidden="true" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-[clamp(1.75rem,1.2rem+2vw,2.5rem)] font-bold leading-[1.1] text-grey-800">More Crunch. More Joy.</h2>
            <p className="mt-3 text-grey-800">Collections from shops across Andhra Pradesh and Telangana. Prices are always checked at checkout.</p>
            <Button variant="dark" size="lg" className="mt-6" onClick={() => navigate('/shop?sort=bestsellers')}>Shop bestsellers</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {offers.map((o) => (
              <div key={o.title} className="glass glass-strong p-5">
                <Pill tone="red">{o.badge}</Pill>
                <h3 className="mt-2 font-display text-xl font-semibold">{o.title}</h3>
                <p className="text-sm text-grey-600">{o.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
