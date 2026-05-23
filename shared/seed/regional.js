/**
 * More regional snacks for the demo catalogue: the Telugu states, Tamil Nadu, Karnataka,
 * Kerala and Maharashtra. Everything is fake demo data like seed.js: fictional shop names,
 * approximate city centres, prices in paise. Shops are added after the original ones so
 * the ids and built-in test cases in seed.js never move.
 */
const S = (title, o) => ({ title, ...o });

// temp HOT (fried to order) or AMBIENT; cat sweet | fried | baked | namkeen; shape and two
// colours draw the fallback illustration; spice 0 to 3; w is the pack size; p the base price
export const MORE_SNACKS = {
  // ---------- Telangana
  Sakinalu: S('Sakinalu', { temp: 'AMBIENT', cat: 'namkeen', shape: 'spiral', c: ['#EBD7A8', '#C9A15A'], spice: 1, w: '250 g', p: 13000, tags: ['crunch', 'festive', 'new'] }),
  'Sarva Pindi': S('Sarva Pindi', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#C98B3F', '#4E7A2A'], spice: 2, w: '2 pcs', p: 7000, tags: ['spicy', 'new'] }),
  Malidalu: S('Malidalu', { temp: 'AMBIENT', cat: 'sweet', shape: 'pile', c: ['#C68A3E', '#8A5A2B'], spice: 0, w: '250 g', p: 16000, tags: ['sweet', 'festive', 'new'] }),
  Chegodilu: S('Chegodilu', { temp: 'AMBIENT', cat: 'namkeen', shape: 'vada', c: ['#D9A44E', '#B0702C'], spice: 2, w: '250 g', p: 12000, tags: ['crunch', 'tea'] }),
  'Karam Boondi': S('Karam Boondi', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#D9772A', '#7A9E3B'], spice: 3, w: '250 g', p: 10000, tags: ['spicy', 'crunch', 'movie'] }),
  'Ullipaya Pakodi': S('Ullipaya Pakodi', { temp: 'HOT', cat: 'fried', shape: 'pile', c: ['#B8732E', '#E0A54B'], spice: 2, w: '200 g', p: 6000, tags: ['spicy', 'tea'] }),
  'Double Ka Meetha': S('Double Ka Meetha', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#B5651D', '#F3D9A4'], spice: 0, w: '250 g', p: 18000, tags: ['sweet', 'festive'] }),
  'Qubani Ka Meetha': S('Qubani Ka Meetha', { temp: 'AMBIENT', cat: 'sweet', shape: 'pile', c: ['#C2602A', '#F6E7C9'], spice: 0, w: '250 g', p: 22000, tags: ['sweet', 'festive', 'new'] }),
  'Badam Ki Jali': S('Badam Ki Jali', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#F6EBD6', '#D9B77A'], spice: 0, w: '200 g', p: 26000, tags: ['sweet', 'new'] }),
  'Dum Ke Roat': S('Dum Ke Roat', { temp: 'AMBIENT', cat: 'baked', shape: 'biscuit', c: ['#D9A44E', '#9A6A2E'], spice: 0, w: '300 g', p: 14000, tags: ['tea', 'new'] }),
  'Fruit Biscuit': S('Fruit Biscuit', { temp: 'AMBIENT', cat: 'baked', shape: 'biscuit', c: ['#E6C27A', '#D9493A'], spice: 0, w: '300 g', p: 15000, tags: ['tea', 'childhood'] }),
  'Veg Puff': S('Veg Puff', { temp: 'AMBIENT', cat: 'baked', shape: 'square', c: ['#E2B866', '#C08A3E'], spice: 1, w: '2 pcs', p: 6000, tags: ['tea', 'childhood'] }),

  // ---------- Andhra Pradesh
  'Rava Laddu': S('Rava Laddu', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#F3E2B5', '#E3B04B'], spice: 0, w: '6 pcs', p: 14000, tags: ['sweet', 'festive'] }),
  'Kobbari Laddu': S('Kobbari Laddu', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#F6EFE0', '#C9A15A'], spice: 0, w: '6 pcs', p: 15000, tags: ['sweet', 'festive'] }),
  'Putnala Laddu': S('Putnala Laddu', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#D9B26A', '#A8743A'], spice: 0, w: '6 pcs', p: 13000, tags: ['sweet', 'healthy'] }),
  'Nuvvula Undalu': S('Nuvvula Undalu', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#6E4A2A', '#E8D9B8'], spice: 0, w: '8 pcs', p: 14000, tags: ['sweet', 'healthy', 'festive'] }),
  'Thokkudu Laddu': S('Thokkudu Laddu', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#C68A3E', '#8A5A2B'], spice: 0, w: '6 pcs', p: 18000, tags: ['sweet', 'festive', 'new'] }),
  Chalimidi: S('Chalimidi', { temp: 'AMBIENT', cat: 'sweet', shape: 'pile', c: ['#C9A06A', '#F2E3C2'], spice: 0, w: '250 g', p: 12000, tags: ['sweet', 'festive', 'new'] }),
  'Minapa Garelu': S('Minapa Garelu', { temp: 'HOT', cat: 'fried', shape: 'vada', c: ['#C88A3A', '#EDC27A'], spice: 1, w: '4 pcs', p: 6000, tags: ['tea', 'festive'] }),
  'Pesara Punukulu': S('Pesara Punukulu', { temp: 'HOT', cat: 'fried', shape: 'ball', c: ['#B98A3A', '#6E8E33'], spice: 2, w: '12 pcs', p: 5500, tags: ['spicy', 'tea', 'healthy'] }),
  'Mokkajonna Vada': S('Mokkajonna Vada', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#E0A54B', '#F3D35A'], spice: 1, w: '4 pcs', p: 6500, tags: ['tea', 'new'] }),
  Ponganalu: S('Ponganalu', { temp: 'HOT', cat: 'fried', shape: 'ball', c: ['#E7C782', '#B0702C'], spice: 1, w: '8 pcs', p: 6000, tags: ['tea', 'childhood'] }),
  'Jeedipappu Pakodi': S('Jeedipappu Pakodi', { temp: 'HOT', cat: 'fried', shape: 'pile', c: ['#C9862F', '#F1E2B8'], spice: 2, w: '200 g', p: 12000, tags: ['spicy', 'festive', 'new'] }),
  'Madatha Kaja': S('Madatha Kaja', { temp: 'AMBIENT', cat: 'sweet', shape: 'roll', c: ['#E9A23B', '#FFE09A'], spice: 0, w: '250 g', p: 17000, tags: ['sweet', 'festive'] }),
  Kajjikayalu: S('Kajjikayalu', { temp: 'AMBIENT', cat: 'sweet', shape: 'wrap', c: ['#E2B866', '#B5651D'], spice: 0, w: '6 pcs', p: 16000, tags: ['sweet', 'festive'] }),
  'Bellam Gavvalu': S('Bellam Gavvalu', { temp: 'AMBIENT', cat: 'sweet', shape: 'pile', c: ['#9A5A2A', '#D9A44E'], spice: 0, w: '250 g', p: 12000, tags: ['sweet', 'childhood'] }),
  'Bandar Laddu': S('Bandar Laddu', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#F2A516', '#D9772A'], spice: 0, w: '6 pcs', p: 18000, tags: ['sweet', 'festive', 'new'] }),
  Janthikalu: S('Janthikalu', { temp: 'AMBIENT', cat: 'namkeen', shape: 'spiral', c: ['#E4B866', '#B07A43'], spice: 1, w: '250 g', p: 11000, tags: ['crunch', 'tea'] }),
  'Sanna Karapusa': S('Sanna Karapusa', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#E8B04C', '#C2402E'], spice: 2, w: '250 g', p: 10000, tags: ['spicy', 'crunch', 'movie'] }),
  Chakodi: S('Chakodi', { temp: 'AMBIENT', cat: 'namkeen', shape: 'vada', c: ['#D9A44E', '#9A5A2A'], spice: 2, w: '250 g', p: 11000, tags: ['crunch', 'tea'] }),

  // ---------- Tamil Nadu
  Thattai: S('Thattai', { temp: 'AMBIENT', cat: 'namkeen', shape: 'disc', c: ['#D9A44E', '#7A9E3B'], spice: 1, w: '250 g', p: 11000, tags: ['crunch', 'tea', 'festive'] }),
  'Ribbon Pakoda': S('Ribbon Pakoda', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#E0A54B', '#B5462A'], spice: 2, w: '250 g', p: 11000, tags: ['crunch', 'movie'] }),
  Thenkuzhal: S('Thenkuzhal', { temp: 'AMBIENT', cat: 'namkeen', shape: 'spiral', c: ['#F0DFB0', '#D9B26A'], spice: 0, w: '250 g', p: 11000, tags: ['crunch', 'tea'] }),
  'Kai Murukku': S('Kai Murukku', { temp: 'AMBIENT', cat: 'namkeen', shape: 'spiral', c: ['#E8D3A0', '#B37A2E'], spice: 0, w: '250 g', p: 14000, tags: ['crunch', 'festive', 'new'] }),
  'Mullu Murukku': S('Mullu Murukku', { temp: 'AMBIENT', cat: 'namkeen', shape: 'spiral', c: ['#E4C27A', '#A8743A'], spice: 1, w: '250 g', p: 12000, tags: ['crunch', 'tea'] }),
  'Kara Sev': S('Kara Sev', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#D98A2B', '#7A4A1E'], spice: 3, w: '250 g', p: 10000, tags: ['spicy', 'crunch', 'movie'] }),
  Omapodi: S('Omapodi', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#F1D58A', '#C9A15A'], spice: 0, w: '200 g', p: 9000, tags: ['crunch', 'childhood'] }),
  'Madras Mixture': S('Madras Mixture', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#E2B866', '#C2402E'], spice: 2, w: '250 g', p: 11000, tags: ['spicy', 'crunch', 'movie'] }),
  'Paruppu Vadai': S('Paruppu Vadai', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#C88A3A', '#4E7A2A'], spice: 2, w: '4 pcs', p: 6000, tags: ['spicy', 'tea'] }),
  'Milagu Vadai': S('Milagu Vadai', { temp: 'AMBIENT', cat: 'fried', shape: 'disc', c: ['#8A5A2B', '#C9862F'], spice: 2, w: '6 pcs', p: 9000, tags: ['spicy', 'new'] }),
  'Keerai Vadai': S('Keerai Vadai', { temp: 'HOT', cat: 'fried', shape: 'vada', c: ['#B8732E', '#3F7D20'], spice: 1, w: '4 pcs', p: 6000, tags: ['healthy', 'tea'] }),
  'Vazhakkai Bajji': S('Vazhakkai Bajji', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#E0A54B', '#F1E2B8'], spice: 1, w: '6 pcs', p: 5500, tags: ['tea', 'childhood'] }),
  'Kuzhi Paniyaram': S('Kuzhi Paniyaram', { temp: 'HOT', cat: 'fried', shape: 'ball', c: ['#D9A44E', '#3F7D20'], spice: 1, w: '8 pcs', p: 6500, tags: ['tea', 'healthy'] }),
  'Masala Kadalai': S('Masala Kadalai', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#C2602A', '#E0A54B'], spice: 3, w: '200 g', p: 8000, tags: ['spicy', 'crunch', 'movie'] }),
  'Seepu Seedai': S('Seepu Seedai', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#F0DFB0', '#C9A15A'], spice: 0, w: '250 g', p: 12000, tags: ['crunch', 'festive', 'new'] }),
  'Tirunelveli Halwa': S('Tirunelveli Halwa', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#8A2E1E', '#C2602A'], spice: 0, w: '250 g', p: 22000, tags: ['sweet', 'festive'] }),
  'Kadalai Mittai': S('Kadalai Mittai', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#B9752C', '#E8C478'], spice: 0, w: '200 g', p: 8000, tags: ['sweet', 'healthy', 'childhood'] }),
  Palkova: S('Palkova', { temp: 'AMBIENT', cat: 'sweet', shape: 'pile', c: ['#E9D3A8', '#B5651D'], spice: 0, w: '250 g', p: 20000, tags: ['sweet', 'festive'] }),
  Badusha: S('Badusha', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#E2B866', '#B5651D'], spice: 0, w: '6 pcs', p: 15000, tags: ['sweet', 'festive'] }),
  'Thengai Burfi': S('Thengai Burfi', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#FBF4E6', '#E6D3B0'], spice: 0, w: '250 g', p: 16000, tags: ['sweet', 'festive'] }),
  'Thengai Mittai': S('Thengai Mittai', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#F3A6B8', '#FBF4E6'], spice: 0, w: '200 g', p: 9000, tags: ['sweet', 'childhood'] }),
  Kozhukattai: S('Kozhukattai', { temp: 'AMBIENT', cat: 'sweet', shape: 'wrap', c: ['#FBF4E6', '#8A5A2B'], spice: 0, w: '6 pcs', p: 12000, tags: ['sweet', 'festive', 'healthy'] }),
  'Sweet Somas': S('Sweet Somas', { temp: 'AMBIENT', cat: 'sweet', shape: 'wrap', c: ['#E2B866', '#C9A15A'], spice: 0, w: '6 pcs', p: 14000, tags: ['sweet', 'festive'] }),
  'Ellu Urundai': S('Ellu Urundai', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#3A2A1E', '#C9A15A'], spice: 0, w: '8 pcs', p: 13000, tags: ['sweet', 'healthy'] }),
  'Pori Urundai': S('Pori Urundai', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#F6EBD6', '#B5651D'], spice: 0, w: '6 pcs', p: 9000, tags: ['sweet', 'childhood', 'festive'] }),
  'Maa Laddu': S('Maa Laddu', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#E3B04B', '#C68A3E'], spice: 0, w: '6 pcs', p: 14000, tags: ['sweet', 'festive'] }),
  'Vella Seedai': S('Vella Seedai', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#8A4B1F', '#C98B4A'], spice: 0, w: '250 g', p: 12000, tags: ['sweet', 'festive', 'new'] }),
  'Sathu Maavu Urundai': S('Sathu Maavu Urundai', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#B07A43', '#E8D3A0'], spice: 0, w: '6 pcs', p: 15000, tags: ['sweet', 'healthy', 'new'] }),

  // ---------- Karnataka
  'Mangalore Buns': S('Mangalore Buns', { temp: 'HOT', cat: 'fried', shape: 'bun', c: ['#E7B76A', '#B5651D'], spice: 0, w: '2 pcs', p: 6000, tags: ['tea', 'childhood', 'new'] }),
  'Goli Baje': S('Goli Baje', { temp: 'HOT', cat: 'fried', shape: 'ball', c: ['#D9A44E', '#F1CF85'], spice: 1, w: '8 pcs', p: 5500, tags: ['tea'] }),
  Pathrode: S('Pathrode', { temp: 'HOT', cat: 'fried', shape: 'roll', c: ['#5E6E2A', '#C2602A'], spice: 2, w: '6 pcs', p: 8000, tags: ['spicy', 'new'] }),
  'Kayi Kadubu': S('Kayi Kadubu', { temp: 'AMBIENT', cat: 'sweet', shape: 'wrap', c: ['#FBF4E6', '#B5651D'], spice: 0, w: '6 pcs', p: 12000, tags: ['sweet', 'festive'] }),
  'Kesari Bath': S('Kesari Bath', { temp: 'HOT', cat: 'sweet', shape: 'pile', c: ['#F28C1B', '#FFC94D'], spice: 0, w: '1 cup', p: 5000, tags: ['sweet', 'childhood'] }),
  'Khara Bath': S('Khara Bath', { temp: 'HOT', cat: 'namkeen', shape: 'pile', c: ['#E0A54B', '#3F7D20'], spice: 2, w: '1 cup', p: 5000, tags: ['spicy', 'tea'] }),
  'Mysore Bonda': S('Mysore Bonda', { temp: 'HOT', cat: 'fried', shape: 'ball', c: ['#C98431', '#F1E2B8'], spice: 1, w: '6 pcs', p: 5500, tags: ['tea', 'childhood'] }),
  'Benne Murukku': S('Benne Murukku', { temp: 'AMBIENT', cat: 'namkeen', shape: 'spiral', c: ['#F3E2B5', '#D9B26A'], spice: 0, w: '250 g', p: 13000, tags: ['crunch', 'tea'] }),
  Chakkuli: S('Chakkuli', { temp: 'AMBIENT', cat: 'namkeen', shape: 'spiral', c: ['#D9A44E', '#9A5A2A'], spice: 1, w: '250 g', p: 12000, tags: ['crunch', 'festive'] }),
  Churumuri: S('Churumuri', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#F1E2B8', '#C2402E'], spice: 2, w: '200 g', p: 6000, tags: ['spicy', 'healthy', 'movie'] }),
  'Avalakki Chivda': S('Avalakki Chivda', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#F3D35A', '#3F7D20'], spice: 1, w: '250 g', p: 9000, tags: ['crunch', 'healthy', 'tea'] }),
  Ambode: S('Ambode', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#B8732E', '#4E7A2A'], spice: 2, w: '4 pcs', p: 6000, tags: ['spicy', 'festive'] }),
  Girmit: S('Girmit', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#E8C46A', '#C2602A'], spice: 2, w: '200 g', p: 6000, tags: ['spicy', 'movie', 'new'] }),
  'Menasinakai Bajji': S('Menasinakai Bajji', { temp: 'HOT', cat: 'fried', shape: 'bajji', c: ['#D49A43', '#3F7D20'], spice: 3, w: '4 pcs', p: 6000, tags: ['spicy', 'tea'] }),
  'Dharwad Peda': S('Dharwad Peda', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#8A4B1F', '#E8D9B8'], spice: 0, w: '250 g', p: 20000, tags: ['sweet', 'festive'] }),
  'Belgaum Kunda': S('Belgaum Kunda', { temp: 'AMBIENT', cat: 'sweet', shape: 'pile', c: ['#7A3E1A', '#C98B4A'], spice: 0, w: '250 g', p: 22000, tags: ['sweet', 'new'] }),
  Karadantu: S('Karadantu', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#6E3B17', '#C9A15A'], spice: 0, w: '250 g', p: 26000, tags: ['sweet', 'healthy', 'new'] }),
  Chiroti: S('Chiroti', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#F6EBD6', '#E8C478'], spice: 0, w: '6 pcs', p: 16000, tags: ['sweet', 'festive'] }),
  'Kobbari Mithai': S('Kobbari Mithai', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#E8C478', '#FBF4E6'], spice: 0, w: '250 g', p: 14000, tags: ['sweet', 'festive'] }),
  Thambittu: S('Thambittu', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#B9752C', '#E8C478'], spice: 0, w: '6 pcs', p: 12000, tags: ['sweet', 'festive', 'healthy'] }),
  'Kayi Holige': S('Kayi Holige', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#E7B04C', '#FBF4E6'], spice: 0, w: '4 pcs', p: 16000, tags: ['sweet', 'festive'] }),
  'Ragi Laddu': S('Ragi Laddu', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#6E4A2A', '#A8743A'], spice: 0, w: '6 pcs', p: 14000, tags: ['sweet', 'healthy'] }),

  // ---------- Kerala
  Unniyappam: S('Unniyappam', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#6E3B17', '#A0612C'], spice: 0, w: '10 pcs', p: 12000, tags: ['sweet', 'festive', 'childhood'] }),
  Achappam: S('Achappam', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#E9C27A', '#C9862F'], spice: 0, w: '200 g', p: 12000, tags: ['sweet', 'crunch', 'festive'] }),
  Kuzhalappam: S('Kuzhalappam', { temp: 'AMBIENT', cat: 'namkeen', shape: 'roll', c: ['#F1DFB0', '#D9B26A'], spice: 0, w: '200 g', p: 12000, tags: ['crunch', 'tea', 'new'] }),
  Neyyappam: S('Neyyappam', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#7A3E1A', '#C98B4A'], spice: 0, w: '6 pcs', p: 12000, tags: ['sweet', 'festive'] }),
  Kalathappam: S('Kalathappam', { temp: 'AMBIENT', cat: 'baked', shape: 'square', c: ['#6E3B17', '#E8C478'], spice: 0, w: '1 cake', p: 14000, tags: ['sweet', 'new'] }),
  Vattayappam: S('Vattayappam', { temp: 'AMBIENT', cat: 'baked', shape: 'disc', c: ['#FBF4E6', '#E8C478'], spice: 0, w: '1 cake', p: 12000, tags: ['sweet', 'healthy'] }),
  'Pazham Pori': S('Pazham Pori', { temp: 'HOT', cat: 'fried', shape: 'roll', c: ['#E0A54B', '#F3D35A'], spice: 0, w: '4 pcs', p: 6000, tags: ['tea', 'childhood'] }),
  'Parippu Vada': S('Parippu Vada', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#C88A3A', '#3F7D20'], spice: 2, w: '4 pcs', p: 5500, tags: ['spicy', 'tea'] }),
  'Ulli Vada': S('Ulli Vada', { temp: 'HOT', cat: 'fried', shape: 'pile', c: ['#B8732E', '#E0A54B'], spice: 2, w: '4 pcs', p: 5500, tags: ['spicy', 'tea'] }),
  'Uzhunnu Vada': S('Uzhunnu Vada', { temp: 'HOT', cat: 'fried', shape: 'vada', c: ['#C88A3A', '#EDC27A'], spice: 1, w: '4 pcs', p: 6000, tags: ['tea'] }),
  'Veg Cutlet': S('Veg Cutlet', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#9A5A2A', '#C98431'], spice: 1, w: '2 pcs', p: 6000, tags: ['tea', 'childhood'] }),
  Sukhiyan: S('Sukhiyan', { temp: 'HOT', cat: 'fried', shape: 'ball', c: ['#C98431', '#3F7D20'], spice: 0, w: '4 pcs', p: 6000, tags: ['sweet', 'tea', 'new'] }),
  'Banana Chips Kerala': null, // placeholder removed below; Banana Chips already exists in seed.js
  'Tapioca Chips': S('Tapioca Chips', { temp: 'AMBIENT', cat: 'namkeen', shape: 'chips', c: ['#F3E2B5', '#C2402E'], spice: 2, w: '200 g', p: 9000, tags: ['crunch', 'movie', 'spicy'] }),
  'Jackfruit Chips': S('Jackfruit Chips', { temp: 'AMBIENT', cat: 'namkeen', shape: 'chips', c: ['#F2B84B', '#D9A21E'], spice: 0, w: '200 g', p: 14000, tags: ['crunch', 'new'] }),
  'Sharkara Varatti': S('Sharkara Varatti', { temp: 'AMBIENT', cat: 'sweet', shape: 'pile', c: ['#8A4B1F', '#D9A21E'], spice: 0, w: '200 g', p: 12000, tags: ['sweet', 'crunch', 'festive'] }),
  'Kerala Mixture': S('Kerala Mixture', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#E2B866', '#C2402E'], spice: 2, w: '250 g', p: 10000, tags: ['spicy', 'crunch', 'movie'] }),
  'Diamond Cuts': S('Diamond Cuts', { temp: 'AMBIENT', cat: 'sweet', shape: 'pile', c: ['#E9D3A8', '#C9A15A'], spice: 0, w: '200 g', p: 9000, tags: ['sweet', 'crunch', 'childhood'] }),
  Kozhukatta: S('Kozhukatta', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#FBF4E6', '#8A5A2B'], spice: 0, w: '6 pcs', p: 11000, tags: ['sweet', 'healthy'] }),
  'Ela Ada': S('Ela Ada', { temp: 'AMBIENT', cat: 'sweet', shape: 'wrap', c: ['#4E7A2A', '#FBF4E6'], spice: 0, w: '4 pcs', p: 12000, tags: ['sweet', 'healthy', 'new'] }),
  'Avalose Podi': S('Avalose Podi', { temp: 'AMBIENT', cat: 'sweet', shape: 'pile', c: ['#D9B26A', '#F3E2B5'], spice: 0, w: '250 g', p: 11000, tags: ['sweet', 'healthy', 'new'] }),
  'Avalose Unda': S('Avalose Unda', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#B07A43', '#E8D3A0'], spice: 0, w: '8 pcs', p: 12000, tags: ['sweet', 'festive'] }),
  'Ari Unda': S('Ari Unda', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#8A5A2B', '#E8C478'], spice: 0, w: '8 pcs', p: 11000, tags: ['sweet', 'childhood'] }),
  Cheeda: S('Cheeda', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#E4B866', '#9A6A2E'], spice: 1, w: '200 g', p: 10000, tags: ['crunch', 'tea'] }),
  'Kozhikode Halwa': S('Kozhikode Halwa', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#C2402E', '#F2B84B'], spice: 0, w: '250 g', p: 18000, tags: ['sweet', 'festive'] }),
  'Pazham Nirachathu': S('Pazham Nirachathu', { temp: 'HOT', cat: 'fried', shape: 'roll', c: ['#E0A54B', '#FBF4E6'], spice: 0, w: '2 pcs', p: 7000, tags: ['sweet', 'new'] }),
  Kinnathappam: S('Kinnathappam', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#8A4B1F', '#C98B4A'], spice: 0, w: '250 g', p: 13000, tags: ['sweet', 'new'] }),
  'Chakka Varatti': S('Chakka Varatti', { temp: 'AMBIENT', cat: 'sweet', shape: 'pile', c: ['#5A2E14', '#B5651D'], spice: 0, w: '250 g', p: 18000, tags: ['sweet', 'festive', 'new'] }),
  Churuttu: S('Churuttu', { temp: 'AMBIENT', cat: 'sweet', shape: 'roll', c: ['#F6EBD6', '#C9A15A'], spice: 0, w: '6 pcs', p: 12000, tags: ['sweet', 'festive'] }),

  // ---------- Maharashtra
  'Kothimbir Vadi': S('Kothimbir Vadi', { temp: 'HOT', cat: 'fried', shape: 'square', c: ['#C88A3A', '#3F7D20'], spice: 2, w: '6 pcs', p: 7000, tags: ['spicy', 'tea'] }),
  'Alu Vadi': S('Alu Vadi', { temp: 'HOT', cat: 'fried', shape: 'roll', c: ['#5E6E2A', '#C98431'], spice: 2, w: '6 pcs', p: 7000, tags: ['spicy', 'tea', 'new'] }),
  Thalipeeth: S('Thalipeeth', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#B07A43', '#3F7D20'], spice: 2, w: '2 pcs', p: 8000, tags: ['spicy', 'healthy'] }),
  Dhapate: S('Dhapate', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#C9A06A', '#7A9E3B'], spice: 1, w: '2 pcs', p: 7000, tags: ['healthy', 'new'] }),
  'Kanda Bhaji': S('Kanda Bhaji', { temp: 'HOT', cat: 'fried', shape: 'pile', c: ['#B8732E', '#E0A54B'], spice: 2, w: '200 g', p: 5500, tags: ['spicy', 'tea'] }),
  'Kanda Poha': S('Kanda Poha', { temp: 'HOT', cat: 'namkeen', shape: 'pile', c: ['#F3D35A', '#3F7D20'], spice: 1, w: '1 plate', p: 5000, tags: ['healthy', 'tea'] }),
  'Sabudana Khichdi': S('Sabudana Khichdi', { temp: 'HOT', cat: 'namkeen', shape: 'pile', c: ['#F6EBD6', '#3F7D20'], spice: 1, w: '1 plate', p: 6000, tags: ['healthy'] }),
  'Pav Bhaji': S('Pav Bhaji', { temp: 'HOT', cat: 'fried', shape: 'bun', c: ['#C2402E', '#E7B76A'], spice: 2, w: '1 plate', p: 11000, tags: ['spicy', 'childhood'] }),
  'Ragda Pattice': S('Ragda Pattice', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#C98431', '#F1E2B8'], spice: 2, w: '1 plate', p: 8000, tags: ['spicy'] }),
  Dabeli: S('Dabeli', { temp: 'HOT', cat: 'fried', shape: 'bun', c: ['#E7B76A', '#C2402E'], spice: 2, w: '2 pcs', p: 6000, tags: ['spicy', 'new'] }),
  'Bhel Puri': S('Bhel Puri', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#F1E2B8', '#3F7D20'], spice: 2, w: '1 plate', p: 6000, tags: ['spicy', 'movie', 'childhood'] }),
  'Sev Puri': S('Sev Puri', { temp: 'AMBIENT', cat: 'namkeen', shape: 'disc', c: ['#F3D35A', '#C2402E'], spice: 2, w: '6 pcs', p: 7000, tags: ['spicy', 'childhood'] }),
  'Pani Puri': S('Pani Puri', { temp: 'AMBIENT', cat: 'namkeen', shape: 'ball', c: ['#E2B866', '#3F7D20'], spice: 2, w: '6 pcs', p: 6000, tags: ['spicy', 'childhood'] }),
  Bhadang: S('Bhadang', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#E8C46A', '#C2602A'], spice: 2, w: '250 g', p: 9000, tags: ['spicy', 'crunch', 'new'] }),
  'Poha Chivda': S('Poha Chivda', { temp: 'AMBIENT', cat: 'namkeen', shape: 'pile', c: ['#F3D35A', '#7A9E3B'], spice: 1, w: '250 g', p: 9000, tags: ['crunch', 'tea', 'festive'] }),
  Chakli: S('Chakli', { temp: 'AMBIENT', cat: 'namkeen', shape: 'spiral', c: ['#C9862F', '#8A5A2B'], spice: 1, w: '250 g', p: 12000, tags: ['crunch', 'festive'] }),
  Shankarpali: S('Shankarpali', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#E9C27A', '#C9A15A'], spice: 0, w: '250 g', p: 10000, tags: ['sweet', 'crunch', 'festive'] }),
  Karanji: S('Karanji', { temp: 'AMBIENT', cat: 'sweet', shape: 'wrap', c: ['#E2B866', '#FBF4E6'], spice: 0, w: '6 pcs', p: 15000, tags: ['sweet', 'festive'] }),
  Anarsa: S('Anarsa', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#B5651D', '#F6EBD6'], spice: 0, w: '6 pcs', p: 15000, tags: ['sweet', 'festive', 'new'] }),
  Chirote: S('Chirote', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#F6EBD6', '#E8C478'], spice: 0, w: '6 pcs', p: 15000, tags: ['sweet', 'festive'] }),
  'Ukadiche Modak': S('Ukadiche Modak', { temp: 'AMBIENT', cat: 'sweet', shape: 'wrap', c: ['#FBF4E6', '#C68A3E'], spice: 0, w: '6 pcs', p: 18000, tags: ['sweet', 'festive'] }),
  'Besan Ladoo': S('Besan Ladoo', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#E3A93A', '#C68A3E'], spice: 0, w: '6 pcs', p: 16000, tags: ['sweet', 'festive', 'childhood'] }),
  'Tilgul Ladoo': S('Tilgul Ladoo', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#B9752C', '#F3E2B5'], spice: 0, w: '8 pcs', p: 12000, tags: ['sweet', 'healthy', 'festive'] }),
  'Gul Poli': S('Gul Poli', { temp: 'AMBIENT', cat: 'sweet', shape: 'disc', c: ['#C9862F', '#8A5A2B'], spice: 0, w: '4 pcs', p: 16000, tags: ['sweet', 'festive', 'new'] }),
  'Amba Barfi': S('Amba Barfi', { temp: 'AMBIENT', cat: 'sweet', shape: 'square', c: ['#F2A516', '#FFE09A'], spice: 0, w: '250 g', p: 22000, tags: ['sweet', 'new'] }),
  Shrikhand: S('Shrikhand', { temp: 'AMBIENT', cat: 'sweet', shape: 'pile', c: ['#F6E7C9', '#E3A93A'], spice: 0, w: '250 g', p: 16000, tags: ['sweet', 'festive'] }),
  'Mawa Cake': S('Mawa Cake', { temp: 'AMBIENT', cat: 'baked', shape: 'square', c: ['#C9862F', '#F3D9A4'], spice: 0, w: '4 pcs', p: 14000, tags: ['sweet', 'tea', 'childhood'] }),
  Nankhatai: S('Nankhatai', { temp: 'AMBIENT', cat: 'baked', shape: 'biscuit', c: ['#F3D9A4', '#C9A15A'], spice: 0, w: '300 g', p: 12000, tags: ['sweet', 'tea', 'childhood'] }),
};
delete MORE_SNACKS['Banana Chips Kerala'];

// Street-cart and home-kitchen specials (the snacks a city's bandis and home cooks are known for)
Object.assign(MORE_SNACKS, {
  'Cut Mirchi': S('Cut Mirchi', { temp: 'HOT', cat: 'fried', shape: 'bajji', c: ['#C98431', '#3F7D20'], spice: 3, w: '6 pcs', p: 6000, tags: ['spicy', 'tea', 'new'] }),
  'Aratikaya Bajji': S('Aratikaya Bajji', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#E0A54B', '#F1E2B8'], spice: 1, w: '6 pcs', p: 5000, tags: ['tea', 'childhood'] }),
  'Bangaladumpa Bajji': S('Bangaladumpa Bajji', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#D9A44E', '#F3D9A4'], spice: 1, w: '6 pcs', p: 5000, tags: ['tea', 'childhood'] }),
  'Vankaya Bajji': S('Vankaya Bajji', { temp: 'HOT', cat: 'fried', shape: 'disc', c: ['#C98431', '#5A2E4A'], spice: 1, w: '6 pcs', p: 5500, tags: ['tea', 'new'] }),
  'Uggani Bajji': S('Uggani Bajji', { temp: 'HOT', cat: 'namkeen', shape: 'pile', c: ['#F3D35A', '#3F7D20'], spice: 2, w: '1 plate', p: 6000, tags: ['spicy', 'new'] }),
  'Purnam Boorelu': S('Purnam Boorelu', { temp: 'AMBIENT', cat: 'sweet', shape: 'ball', c: ['#C98431', '#8A5A2B'], spice: 0, w: '6 pcs', p: 15000, tags: ['sweet', 'festive'] }),
  Kaalan: S('Kaalan', { temp: 'HOT', cat: 'fried', shape: 'pile', c: ['#8A4B1F', '#C2402E'], spice: 3, w: '1 plate', p: 7000, tags: ['spicy', 'new'] }),
  Atho: S('Atho', { temp: 'HOT', cat: 'namkeen', shape: 'pile', c: ['#E0A54B', '#3F7D20'], spice: 2, w: '1 plate', p: 8000, tags: ['spicy', 'new'] }),
  'Thattu Vadai Set': S('Thattu Vadai Set', { temp: 'HOT', cat: 'namkeen', shape: 'disc', c: ['#D9A44E', '#C2402E'], spice: 2, w: '4 sets', p: 6000, tags: ['spicy', 'crunch', 'new'] }),
  'Masala Puri': S('Masala Puri', { temp: 'HOT', cat: 'namkeen', shape: 'pile', c: ['#8A5A2B', '#3F7D20'], spice: 2, w: '1 plate', p: 6000, tags: ['spicy', 'childhood'] }),
  'Gobi Manchurian': S('Gobi Manchurian', { temp: 'HOT', cat: 'fried', shape: 'pile', c: ['#C2402E', '#E0A54B'], spice: 2, w: '1 plate', p: 9000, tags: ['spicy', 'movie'] }),
});

// [neighbourhood, signature, offset lat, offset lng, product names], as in seed.js.
// Cities already in seed.js get their new shops here too, after every original shop.
export const MORE_SHOPS = {
  tirupati: [
    ['Tilak Road', 'Laddu Mahal', 0.004, 0.003, ['Rava Laddu', 'Kobbari Laddu', 'Putnala Laddu', 'Nuvvula Undalu', 'Thokkudu Laddu', 'Chalimidi']],
    ['Alipiri Road', 'Garelu Bandi', -0.005, -0.004, ['Minapa Garelu', 'Pesara Punukulu', 'Mokkajonna Vada', 'Ponganalu', 'Jeedipappu Pakodi', 'Mirchi Bajji'], 'stall'],
  ],
  kakinada: [
    ['Main Road', 'Kaja Kottu', 0.003, -0.004, ['Madatha Kaja', 'Kaja', 'Kajjikayalu', 'Bellam Gavvalu', 'Bandar Laddu', 'Pootharekulu']],
    ['Jagannaickpur', 'Karam Corner', -0.004, 0.005, ['Janthikalu', 'Sanna Karapusa', 'Chakodi', 'Chekkalu', 'Karam Boondi', 'Atukula Mixture'], 'stall'],
  ],
  nellore: [['Trunk Road', 'Snack Kottu', 0.004, 0.004, ['Minapa Garelu', 'Ponganalu', 'Mokkajonna Vada', 'Pesara Punukulu', 'Janthikalu', 'Chakodi'], 'stall']],
  warangal: [
    ['Hanamkonda', 'Sakinalu Store', 0.004, -0.003, ['Sakinalu', 'Sarva Pindi', 'Malidalu', 'Chegodilu', 'Karam Boondi', 'Ullipaya Pakodi']],
    ['Kazipet', 'Pindi Vantalu', -0.005, 0.004, ['Sarva Pindi', 'Sakinalu', 'Chegodilu', 'Malidalu', 'Ariselu', 'Bobbatlu'], 'home'],
  ],
  madurai: [
    ['Town Hall Road', 'Paniyaram Kadai', 0.003, 0.004, ['Kuzhi Paniyaram', 'Paruppu Vadai', 'Milagu Vadai', 'Keerai Vadai', 'Vazhakkai Bajji', 'Masala Kadalai'], 'stall'],
    ['Simmakkal', 'Murukku Veedu', -0.004, -0.003, ['Thattai', 'Thenkuzhal', 'Kai Murukku', 'Mullu Murukku', 'Ribbon Pakoda', 'Seepu Seedai']],
  ],
  tirunelveli: [['Junction', 'Halwa Kadai', 0.004, 0.003, ['Tirunelveli Halwa', 'Kadalai Mittai', 'Palkova', 'Badusha', 'Thengai Burfi', 'Thengai Mittai']]],
  coimbatore: [
    ['RS Puram', 'Mixture Mandi', 0.004, -0.004, ['Kara Sev', 'Omapodi', 'Madras Mixture', 'Ribbon Pakoda', 'Thattai', 'Masala Kadalai']],
    ['Gandhipuram', 'Inippu Stall', -0.004, 0.004, ['Ellu Urundai', 'Pori Urundai', 'Maa Laddu', 'Vella Seedai', 'Sathu Maavu Urundai', 'Sweet Somas']],
  ],
  mysuru: [
    ['Devaraja Market', 'Pak Angadi', 0.003, 0.003, ['Mysore Pak', 'Chiroti', 'Kobbari Mithai', 'Thambittu', 'Kayi Holige', 'Ragi Laddu']],
    ['Agrahara', 'Bonda Mane', -0.004, -0.004, ['Mysore Bonda', 'Benne Murukku', 'Chakkuli', 'Churumuri', 'Avalakki Chivda', 'Ambode']],
  ],
  mangaluru: [['Hampankatta', 'Buns Hotel', 0.004, -0.003, ['Mangalore Buns', 'Goli Baje', 'Pathrode', 'Kayi Kadubu', 'Kesari Bath', 'Khara Bath']]],
  hubballi: [['Durgadbail', 'Girmit Gaadi', 0.003, 0.004, ['Girmit', 'Menasinakai Bajji', 'Churumuri', 'Dharwad Peda', 'Belgaum Kunda', 'Karadantu'], 'stall']],
  kochi: [
    ['Broadway', 'Chaya Kada', 0.004, 0.003, ['Pazham Pori', 'Parippu Vada', 'Ulli Vada', 'Uzhunnu Vada', 'Veg Cutlet', 'Sukhiyan'], 'stall'],
    ['Mattancherry', 'Chips Kada', -0.004, -0.003, ['Banana Chips', 'Tapioca Chips', 'Jackfruit Chips', 'Sharkara Varatti', 'Kerala Mixture', 'Diamond Cuts']],
  ],
  thiruvananthapuram: [
    ['Chalai', 'Appam Kada', 0.003, -0.004, ['Unniyappam', 'Achappam', 'Kuzhalappam', 'Neyyappam', 'Kalathappam', 'Vattayappam']],
    ['Palayam', 'Palaharam Shop', -0.004, 0.004, ['Kozhukatta', 'Ela Ada', 'Avalose Podi', 'Avalose Unda', 'Ari Unda', 'Cheeda']],
  ],
  kozhikode: [['SM Street', 'Halwa Bazaar', 0.004, 0.003, ['Kozhikode Halwa', 'Pazham Nirachathu', 'Kinnathappam', 'Chakka Varatti', 'Churuttu', 'Banana Chips']]],
  kolhapur: [['Mahadwar Road', 'Bhadang Bhandar', 0.004, -0.004, ['Bhadang', 'Thalipeeth', 'Kanda Bhaji', 'Poha Chivda', 'Dhapate', 'Kanda Poha']]],
  nashik: [
    ['Panchavati', 'Chivda Ghar', 0.003, 0.004, ['Poha Chivda', 'Chakli', 'Shankarpali', 'Karanji', 'Besan Ladoo', 'Anarsa']],
    ['College Road', 'Bhaji Centre', -0.004, -0.003, ['Kothimbir Vadi', 'Alu Vadi', 'Kanda Bhaji', 'Sabudana Khichdi', 'Thalipeeth', 'Dhapate'], 'stall'],
  ],
  // new shops in cities from seed.js
  hyderabad: [['Charminar', 'Meetha Ghar', 0.006, 0.004, ['Double Ka Meetha', 'Qubani Ka Meetha', 'Badam Ki Jali', 'Dum Ke Roat', 'Fruit Biscuit', 'Veg Puff']]],
  chennai: [['Triplicane', 'Kozhukattai Kadai', 0.006, 0.002, ['Kozhukattai', 'Sweet Somas', 'Kuzhi Paniyaram', 'Paruppu Vadai', 'Sundal', 'Murukku']]],
  bengaluru: [['Jayanagar', 'Darshini Snacks', 0.006, -0.002, ['Mysore Bonda', 'Kesari Bath', 'Khara Bath', 'Benne Murukku', 'Ragi Laddu', 'Maddur Vada']]],
  mumbai: [
    ['Juhu', 'Chaat Corner', 0.006, -0.002, ['Bhel Puri', 'Sev Puri', 'Pani Puri', 'Ragda Pattice', 'Dabeli', 'Pav Bhaji'], 'stall'],
    ['Grant Road', 'Bakery Sweets', -0.006, 0.002, ['Mawa Cake', 'Nankhatai', 'Shrikhand', 'Amba Barfi', 'Chirote', 'Khari Biscuit']],
  ],
  pune: [['Tulshibaug', 'Modak Mithai', 0.006, 0.002, ['Ukadiche Modak', 'Tilgul Ladoo', 'Gul Poli', 'Puran Poli', 'Besan Ladoo', 'Shrikhand']]],
};

// Street stalls and home kitchens (all fictional, demo data) in the neighbourhoods known for one
// snack: Guntur's mirchi bajji lanes, Vijayawada's punugulu carts, Chennai's beach sundal,
// Bengaluru's food street, Kochi's thattukadas, Mumbai's chowpatty bhel. Added after every
// earlier shop, so no id moves.
export const LOCAL_SHOPS = {
  guntur: [
    ['Brodipet 4th Lane', 'Mirchi Bandi', 0.006, -0.001, ['Mirchi Bajji', 'Cut Mirchi', 'Punugulu', 'Aratikaya Bajji', 'Bangaladumpa Bajji', 'Vankaya Bajji'], 'stall'],
    ['Arundelpet', "Lakshmi Amma's Home Kitchen", -0.007, 0.002, ['Purnam Boorelu', 'Ariselu', 'Sunnundalu', 'Chekkalu', 'Sakinalu', 'Kajjikayalu'], 'home'],
  ],
  vijayawada: [
    ['Gandhinagar', 'Punugulu Bandi', 0.006, -0.003, ['Punugulu', 'Pesara Punukulu', 'Mirchi Bajji', 'Minapa Garelu', 'Ullipaya Pakodi', 'Cut Mirchi'], 'stall'],
    ['Patamata', "Seetha's Home Kitchen", -0.006, 0.006, ['Bobbatlu', 'Purnam Boorelu', 'Pootharekulu', 'Kobbari Laddu', 'Rava Laddu', 'Janthikalu'], 'home'],
  ],
  hyderabad: [
    ['Charminar Lane', 'Chaat Thela', 0.002, 0.007, ['Cut Mirchi', 'Mirchi Bajji', 'Irani Samosa', 'Pani Puri', 'Bhel Puri', 'Gobi Manchurian'], 'stall'],
    ['Kukatpally', "Ammamma's Pindi Vantalu", -0.008, -0.006, ['Sakinalu', 'Chegodilu', 'Malidalu', 'Sarva Pindi', 'Purnam Boorelu', 'Nuvvula Undalu'], 'home'],
  ],
  kurnool: [['Old Town', 'Uggani Bandi', 0.003, 0.002, ['Uggani Bajji', 'Mirchi Bajji', 'Punugulu', 'Ullipaya Pakodi', 'Aratikaya Bajji', 'Karam Boondi'], 'stall']],
  chennai: [
    ['Marina Beach Road', 'Sundal Vandi', -0.006, 0.006, ['Sundal', 'Vazhakkai Bajji', 'Kaalan', 'Atho', 'Masala Kadalai', 'Murukku'], 'stall'],
    ['Mylapore Agraharam', "Paati's Home Kitchen", 0.007, -0.005, ['Adhirasam', 'Thattai', 'Seedai', 'Kai Murukku', 'Thenkuzhal', 'Ribbon Pakoda'], 'home'],
  ],
  coimbatore: [['Town Hall', 'Thattu Vadai Kadai', 0.001, 0.006, ['Thattu Vadai Set', 'Kara Sev', 'Masala Kadalai', 'Paruppu Vadai', 'Vazhakkai Bajji', 'Kuzhi Paniyaram'], 'stall']],
  bengaluru: [
    ['VV Puram Food Street', 'Masala Puri Gaadi', -0.007, 0.004, ['Masala Puri', 'Gobi Manchurian', 'Churumuri', 'Mysore Bonda', 'Avalakki Chivda', 'Benne Murukku'], 'stall'],
    ['Basavanagudi', "Ajji's Home Kitchen", 0.002, 0.007, ['Chakkuli', 'Kodubale', 'Nippattu', 'Thambittu', 'Kayi Holige', 'Benne Murukku'], 'home'],
  ],
  kochi: [['Fort Kochi', 'Thattukada', 0.007, -0.006, ['Pazham Pori', 'Parippu Vada', 'Ulli Vada', 'Sukhiyan', 'Veg Cutlet', 'Uzhunnu Vada'], 'stall']],
  thiruvananthapuram: [['Vazhuthacaud', "Ammachi's Home Kitchen", 0.006, 0.006, ['Unniyappam', 'Achappam', 'Kuzhalappam', 'Neyyappam', 'Avalose Unda', 'Ela Ada'], 'home']],
  mumbai: [['Girgaon Chowpatty', 'Bhel Thela', 0.001, -0.007, ['Bhel Puri', 'Sev Puri', 'Pani Puri', 'Ragda Pattice', 'Vada Pav', 'Dabeli'], 'stall']],
  pune: [['Kothrud', "Aaji's Home Kitchen", -0.007, -0.006, ['Chakli', 'Karanji', 'Shankarpali', 'Besan Ladoo', 'Anarsa', 'Puran Poli'], 'home']],
};
