// UI categories from the master prompt (part 6). Products carry these as `collections`.
export const CATEGORIES = [
  { id: 'all', label: 'All snacks' },
  { id: 'spicy', label: 'Spicy Snacks' },
  { id: 'chips', label: 'Crispy Chips' },
  { id: 'sweets', label: 'Traditional Sweets' },
  { id: 'mixtures', label: 'Savoury Mixtures' },
  { id: 'tea-time', label: 'Tea-Time Snacks' },
  { id: 'healthy', label: 'Healthy Munchies' },
  { id: 'regional', label: 'Regional Specialities' },
  { id: 'festive', label: 'Festive Treats' },
];

// Mood tiles (master prompt part 10)
export const MOODS = [
  { id: 'spicy', photo: 'story-andhra-bold-flavours', label: 'Need Something Spicy', test: (p) => p.spice >= 2, art: { shape: 'bajji', colors: ['#E8A23A', '#3F7D20'] }, tint: 'from-red/20 to-orange/10' },
  { id: 'sweet', photo: 'snack-boondi-laddu', label: 'Sweet Cravings', test: (p) => p.category === 'sweet', art: { shape: 'ball', colors: ['#F2A516', '#FFD36B'] }, tint: 'from-sun/30 to-orange/10' },
  { id: 'tea', photo: 'snack-murukku', label: 'Tea-Time Crunch', test: (p) => p.tags.includes('tea'), art: { shape: 'spiral', colors: ['#D9A44E', '#B37A2E'] }, tint: 'from-orange/20 to-sun/10' },
  { id: 'movie', photo: 'snack-banana-chips', label: 'Movie-Night Munchies', test: (p) => p.tags.includes('movie') || p.tags.includes('crunch'), art: { shape: 'chips', colors: ['#F3D35A', '#D9A21E'] }, tint: 'from-sun/25 to-red/10' },
  { id: 'childhood', photo: 'snack-jalebi', label: 'Childhood Favourites', test: (p) => p.tags.includes('childhood'), art: { shape: 'biscuit', colors: ['#E2B866', '#C08A3E'] }, tint: 'from-orange/15 to-sun/20' },
  { id: 'new', photo: 'snack-khakhra', label: 'Explore Something New', test: (p) => p.tags.includes('new'), art: { shape: 'wrap', colors: ['#F6EBD6', '#C9852F'] }, tint: 'from-red/15 to-sun/15' },
];

// Regional collections (master prompt part 5). Accent colours are decorative only.
// photo: an AI image that really shows one of the region's snacks; the drawing is used without one.
export const REGIONS = [
  { id: 'Andhra Pradesh', photo: 'snack-gongura-pakoda', blurb: 'Bold, chilli-forward and proudly fiery.', snacks: 'Mirchi bajji, punugulu, pootharekulu', accent: '#E23744', art: { shape: 'bajji', colors: ['#E8A23A', '#3F7D20'] } },
  { id: 'Telangana', photo: 'snack-samosa', blurb: 'Irani cafe classics and crunchy savouries.', snacks: 'Irani samosa, Osmania biscuit, luqmi', accent: '#FF7A00', art: { shape: 'samosa', colors: ['#D8A04A', '#F1CF85'] } },
  { id: 'Tamil Nadu', photo: 'snack-murukku', blurb: 'Rice-flour crunch and temple-town sweets.', snacks: 'Murukku, seedai, adhirasam', accent: '#E86A00', art: { shape: 'spiral', colors: ['#D9A44E', '#B37A2E'] } },
  { id: 'Karnataka', blurb: 'Ghee, roasted gram and Mysore pride.', snacks: 'Mysore pak, nippattu, kodubale', accent: '#FFC300', art: { shape: 'square', colors: ['#F0B43C', '#C47A1E'] } },
  { id: 'Maharashtra', blurb: 'Street-side heat and sesame sweetness.', snacks: 'Vada pav, bakarwadi, chikki', accent: '#C4222F', art: { shape: 'bun', colors: ['#E7B76A', '#3F7D20'] } },
  { id: 'Gujarat', photo: 'snack-khakhra', blurb: 'Light, steamed and gently sweet-sour.', snacks: 'Dhokla, khakhra, fafda jalebi', accent: '#FFC300', art: { shape: 'square', colors: ['#F3D35A', '#3F7D20'] } },
  { id: 'Rajasthan', photo: 'snack-bikaneri-bhujia', blurb: 'Desert-hardy namkeen and festive ghewar.', snacks: 'Pyaaz kachori, bhujia, ghewar', accent: '#E86A00', art: { shape: 'ball', colors: ['#C6862F', '#A8572A'] } },
  { id: 'West Bengal', photo: 'snack-singara', blurb: 'Mustard-sharp street bites and soft mishti.', snacks: 'Jhal muri, singara, rosogolla', accent: '#E23744', art: { shape: 'pile', colors: ['#F1E2B8', '#C2402E'] } },
  { id: 'Delhi', photo: 'snack-jalebi', blurb: 'Chaat-lane tikkis and old-city halwa.', snacks: 'Aloo tikki, kachori, sohan halwa', accent: '#FF7A00', art: { shape: 'disc', colors: ['#C98431', '#3F7D20'] } },
];
