import Hero from './Hero';
import ScrollStory from './ScrollStory';
import ProductHotspots from './ProductHotspots';
import VariantPicker from './VariantPicker';
import LanePreview from './LanePreview';
import { RegionalDiscovery, Bestsellers, DeliveryStory, MoodTiles, Editorial, Offers, OrderNow } from './Sections';

/** One story in seven sections (doc 22.9c), plus the master-prompt shopping sections. */
export default function Landing() {
  return (
    <>
      <Hero />
      <RegionalDiscovery />
      <ScrollStory />
      <Bestsellers />
      <ProductHotspots />
      <VariantPicker />
      <DeliveryStory />
      <MoodTiles />
      <LanePreview />
      <Editorial />
      <Offers />
      <OrderNow />
    </>
  );
}
