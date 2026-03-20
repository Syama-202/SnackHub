// Sign-in settings (doc 16.1). Public values only: the Google client ID is not a secret.
// Until a real Web client ID is set in frontend/.env.local, Google sign-in stays hidden.
const id = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export const GOOGLE_CLIENT_ID = /^[\w-]+\.apps\.googleusercontent\.com$/.test(id) && !id.startsWith('placeholder') ? id : null;

// The admin console is its own app on its own host; the public site only links to it
export const ADMIN_CONSOLE_URL = import.meta.env.VITE_ADMIN_CONSOLE_URL || 'http://localhost:5181';

/**
 * The three public portals. Each has its own sign-up and sign-in page, and a token from one
 * never opens another. Sellers and riders start unapproved and go through onboarding.
 */
export const PORTALS = {
  customer: {
    label: 'Customer',
    title: 'Order snacks',
    pitch: 'Hometown snacks from verified shops near you, delivered in about 30 minutes.',
    icon: 'cart',
    home: '/shop',
    tone: 'from-sun to-orange',
  },
  seller: {
    label: 'Seller',
    title: 'Register your snack business',
    pitch: 'Shops, street stalls and home kitchens. Add your business details and licences, and we verify them before you go live.',
    icon: 'box',
    home: '/seller',
    onboarding: '/seller/onboarding',
    tone: 'from-orange to-red',
  },
  rider: {
    label: 'Delivery partner',
    title: 'Become a delivery partner',
    pitch: 'Deliver on a scooter, motorbike or bicycle. Upload your ID and vehicle papers, and start once they are checked.',
    icon: 'scooter',
    home: '/rider',
    onboarding: '/rider/onboarding',
    tone: 'from-red to-orange-deep',
  },
};

export const signInPath = (portal) => `/${portal}/signin`;
export const signUpPath = (portal) => `/${portal}/signup`;

// country codes offered on the forms; India first
export const COUNTRY_CODES = [
  ['+91', 'India (+91)'],
  ['+971', 'UAE (+971)'],
  ['+65', 'Singapore (+65)'],
  ['+44', 'UK (+44)'],
  ['+1', 'USA / Canada (+1)'],
];

// the terms and privacy version shown at sign-up (the server records which one was accepted)
export const TERMS_VERSION = '2026-03';
