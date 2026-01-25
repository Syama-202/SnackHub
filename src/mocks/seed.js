/**
 * Demo data (doc 23). Everything here is fake: shop names are fictional,
 * coordinates are approximate city centres plus small offsets, licence numbers
 * start with FAKE-, and emails end in @example.test.
 *
 * Built-in test cases:
 *  - Guntur shop 1, Mirchi Bajji, stock 3  -> last-units race (10.8)
 *  - Guntur shop 2, one product with stock 0 -> sold-out handling
 *  - Guntur shop 3, busy mode adds 6 minutes -> ETA and serviceability
 *  - Jaipur shop 2 suspended, Pune shop 2 pending -> never shown to customers
 *  - One Guntur rider offline -> matching skips offline riders
 */

// art: shape + two colours for the illustrative SnackArt component
const S = (title, o) => ({ title, ...o });
const SNACKS = {
  'Mirchi Bajji': S('Mirchi Bajji', { temp: 'HOT', cat: 'fried', shape: 'bajji', c: ['#E8A23A', '#3F7D20'], spice: 3, w: '4 pcs', p: 6000, tags: ['spicy', 'tea'] }),
  Punugulu: S('Punugulu', { temp: 'HOT', cat: 'fried', shape: 'ball', c: ['#D98A2B', '#F4C26B'], spice: 2, w: '12 pcs', p: 5000, tags: ['spicy', 'tea', 'childhood'] }),
  Ariselu: S('Ariselu', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#8A4B1F', '#C98B4A'], spice: 0, w: '250 g', p: 18000, tags: ['sweet', 'festive'] }),
  Chekkalu: S('Chekkalu', { temp: 'AMBIENT', cat: 'namkeen', shape: 'disc', c: ['#D9A441', '#7A9E3B'], spice: 1, w: '200 g', p: 12000, tags: ['tea', 'crunch'] }),
  'Boondi Laddu': S('Boondi Laddu', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#F2A516', '#FFD36B'], spice: 0, w: '6 pcs', p: 16000, tags: ['sweet', 'festive', 'childhood'] }),
  'Gongura Pakoda': S('Gongura Pakoda', { temp: 'HOT', cat: 'fried', shape: 'pile', c: ['#B8732E', '#4E7A2A'], spice: 3, w: '200 g', p: 7000, tags: ['spicy'] }),
  Pootharekulu: S('Pootharekulu', { temp: 'AMBIENT', cat: 'sweet', shape: 'wrap', c: ['#F6EBD6', '#C9852F'], spice: 0, w: '6 pcs', p: 24000, tags: ['sweet', 'new'] }),
  Bobbatlu: S('Bobbatlu', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#E7B04C', '#C9752A'], spice: 0, w: '4 pcs', p: 16000, tags: ['sweet', 'festive'] }),
  Kaja: S('Kaja', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#E9A23B', '#FFE09A'], spice: 0, w: '250 g', p: 15000, tags: ['sweet'] }),
  Bonda: S('Bonda', { temp: 'HOT', cat: 'fried', shape: 'ball', c: ['#C98431', '#E9B866'], spice: 1, w: '6 pcs', p: 5000, tags: ['tea', 'childhood'] }),
  'Atukula Mixture': S('Atukula Mixture', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#E8C46A', '#B5462A'], spice: 2, w: '250 g', p: 11000, tags: ['crunch', 'movie'] }),
  Sunnundalu: S('Sunnundalu', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#8C5A2B', '#B07A43'], spice: 0, w: '8 pcs', p: 20000, tags: ['sweet', 'healthy'] }),
  'Irani Samosa': S('Irani Samosa', { temp: 'HOT', cat: 'fried', shape: 'samosa', c: ['#D8A04A', '#F1CF85'], spice: 2, w: '6 pcs', p: 6000, tags: ['tea', 'spicy'] }),
  Luqmi: S('Luqmi', { temp: 'HOT', cat: 'baked', shape: 'square', c: ['#D7A24F', '#F3D18C'], spice: 1, w: '4 pcs', p: 8000, tags: ['new', 'tea'] }),
  'Osmania Biscuit': S('Osmania Biscuit', { temp: 'AMBIENT', cat: 'baked', shape: 'biscuit', c: ['#E2B866', '#C08A3E'], spice: 0, w: '300 g', p: 14000, tags: ['tea', 'childhood'] }),
  Dilkush: S('Dilkush', { temp: 'AMBIENT', cat: 'baked', shape: 'square', c: ['#E6B35A', '#D9493A'], spice: 0, w: '1 pc', p: 9000, tags: ['sweet', 'childhood'] }),
  'Maddur Vada': S('Maddur Vada', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#C88A3A', '#6E8E33'], spice: 1, w: '4 pcs', p: 6000, tags: ['tea'] }),
  Nippattu: S('Nippattu', { temp: 'AMBIENT', cat: 'namkeen', shape: 'disc', c: ['#D9A44E', '#9A5A2A'], spice: 2, w: '250 g', p: 11000, tags: ['crunch', 'tea'] }),
  Kodubale: S('Kodubale', { temp: 'AMBIENT', cat: 'namkeen', shape: 'vada', c: ['#C9862F', '#E9B866'], spice: 2, w: '250 g', p: 12000, tags: ['crunch', 'movie'] }),
  'Mysore Pak': S('Mysore Pak', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#F0B43C', '#C47A1E'], spice: 0, w: '250 g', p: 22000, tags: ['sweet', 'festive'] }),
  'Medu Vada': S('Medu Vada', { temp: 'HOT', cat: 'fried', shape: 'vada', c: ['#C88A3A', '#EDC27A'], spice: 1, w: '4 pcs', p: 6000, tags: ['tea', 'childhood'] }),
  Sundal: S('Sundal', { temp: 'HOT', cat: 'namkeen', shape: 'pile', c: ['#E7C782', '#3F7D20'], spice: 1, w: '200 g', p: 5000, tags: ['healthy'] }),
  Murukku: S('Murukku', { temp: 'AMBIENT', cat: 'namkeen', shape: 'spiral', c: ['#D9A44E', '#B37A2E'], spice: 1, w: '250 g', p: 12000, tags: ['crunch', 'tea', 'movie'] }),
  Adhirasam: S('Adhirasam', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#6E3B17', '#A0612C'], spice: 0, w: '6 pcs', p: 18000, tags: ['sweet', 'festive', 'new'] }),
  Seedai: S('Seedai', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#E4B866', '#B07A43'], spice: 1, w: '250 g', p: 11000, tags: ['crunch', 'festive'] }),
  'Vada Pav': S('Vada Pav', { temp: 'HOT', cat: 'fried', shape: 'bun', c: ['#E7B76A', '#3F7D20'], spice: 2, w: '2 pcs', p: 6000, tags: ['spicy', 'childhood'] }),
  'Batata Vada': S('Batata Vada', { temp: 'HOT', cat: 'fried', shape: 'ball', c: ['#D79A3F', '#F0C978'], spice: 2, w: '4 pcs', p: 5000, tags: ['spicy', 'tea'] }),
  Chikki: S('Chikki', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#B9752C', '#E8C478'], spice: 0, w: '200 g', p: 9000, tags: ['sweet', 'healthy', 'childhood'] }),
  'Khari Biscuit': S('Khari Biscuit', { temp: 'AMBIENT', cat: 'baked', shape: 'biscuit', c: ['#E8C276', '#C9913F'], spice: 0, w: '200 g', p: 8000, tags: ['tea'] }),
  'Aloo Tikki': S('Aloo Tikki', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#C98431', '#3F7D20'], spice: 2, w: '2 pcs', p: 7000, tags: ['spicy'] }),
  Kachori: S('Kachori', { temp: 'HOT', cat: 'fried', shape: 'ball', c: ['#C6862F', '#E9B866'], spice: 2, w: '4 pcs', p: 6000, tags: ['spicy', 'tea'] }),
  Samosa: S('Samosa', { temp: 'HOT', cat: 'fried', shape: 'samosa', c: ['#D8A04A', '#F1CF85'], spice: 2, w: '4 pcs', p: 5000, tags: ['spicy', 'tea', 'childhood'] }),
  'Sohan Halwa': S('Sohan Halwa', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#8A4B1F', '#D9A44E'], spice: 0, w: '250 g', p: 26000, tags: ['sweet', 'festive', 'new'] }),
  Singara: S('Singara', { temp: 'HOT', cat: 'fried', shape: 'samosa', c: ['#D49A43', '#EFCB80'], spice: 2, w: '4 pcs', p: 5000, tags: ['tea', 'spicy'] }),
  'Kathi Roll': S('Kathi Roll', { temp: 'HOT', cat: 'fried', shape: 'roll', c: ['#E8C276', '#C2402E'], spice: 2, w: '1 roll', p: 9000, tags: ['spicy', 'movie'] }),
  'Jhal Muri': S('Jhal Muri', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#F1E2B8', '#C2402E'], spice: 2, w: '200 g', p: 6000, tags: ['spicy', 'movie', 'healthy'] }),
  Rosogolla: S('Rosogolla', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#FBF4E6', '#E6D3B0'], spice: 0, w: '6 pcs', p: 18000, tags: ['sweet', 'childhood'] }),
  Sandesh: S('Sandesh', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#F6E7C9', '#E3A93A'], spice: 0, w: '6 pcs', p: 20000, tags: ['sweet', 'new'] }),
  'Pyaaz Kachori': S('Pyaaz Kachori', { temp: 'HOT', cat: 'fried', shape: 'ball', c: ['#C6862F', '#A8572A'], spice: 2, w: '2 pcs', p: 7000, tags: ['spicy'] }),
  'Mirchi Vada': S('Mirchi Vada', { temp: 'HOT', cat: 'fried', shape: 'bajji', c: ['#D49A43', '#3F7D20'], spice: 3, w: '2 pcs', p: 6000, tags: ['spicy'] }),
  Ghewar: S('Ghewar', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#F1C76A', '#E9E2CF'], spice: 0, w: '1 pc', p: 28000, tags: ['sweet', 'festive', 'new'] }),
  'Mawa Kachori': S('Mawa Kachori', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#D9A44E', '#F6EBD6'], spice: 0, w: '4 pcs', p: 20000, tags: ['sweet', 'festive'] }),
  'Fafda Jalebi': S('Fafda Jalebi', { temp: 'HOT', cat: 'fried', shape: 'spiral', c: ['#F28C1B', '#FFC94D'], spice: 0, w: '250 g', p: 12000, tags: ['sweet', 'tea'] }),
  Dhokla: S('Dhokla', { temp: 'AMBIENT', cat: 'baked', shape: 'square', c: ['#F3D35A', '#3F7D20'], spice: 1, w: '8 pcs', p: 9000, tags: ['healthy', 'tea'] }),
  Khakhra: S('Khakhra', { temp: 'AMBIENT', cat: 'baked', shape: 'disc', c: ['#D9AE62', '#A8743A'], spice: 1, w: '200 g', p: 10000, tags: ['healthy', 'crunch'] }),
  Thepla: S('Thepla', { temp: 'AMBIENT', cat: 'baked', shape: 'disc', c: ['#D8B66A', '#7A9E3B'], spice: 1, w: '6 pcs', p: 9000, tags: ['healthy'] }),
  Khandvi: S('Khandvi', { temp: 'AMBIENT', cat: 'namkeen', shape: 'roll', c: ['#F3D35A', '#3F7D20'], spice: 1, w: '200 g', p: 10000, tags: ['healthy', 'new'] }),
  'Misal Pav': S('Misal Pav', { temp: 'HOT', cat: 'fried', shape: 'bun', c: ['#C2402E', '#E7B76A'], spice: 3, w: '1 plate', p: 9000, tags: ['spicy'] }),
  'Sabudana Vada': S('Sabudana Vada', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#E7C782', '#7A9E3B'], spice: 1, w: '4 pcs', p: 7000, tags: ['tea'] }),
  Bakarwadi: S('Bakarwadi', { temp: 'AMBIENT', cat: 'namkeen', shape: 'spiral', c: ['#B9752C', '#E8C478'], spice: 2, w: '250 g', p: 13000, tags: ['crunch', 'movie'] }),
  'Puran Poli': S('Puran Poli', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#E7B04C', '#C9752A'], spice: 0, w: '4 pcs', p: 16000, tags: ['sweet', 'festive'] }),
  'Banana Chips': S('Banana Chips', { temp: 'AMBIENT', cat: 'namkeen', shape: 'chips', c: ['#F3D35A', '#D9A21E'], spice: 0, w: '200 g', p: 9000, tags: ['crunch', 'movie', 'childhood'] }),
  Jalebi: S('Jalebi', { temp: 'HOT', cat: 'sweet', shape: 'spiral', c: ['#F28C1B', '#FFC94D'], spice: 0, w: '250 g', p: 9000, tags: ['sweet', 'festive'] }),
  'Bikaneri Bhujia': S('Bikaneri Bhujia', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#E2B866', '#C08A3E'], spice: 2, w: '250 g', p: 10000, tags: ['crunch', 'movie'] }),
};

const CITIES = [
  { id: 'guntur', name: 'Guntur', state: 'Andhra Pradesh', lat: 16.3067, lng: 80.4365 },
  { id: 'vijayawada', name: 'Vijayawada', state: 'Andhra Pradesh', lat: 16.5062, lng: 80.648 },
  { id: 'visakhapatnam', name: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.6868, lng: 83.2185 },
  { id: 'hyderabad', name: 'Hyderabad', state: 'Telangana', lat: 17.385, lng: 78.4867 },
  { id: 'bengaluru', name: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946 },
  { id: 'chennai', name: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707 },
  { id: 'mumbai', name: 'Mumbai', state: 'Maharashtra', lat: 19.076, lng: 72.8777 },
  { id: 'delhi', name: 'Delhi', state: 'Delhi', lat: 28.6139, lng: 77.209 },
  { id: 'kolkata', name: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639 },
  { id: 'jaipur', name: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873 },
  { id: 'ahmedabad', name: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714 },
  { id: 'pune', name: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567 },
];

// [neighbourhood, signature, offset lat, offset lng, product names]
const SHOPS = {
  guntur: [
    ['Brodipet', 'Mirchi Corner', 0.004, -0.003, ['Mirchi Bajji', 'Punugulu', 'Bonda', 'Chekkalu', 'Atukula Mixture']],
    ['Arundelpet', 'Ariselu House', -0.006, 0.004, ['Ariselu', 'Boondi Laddu', 'Chekkalu', 'Kaja', 'Banana Chips']],
    ['Lakshmipuram', 'Punugulu Point', 0.008, 0.007, ['Punugulu', 'Mirchi Bajji', 'Medu Vada', 'Sunnundalu', 'Murukku']],
    ['Kothapet', 'Laddu Bandi', -0.003, -0.009, ['Boondi Laddu', 'Pootharekulu', 'Bobbatlu', 'Jalebi', 'Murukku']],
  ],
  vijayawada: [
    ['Benz Circle', 'Gongura Kitchen', 0.005, 0.002, ['Gongura Pakoda', 'Mirchi Bajji', 'Punugulu', 'Kaja', 'Atukula Mixture']],
    ['Governorpet', 'Pootharekulu Mane', -0.004, -0.005, ['Pootharekulu', 'Bobbatlu', 'Kaja', 'Ariselu', 'Chekkalu']],
  ],
  visakhapatnam: [
    ['Dwaraka Nagar', 'Bonda Bazaar', 0.004, 0.003, ['Mirchi Bajji', 'Bonda', 'Punugulu', 'Atukula Mixture', 'Banana Chips']],
    ['MVP Colony', 'Sunnundalu Store', -0.005, 0.004, ['Sunnundalu', 'Atukula Mixture', 'Boondi Laddu', 'Kaja', 'Pootharekulu']],
  ],
  hyderabad: [
    ['Abids', 'Irani Bakery', 0.003, -0.004, ['Irani Samosa', 'Luqmi', 'Osmania Biscuit', 'Dilkush', 'Samosa']],
    ['Himayatnagar', 'Biscuit Bhandar', -0.006, 0.005, ['Osmania Biscuit', 'Dilkush', 'Khari Biscuit', 'Irani Samosa', 'Jalebi']],
  ],
  bengaluru: [
    ['Basavanagudi', 'Vada Darshini', 0.004, 0.003, ['Maddur Vada', 'Medu Vada', 'Nippattu', 'Kodubale', 'Mysore Pak']],
    ['Malleswaram', 'Mysore Pak Mane', -0.005, -0.003, ['Mysore Pak', 'Kodubale', 'Nippattu', 'Murukku', 'Banana Chips']],
  ],
  chennai: [
    ['Mylapore', 'Vada Kadai', 0.004, -0.003, ['Medu Vada', 'Sundal', 'Murukku', 'Adhirasam', 'Seedai']],
    ['T Nagar', 'Murukku Shop', -0.004, 0.005, ['Murukku', 'Adhirasam', 'Seedai', 'Banana Chips', 'Mysore Pak']],
  ],
  mumbai: [
    ['Dadar', 'Vada Pav Stall', 0.003, 0.003, ['Vada Pav', 'Batata Vada', 'Misal Pav', 'Chikki', 'Khari Biscuit']],
    ['Girgaon', 'Chikki Wala', -0.005, -0.004, ['Chikki', 'Khari Biscuit', 'Bakarwadi', 'Batata Vada', 'Puran Poli']],
  ],
  delhi: [
    ['Chandni Chowk', 'Tikki Gali', 0.004, -0.004, ['Aloo Tikki', 'Kachori', 'Samosa', 'Jalebi', 'Sohan Halwa']],
    ['Karol Bagh', 'Halwa Haveli', -0.005, 0.004, ['Sohan Halwa', 'Samosa', 'Kachori', 'Bikaneri Bhujia', 'Jalebi']],
  ],
  kolkata: [
    ['Gariahat', 'Singara Ghar', 0.003, 0.004, ['Singara', 'Kathi Roll', 'Jhal Muri', 'Rosogolla', 'Sandesh']],
    ['Shyambazar', 'Mishti Mahal', -0.004, -0.004, ['Rosogolla', 'Sandesh', 'Jhal Muri', 'Singara', 'Banana Chips']],
  ],
  jaipur: [
    ['Johari Bazaar', 'Kachori Kona', 0.004, 0.003, ['Pyaaz Kachori', 'Mirchi Vada', 'Ghewar', 'Mawa Kachori', 'Bikaneri Bhujia']],
    ['Bapu Bazaar', 'Ghewar Gali', -0.005, -0.004, ['Ghewar', 'Mawa Kachori', 'Bikaneri Bhujia', 'Pyaaz Kachori', 'Mirchi Vada']],
  ],
  ahmedabad: [
    ['Manek Chowk', 'Fafda Farsan', 0.003, -0.004, ['Fafda Jalebi', 'Dhokla', 'Khakhra', 'Thepla', 'Khandvi']],
    ['Navrangpura', 'Khakhra Ghar', -0.004, 0.004, ['Khakhra', 'Thepla', 'Dhokla', 'Khandvi', 'Chikki']],
  ],
  pune: [
    ['Sadashiv Peth', 'Misal Adda', 0.004, 0.003, ['Misal Pav', 'Sabudana Vada', 'Bakarwadi', 'Puran Poli', 'Vada Pav']],
    ['Deccan', 'Bakarwadi Bhavan', -0.005, -0.003, ['Bakarwadi', 'Puran Poli', 'Chikki', 'Sabudana Vada', 'Misal Pav']],
  ],
};

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const UI_COLLECTIONS = (d) => {
  const out = [];
  if (d.spice >= 2) out.push('spicy');
  if (d.shape === 'chips') out.push('chips');
  if (d.cat === 'sweet') out.push('sweets');
  if (d.shape === 'pile' && d.cat === 'namkeen') out.push('mixtures');
  if (d.tags.includes('tea')) out.push('tea-time');
  if (d.tags.includes('healthy')) out.push('healthy');
  if (d.tags.includes('festive')) out.push('festive');
  if (d.tags.includes('new')) out.push('regional');
  return out;
};

// Small deterministic PRNG so the demo data is the same on every load
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function buildSeed() {
  const rand = rng(42);
  const sellers = [];
  const products = [];
  let pid = 1;
  let sid = 1;
  for (const city of CITIES) {
    SHOPS[city.id].forEach(([hood, sig, dLat, dLng, names], idx) => {
      const id = sid++;
      let status = 'active';
      if (city.id === 'jaipur' && idx === 1) status = 'suspended';
      if (city.id === 'pune' && idx === 1) status = 'pending';
      if (city.id === 'hyderabad' && idx === 1) status = 'probation';
      const seller = {
        id,
        userId: 1000 + id,
        shopName: `${hood} ${sig}`,
        cityId: city.id,
        city: city.name,
        region: city.state,
        lat: +(city.lat + dLat).toFixed(6),
        lng: +(city.lng + dLng).toFixed(6),
        radiusKm: 5,
        busyExtraMin: city.id === 'guntur' && idx === 2 ? 6 : 0,
        paused: false,
        status,
        licenceNo: `FAKE-FSSAI-${String(10000000 + id * 7919).slice(0, 8)}`,
        licenceExpiresOn: idx === 0 && city.id === 'vijayawada' ? '2026-11-15' : '2027-08-31',
        qualityScore: status === 'probation' ? 78 : Math.round(80 + rand() * 18),
        rating: +(4 + rand() * 0.9).toFixed(1),
        acceptanceRate: +(0.88 + rand() * 0.11).toFixed(2),
        openHours: '08:00-22:00',
        verified: ['active', 'probation'].includes(status),
        isNew: status === 'probation',
      };
      sellers.push(seller);
      names.forEach((name, j) => {
        const d = SNACKS[name];
        const slug = slugify(name);
        const price = Math.round((d.p * (0.9 + rand() * 0.25)) / 500) * 500;
        const discounted = rand() < 0.35;
        let stock = 8 + Math.floor(rand() * 30);
        if (city.id === 'guntur' && idx === 0 && name === 'Mirchi Bajji') stock = 3;
        if (city.id === 'guntur' && idx === 1 && j === 4) stock = 0;
        if (rand() < 0.08) stock = 1 + Math.floor(rand() * 3);
        products.push({
          id: pid++,
          sellerId: id,
          slug,
          title: name,
          category: d.cat,
          region: city.state,
          city: city.name,
          servingTemp: d.temp,
          prepMinutes: d.temp === 'HOT' ? 10 : 4,
          pricePaise: price,
          mrpPaise: discounted ? Math.round((price * 1.18) / 500) * 500 : null,
          weight: d.w,
          spice: d.spice,
          rating: +(3.9 + rand() * 1).toFixed(1),
          ratingCount: 40 + Math.floor(rand() * 900),
          stock,
          active: true,
          bestseller: rand() < 0.22,
          trending: rand() < 0.15,
          tags: d.tags,
          collections: UI_COLLECTIONS(d),
          art: { shape: d.shape, colors: d.c },
          imageAlt: `${name}, ${city.state} style (AI illustration placeholder)`,
          description: describe(name, d, city),
          attrs: { allergens: allergensFor(d), vegetarian: true },
        });
      });
    });
  }

  const riders = [];
  let rid = 1;
  for (const city of CITIES) {
    const n = city.id === 'guntur' ? 6 : 3;
    for (let i = 0; i < n; i++) {
      riders.push({
        id: rid,
        userId: 2000 + rid,
        name: RIDER_NAMES[(rid - 1) % RIDER_NAMES.length],
        cityId: city.id,
        vehicle: i % 3 === 0 ? 'EV scooter' : 'Scooter',
        status: city.id === 'guntur' && i === 5 ? 'OFFLINE' : 'ONLINE',
        lat: +(city.lat + (rand() - 0.5) * 0.02).toFixed(6),
        lng: +(city.lng + (rand() - 0.5) * 0.02).toFixed(6),
        rating: +(4.3 + rand() * 0.6).toFixed(1),
        onTimeRate: +(0.82 + rand() * 0.16).toFixed(2),
      });
      rid++;
    }
  }

  const addresses = [
    { id: 1, label: 'Home', line: '12-4-7, Brodipet 4th Lane, Guntur (demo)', cityId: 'guntur', lat: 16.3152, lng: 80.4301 },
    { id: 2, label: 'Work', line: 'Plot 22, Arundelpet Main Rd, Guntur (demo)', cityId: 'guntur', lat: 16.2985, lng: 80.4452 },
    { id: 3, label: 'Parents', line: 'Benz Circle, Vijayawada (demo)', cityId: 'vijayawada', lat: 16.4995, lng: 80.6561 },
    { id: 4, label: 'Hostel', line: 'Basavanagudi, Bengaluru (demo)', cityId: 'bengaluru', lat: 12.9801, lng: 77.5899 },
  ];

  return {
    cities: CITIES,
    sellers,
    products,
    riders,
    addresses,
    users: [
      { id: 1, name: 'Ananya (demo customer)', email: 'customer1@example.test', role: 'customer' },
      { id: 1001, name: 'Ravi (demo seller)', email: 'seller1@example.test', role: 'seller', sellerId: 1 },
      { id: 2001, name: RIDER_NAMES[0] + ' (demo rider)', email: 'rider1@example.test', role: 'rider', riderId: 1 },
      { id: 9001, name: 'Ops admin (demo)', email: 'admin@example.test', role: 'admin' },
    ],
  };
}

const RIDER_NAMES = ['Suresh K', 'Lakshmi P', 'Imran S', 'Divya R', 'Arjun M', 'Kavya T', 'Naveen B', 'Farah A', 'Gopal V', 'Meena J', 'Rahul D', 'Sana Q'];

function allergensFor(d) {
  const a = [];
  if (['fried', 'namkeen'].includes(d.cat)) a.push('gram flour');
  if (d.cat === 'sweet') a.push('milk', 'ghee');
  if (d.cat === 'baked') a.push('wheat');
  if (d.shape === 'pile') a.push('peanuts');
  return a;
}

function describe(name, d, city) {
  const temp = d.temp === 'HOT' ? 'Fried to order and sent out hot' : 'Packed fresh, travels well';
  const flavour = d.spice >= 3 ? 'fiery and bold' : d.spice === 2 ? 'spiced and savoury' : d.cat === 'sweet' ? 'sweet and rich' : 'mild and crunchy';
  return `${name} the way ${city.name} makes it: ${flavour}. ${temp}.`;
}
