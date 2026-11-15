// How a snack's availability (from the API: product.availability) reads in the app (doc 12.1).
// The server decides; these are only the words and colours, kept friendly but exact: "later"
// never reads as "not available", and sold out never reads as closed.

export const STATUS_TONE = {
  AVAILABLE: 'green',
  LATER_TODAY: 'sun',
  ANOTHER_DAY: 'grey',
  SHOP_CLOSED: 'grey',
  OUT_OF_STOCK: 'red',
  TEMPORARILY_UNAVAILABLE: 'grey',
  SHOP_UNAVAILABLE: 'grey',
};

/** A short badge: "From 5:00 pm", "Tomorrow 7:00 am", "Sold out", "Closed now". */
export function shortStatus(a) {
  if (!a) return null;
  switch (a.status) {
    case 'AVAILABLE':
      return null;
    case 'LATER_TODAY':
      return a.label.replace('Available from', 'From');
    case 'ANOTHER_DAY':
      return a.nextAt ? a.label.replace('Available ', '').replace(/^\w/, (c) => c.toUpperCase()) : 'Not this week';
    case 'OUT_OF_STOCK':
      return 'Sold out';
    case 'SHOP_CLOSED':
      return 'Closed now';
    case 'TEMPORARILY_UNAVAILABLE':
      return 'Short break';
    default:
      return 'Unavailable';
  }
}

/** The friendly line for why it cannot be ordered now, with when it can. */
export function availabilityNote(a) {
  if (!a || a.status === 'AVAILABLE') return null;
  const when = a.label;
  switch (a.status) {
    case 'LATER_TODAY':
      return `Craving this already? It's back today. ${when}.`;
    case 'ANOTHER_DAY':
      return a.nextAt ? `Worth the wait. ${when}.` : 'Not on the menu this week.';
    case 'OUT_OF_STOCK':
      return "That one's flying off the shelves! Check back soon.";
    case 'SHOP_CLOSED':
      return `This shop is taking a little break. ${when.replace('Shop closed · ', '').replace(/^o/, 'O')}.`;
    case 'TEMPORARILY_UNAVAILABLE':
      return a.nextAt ? `Taking a short break. ${when}.` : 'Taking a short break. Back soon!';
    default:
      return 'This shop is not taking orders right now.';
  }
}

/** The cart's title for a refusal from the API, by its code. */
export const REFUSAL_TITLE = {
  NOT_AVAILABLE_NOW: 'Not quite yet!',
  OUT_OF_STOCK: 'Sold out for now',
  SHOP_UNAVAILABLE: 'Shop closed',
  TEMPORARILY_UNAVAILABLE: 'Taking a short break',
  NOT_TAKING_ORDERS: 'Not taking orders yet',
};
