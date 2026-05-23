/**
 * The cities SnackHub has demo shops in (demo data: approximate city centres). Shops,
 * riders and addresses carry exact coordinates; a city is a label and a starting point for
 * browsing, never a limit on where an address can be. The original twelve come first so
 * their ids and order stay the same for the seed.
 */
export const BASE_CITIES = [
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

export const MORE_CITIES = [
  { id: 'tirupati', name: 'Tirupati', state: 'Andhra Pradesh', lat: 13.6288, lng: 79.4192 },
  { id: 'kakinada', name: 'Kakinada', state: 'Andhra Pradesh', lat: 16.9891, lng: 82.2475 },
  { id: 'nellore', name: 'Nellore', state: 'Andhra Pradesh', lat: 14.4426, lng: 79.9865 },
  { id: 'warangal', name: 'Warangal', state: 'Telangana', lat: 17.9689, lng: 79.5941 },
  { id: 'madurai', name: 'Madurai', state: 'Tamil Nadu', lat: 9.9252, lng: 78.1198 },
  { id: 'tirunelveli', name: 'Tirunelveli', state: 'Tamil Nadu', lat: 8.7139, lng: 77.7567 },
  { id: 'coimbatore', name: 'Coimbatore', state: 'Tamil Nadu', lat: 11.0168, lng: 76.9558 },
  { id: 'mysuru', name: 'Mysuru', state: 'Karnataka', lat: 12.2958, lng: 76.6394 },
  { id: 'mangaluru', name: 'Mangaluru', state: 'Karnataka', lat: 12.9141, lng: 74.856 },
  { id: 'hubballi', name: 'Hubballi', state: 'Karnataka', lat: 15.3647, lng: 75.124 },
  { id: 'kochi', name: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673 },
  { id: 'thiruvananthapuram', name: 'Thiruvananthapuram', state: 'Kerala', lat: 8.5241, lng: 76.9366 },
  { id: 'kozhikode', name: 'Kozhikode', state: 'Kerala', lat: 11.2588, lng: 75.7804 },
  { id: 'kolhapur', name: 'Kolhapur', state: 'Maharashtra', lat: 16.705, lng: 74.2433 },
  { id: 'nashik', name: 'Nashik', state: 'Maharashtra', lat: 19.9975, lng: 73.7898 },
  { id: 'kurnool', name: 'Kurnool', state: 'Andhra Pradesh', lat: 15.8281, lng: 78.0373 },
];

export const CITIES = [...BASE_CITIES, ...MORE_CITIES];

export const cityById = (id) => CITIES.find((c) => c.id === id) ?? null;
