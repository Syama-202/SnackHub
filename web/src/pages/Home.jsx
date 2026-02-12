import Hero from '../components/landing/Hero';
import ScrollStory from '../components/landing/ScrollStory';
import ProductHotspots from '../components/landing/ProductHotspots';
import VariantPicker from '../components/landing/VariantPicker';
import LanePreview from '../components/landing/LanePreview';
import { RegionalDiscovery, Bestsellers, DeliveryStory, MoodTiles, Editorial, Offers, OrderNow, SnackStrip } from '../components/landing/Sections';

/** One story in seven sections (doc 22.9c), plus the master-prompt shopping sections. */
const Home = () => (
  <>
    <Hero />
    <SnackStrip />
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

export default Home;
