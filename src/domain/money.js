const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Money is integer paise everywhere; format only at the edge. */
export const rupees = (paise) => fmt.format(Math.round(paise) / 100);
export const rupeesExact = (paise) => fmt2.format(paise / 100);
