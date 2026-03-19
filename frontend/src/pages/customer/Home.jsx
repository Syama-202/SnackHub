import Hero from '../../components/landing/Hero';
import SnackStrip from '../../components/landing/SnackStrip';
import Regions from '../../components/landing/Regions';
import Streets from '../../components/landing/Streets';
import ScrollStory from '../../components/landing/ScrollStory';
import Bestsellers from '../../components/landing/Bestsellers';
import ShopChecks from '../../components/landing/ShopChecks';
import VariantPicker from '../../components/landing/VariantPicker';
import Delivery from '../../components/landing/Delivery';
import Moods from '../../components/landing/Moods';
import LanePreview from '../../components/landing/LanePreview';
import Stories from '../../components/landing/Stories';
import Offers from '../../components/landing/Offers';
import OrderNow from '../../components/landing/OrderNow';

/** One story in seven sections (doc 22.9c), plus the master-prompt shopping sections. */
const Home = () => (
  <>
    <Hero />
    <SnackStrip />
    <Regions />
    <Streets />
    <ScrollStory />
    <Bestsellers />
    <ShopChecks />
    <VariantPicker />
    <Delivery />
    <Moods />
    <LanePreview />
    <Stories />
    <Offers />
    <OrderNow />
  </>
);

export default Home;
