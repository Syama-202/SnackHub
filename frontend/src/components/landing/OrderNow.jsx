import { useNavigate } from 'react-router-dom';
import { Button } from '../ui';

export default function OrderNow() {
  const navigate = useNavigate();
  return (
    <section className="mx-auto max-w-4xl px-4 pb-8 pt-20 text-center">
      <h2 className="text-[clamp(1.75rem,1.2rem+2.4vw,2.75rem)] font-bold leading-[1.02]">Hungry yet? <span className="text-shine">Let's fix that.</span></h2>
      <p className="mx-auto mt-3 max-w-xl text-lg text-grey-600">See what the shops near you are frying, packing and plating right now.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={() => navigate('/shop')}>Show snacks near me</Button>
        <Button size="lg" variant="ghost" onClick={() => navigate('/shop?cat=sweets')}>Just the sweets</Button>
      </div>
    </section>
  );
}
