/**
 * When things are served (doc 12.1): the time of day each snack is made, the shops' weekly
 * hours, and the breakfast, chaat and late-night snacks and shops that make SnackHub follow
 * the clock. All of it is data the seed writes to the database (catalog_items.default_hours,
 * products.available_hours, sellers.weekly_hours); the app reads it from there, so a seller
 * or an admin can change any of it without a code change.
 */
import { DAYS } from '../domain/hours.js';

const daily = (...windows) => Object.fromEntries(DAYS.map((d) => [d, windows]));
const except = (week, days, windows = []) => ({ ...week, ...Object.fromEntries(days.map((d) => [d, windows])) });

// ---------- serving times: one named pattern per kind of snack (India time)
export const SERVING_TIMES = {
  // idli, upma, pongal: the morning tiffin
  breakfast: daily(['06:30', '11:30']),
  // dosa: morning tiffin and the night tiffin
  tiffin: daily(['06:30', '11:30'], ['18:30', '22:30']),
  // vadas and bondas: with the morning coffee and the evening tea
  vadas: daily(['07:00', '11:30'], ['16:00', '21:00']),
  // bajji, pakodi, samosa: the evening tea-time fry
  teatime: daily(['15:30', '21:30']),
  // pani puri, bhel, masala puri: after dark at the chaat cart
  chaat: daily(['16:30', '22:00']),
  // kulfi, bun maska, rolls: the late crowd, past midnight
  latenight: daily(['20:00', '01:30']),
};

// the snacks that keep their own time; everything else (sweets, namkeen, bakes) is sold
// whenever its shop is open
export const SNACK_TIMES = {
  breakfast: ['Idli', 'Ven Pongal', 'Upma', 'Pesarattu', 'Poori', 'Rava Idli', 'Set Dosa', 'Kesari Bath', 'Khara Bath', 'Misal Pav', 'Pyaaz Kachori', 'Kachori', 'Fafda Jalebi', 'Uggani Bajji'],
  tiffin: ['Masala Dosa', 'Mysore Masala Dosa', 'Onion Uttapam'],
  vadas: ['Medu Vada', 'Maddur Vada', 'Minapa Garelu', 'Uzhunnu Vada', 'Paruppu Vadai', 'Sabudana Vada', 'Mysore Bonda'],
  teatime: [
    'Mirchi Bajji', 'Cut Mirchi', 'Punugulu', 'Pesara Punukulu', 'Bonda', 'Gongura Pakoda', 'Ullipaya Pakodi', 'Aratikaya Bajji', 'Bangaladumpa Bajji', 'Vankaya Bajji',
    'Vazhakkai Bajji', 'Menasinakai Bajji', 'Samosa', 'Irani Samosa', 'Singara', 'Aloo Tikki', 'Batata Vada', 'Vada Pav', 'Mirchi Vada', 'Mokkajonna Vada', 'Ponganalu',
    'Kuzhi Paniyaram', 'Pazham Pori', 'Parippu Vada', 'Ulli Vada', 'Sukhiyan', 'Veg Cutlet', 'Thattu Vadai Set', 'Gobi Manchurian', 'Sundal', 'Girmit', 'Atho', 'Kaalan',
  ],
  chaat: ['Pani Puri', 'Bhel Puri', 'Sev Puri', 'Ragda Pattice', 'Masala Puri', 'Dabeli', 'Churumuri', 'Jhal Muri', 'Pav Bhaji', 'Dahi Puri', 'Papdi Chaat'],
  latenight: ['Bun Maska', 'Kulfi Falooda', 'Malai Kulfi', 'Paneer Tikka Roll', 'Kathi Roll', 'Masala Corn'],
};
export const timeOf = (title) => Object.keys(SNACK_TIMES).find((k) => SNACK_TIMES[k].includes(title)) ?? null;

// these are chaat, not namkeen: the category follows them into search and the filters
export const CHAAT = SNACK_TIMES.chaat;

// ---------- new snacks: morning tiffin, more chaat and late-night bites
const S = (title, o) => ({ title, ...o });
export const TIMED_SNACKS = {
  Idli: S('Idli', { temp: 'HOT', cat: 'tiffin', shape: 'disc', c: ['#FBF6EC', '#E8D9B8'], spice: 0, w: '3 pcs with chutney', p: 4000, tags: ['healthy', 'childhood'] }),
  'Masala Dosa': S('Masala Dosa', { temp: 'HOT', cat: 'tiffin', shape: 'wrap', c: ['#E8B86A', '#C9852F'], spice: 1, w: '1 dosa', p: 7000, tags: ['childhood'] }),
  'Mysore Masala Dosa': S('Mysore Masala Dosa', { temp: 'HOT', cat: 'tiffin', shape: 'wrap', c: ['#E3A24A', '#B5462A'], spice: 2, w: '1 dosa', p: 8500, tags: ['spicy'] }),
  'Ven Pongal': S('Ven Pongal', { temp: 'HOT', cat: 'tiffin', shape: 'pile', c: ['#F3E3B5', '#C9A24A'], spice: 1, w: '250 g', p: 6000, tags: ['healthy'] }),
  Upma: S('Upma', { temp: 'HOT', cat: 'tiffin', shape: 'pile', c: ['#F1E2B8', '#6E8E33'], spice: 1, w: '250 g', p: 5000, tags: ['healthy'] }),
  Pesarattu: S('Pesarattu', { temp: 'HOT', cat: 'tiffin', shape: 'disc', c: ['#9CB84A', '#5E7A2A'], spice: 1, w: '2 pcs with ginger chutney', p: 6500, tags: ['healthy', 'new'] }),
  Poori: S('Poori', { temp: 'HOT', cat: 'tiffin', shape: 'disc', c: ['#E7B76A', '#C98A3A'], spice: 1, w: '3 pcs with curry', p: 6000, tags: ['childhood'] }),
  'Rava Idli': S('Rava Idli', { temp: 'HOT', cat: 'tiffin', shape: 'disc', c: ['#F4E9CF', '#D9B865'], spice: 0, w: '2 pcs', p: 5500, tags: ['new'] }),
  'Set Dosa': S('Set Dosa', { temp: 'HOT', cat: 'tiffin', shape: 'disc', c: ['#F0D49A', '#C9913F'], spice: 0, w: '3 pcs', p: 6500, tags: ['childhood'] }),
  'Onion Uttapam': S('Onion Uttapam', { temp: 'HOT', cat: 'tiffin', shape: 'disc', c: ['#EBC98A', '#B5462A'], spice: 1, w: '1 pc', p: 7000, tags: ['new'] }),
  'Dahi Puri': S('Dahi Puri', { temp: 'AMBIENT', cat: 'chaat', shape: 'ball', c: ['#FBF4E6', '#C2402E'], spice: 1, w: '6 pcs', p: 7000, tags: ['childhood'] }),
  'Papdi Chaat': S('Papdi Chaat', { temp: 'AMBIENT', cat: 'chaat', shape: 'pile', c: ['#F1E2B8', '#C2402E'], spice: 2, w: '1 plate', p: 7500, tags: ['spicy'] }),
  'Masala Corn': S('Masala Corn', { temp: 'HOT', cat: 'chaat', shape: 'pile', c: ['#F3D35A', '#C2402E'], spice: 2, w: '1 cup', p: 5000, tags: ['healthy', 'movie'] }),
  'Bun Maska': S('Bun Maska', { temp: 'AMBIENT', cat: 'baked', shape: 'bun', c: ['#E6B35A', '#FFF1C2'], spice: 0, w: '2 buns', p: 4000, tags: ['tea', 'childhood'] }),
  'Kulfi Falooda': S('Kulfi Falooda', { temp: 'AMBIENT', cat: 'sweet', shape: 'pile', c: ['#F6C9D2', '#E9E2CF'], spice: 0, w: '1 glass', p: 9000, tags: ['sweet'] }),
  'Malai Kulfi': S('Malai Kulfi', { temp: 'AMBIENT', cat: 'sweet', shape: 'roll', c: ['#FBF4E6', '#E3A93A'], spice: 0, w: '2 sticks', p: 7000, tags: ['sweet', 'childhood'] }),
  'Paneer Tikka Roll': S('Paneer Tikka Roll', { temp: 'HOT', cat: 'fried', shape: 'roll', c: ['#E8C276', '#C2402E'], spice: 2, w: '1 roll', p: 12000, tags: ['spicy', 'movie'] }),
};

// ---------- new shops: [neighbourhood, signature, offset lat, offset lng, snacks, kind, hours]
// hours is a key of SHOP_HOURS; without one, the shop's kind and menu decide (hoursFor)
export const TIMED_SHOPS = {
  chennai: [['Mylapore', 'Tiffin Centre', 0.002, -0.006, ['Idli', 'Ven Pongal', 'Medu Vada', 'Masala Dosa', 'Rava Idli', 'Kesari Bath'], 'shop', 'tiffinCentre']],
  bengaluru: [
    ['Basavanagudi', 'Idli Mane', -0.002, 0.006, ['Rava Idli', 'Set Dosa', 'Masala Dosa', 'Khara Bath', 'Kesari Bath', 'Maddur Vada'], 'shop', 'tiffinCentre'],
    ['VV Puram', 'Chaat Street', -0.006, 0.002, ['Masala Puri', 'Pani Puri', 'Bhel Puri', 'Dahi Puri', 'Masala Corn'], 'stall'],
  ],
  hyderabad: [
    ['Charminar', 'Night Bazaar', 0.004, 0.006, ['Bun Maska', 'Kulfi Falooda', 'Paneer Tikka Roll', 'Irani Samosa', 'Malai Kulfi'], 'stall', 'nightBazaar'],
    ['Ameerpet', 'Pesarattu Corner', -0.004, -0.007, ['Pesarattu', 'Upma', 'Idli', 'Poori', 'Medu Vada', 'Onion Uttapam'], 'shop', 'tiffinCentre'],
  ],
  vijayawada: [['Governorpet', 'Chaat Bandi', 0.003, 0.006, ['Pani Puri', 'Masala Puri', 'Bhel Puri', 'Sev Puri', 'Masala Corn'], 'stall']],
  guntur: [['Arundelpet', 'Tiffins', -0.002, 0.007, ['Idli', 'Pesarattu', 'Upma', 'Poori', 'Minapa Garelu', 'Mysore Masala Dosa'], 'shop', 'tiffinCentre']],
  visakhapatnam: [['Beach Road', 'Night Stall', 0.006, 0.005, ['Masala Corn', 'Kulfi Falooda', 'Bun Maska', 'Mirchi Bajji', 'Malai Kulfi'], 'stall', 'nightBazaar']],
  kolkata: [['Gariahat', 'Phuchka Stall', 0.005, -0.002, ['Pani Puri', 'Jhal Muri', 'Papdi Chaat', 'Kathi Roll'], 'stall']],
  delhi: [['Chandni Chowk', 'Golgappa Corner', -0.002, 0.005, ['Pani Puri', 'Papdi Chaat', 'Aloo Tikki', 'Dahi Puri', 'Jalebi'], 'stall']],
};

// ---------- shop hours
export const SHOP_HOURS = {
  // the morning and night tiffin
  tiffinCentre: daily(['06:30', '11:30'], ['17:30', '22:30']),
  // opens at dusk, closes after midnight
  nightBazaar: daily(['18:00', '02:00']),
  // the evening cart, later at the weekend
  stall: except(daily(['15:30', '22:30']), ['fri', 'sat'], [['15:30', '23:30']]),
  // a shop that also does breakfast items
  earlyShop: daily(['06:30', '21:30']),
  // a sweet or snack shop; every fourth one rests on Tuesday
  shop: daily(['09:00', '21:30']),
  shopTuesdayOff: except(daily(['09:00', '21:30']), ['tue']),
  // an Irani cafe: from the first chai to the last
  iraniCafe: daily(['05:30', '23:30']),
  // a home kitchen: lunch and evening batches, Sunday off
  home: except(daily(['10:30', '14:00'], ['16:30', '20:30']), ['sun']),
};

/** A shop's week from its kind, its menu and its place in the list (deterministic). */
export function hoursFor({ kind, signature, hours, names, index }) {
  if (hours) return SHOP_HOURS[hours];
  if (/irani|bakery/i.test(signature)) return SHOP_HOURS.iraniCafe;
  if (kind === 'home') return SHOP_HOURS.home;
  if (kind === 'stall') return SHOP_HOURS.stall;
  if (names.some((n) => ['breakfast', 'tiffin', 'vadas'].includes(timeOf(n)))) return SHOP_HOURS.earlyShop;
  return index % 4 === 3 ? SHOP_HOURS.shopTuesdayOff : SHOP_HOURS.shop;
}

// ---------- where the shops are: the area's postal code, for the address line
export const AREA_PINCODES = {
  guntur: { Brodipet: '522002', 'Brodipet 4th Lane': '522002', Arundelpet: '522002', Lakshmipuram: '522007', Kothapet: '522001' },
  vijayawada: { 'Benz Circle': '520010', Governorpet: '520002', Gandhinagar: '520003', Patamata: '520010' },
  visakhapatnam: { 'Dwaraka Nagar': '530016', 'MVP Colony': '530017', 'Beach Road': '530002' },
  hyderabad: { Abids: '500001', Himayatnagar: '500029', Charminar: '500002', 'Charminar Lane': '500002', Ameerpet: '500016', Kukatpally: '500072' },
  bengaluru: { Basavanagudi: '560004', Malleswaram: '560003', 'VV Puram': '560004', 'VV Puram Food Street': '560004', Jayanagar: '560011' },
  chennai: { Mylapore: '600004', 'Mylapore Agraharam': '600004', 'T Nagar': '600017', Triplicane: '600005', 'Marina Beach Road': '600005' },
  mumbai: { Dadar: '400014', Girgaon: '400004', 'Girgaon Chowpatty': '400007', Juhu: '400049' },
  delhi: { 'Chandni Chowk': '110006', 'Karol Bagh': '110005' },
  kolkata: { Gariahat: '700019', Shyambazar: '700004' },
  jaipur: { 'Johari Bazaar': '302003', 'Bapu Bazaar': '302003' },
  ahmedabad: { 'Manek Chowk': '380001', Navrangpura: '380009' },
  pune: { 'Sadashiv Peth': '411030', Deccan: '411004', Kothrud: '411038' },
};
