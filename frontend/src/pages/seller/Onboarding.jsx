import Wizard from '../../components/onboarding/Wizard';
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS, STATES } from '@shared/domain/documents';
import { IFSC, BANK_ACCOUNT, PIN, OPEN_HOURS } from '@shared/domain/onboarding';

const optional = (test, msg) => (v) => (v && !test(v) ? msg : null);
const name = (v) => (v && !/^[\p{L}][\p{L} .'-]{1,119}$/u.test(v.trim()) ? 'Use letters, spaces, dots and hyphens only' : null);
const phone = optional((v) => /^\+[1-9]\d{7,14}$/.test(v), 'Use the international format, like +919876543210');

// Seller onboarding (multi-role spec, seller): the business, where to pick up and when, where
// settlements go, then the documents that apply to this business type and state.
const STEPS = [
  {
    id: 'business',
    label: 'Business',
    title: 'About your business',
    sub: 'The person legally responsible and how customers will see the shop.',
    save: 'profile',
    fields: [
      { name: 'ownerLegalName', label: "Owner's full legal name", autoComplete: 'name', validate: name, wide: true },
      { name: 'businessType', label: 'Business type', type: 'select', options: BUSINESS_TYPES.map((t) => [t, BUSINESS_TYPE_LABELS[t]]), hint: 'This decides which registrations we ask for' },
      { name: 'shopName', label: 'Shop name customers will see', validate: (v) => (v && v.trim().length < 3 ? 'At least 3 characters' : null) },
      {
        name: 'kind',
        label: 'Where you sell from',
        type: 'cards',
        options: [
          ['shop', 'A shop', 'home', 'A sweet shop, bakery or snack store'],
          ['stall', 'A street stall', 'flag', 'A bandi, cart or kadai'],
          ['home', 'A home kitchen', 'heart', 'Made at home in small batches'],
        ],
      },
      { name: 'businessEmail', label: 'Business email', type: 'email', autoComplete: 'email', validate: optional((v) => /^\S+@\S+\.\S+$/.test(v), 'Enter a valid email') },
      { name: 'businessPhone', label: 'Business phone', type: 'tel', autoComplete: 'tel', placeholder: '+919876543210', validate: phone },
    ],
  },
  {
    id: 'location',
    label: 'Pickup and hours',
    title: 'Pickup location and hours',
    sub: 'Riders collect orders here. Customers within your delivery radius can order.',
    save: 'profile',
    fields: [
      { name: 'addressLine', label: 'Business address', wide: true, autoComplete: 'street-address', validate: optional((v) => v.trim().length >= 5, 'Enter the full address') },
      { name: 'city', label: 'City', autoComplete: 'address-level2' },
      { name: 'state', label: 'State', type: 'select', options: STATES.map((s) => [s, s]) },
      { name: 'pin', label: 'PIN code', inputMode: 'numeric', autoComplete: 'postal-code', validate: optional((v) => PIN.test(v), 'A PIN code has 6 digits') },
      { name: 'radiusKm', label: 'Delivery radius (km)', type: 'number', min: 1, max: 10, step: 0.5, hint: 'Hot snacks travel at most 3 km', validate: optional((v) => Number(v) >= 1 && Number(v) <= 10, 'Between 1 and 10 km') },
      { name: 'pickup', label: 'Pickup point on the map', type: 'location', gapFields: ['lat'], hint: 'Stand at the counter and tap "Use where I am", or type the coordinates.', validate: (v) => (v.lat !== '' || v.lng !== '') && !(Number(v.lat) >= 6 && Number(v.lat) <= 38 && Number(v.lng) >= 68 && Number(v.lng) <= 98) ? 'That point is not in India' : null },
      { name: 'openHours', label: 'Opening hours', type: 'hours', validate: optional((v) => OPEN_HOURS.test(v), 'Pick both the opening and closing time') },
    ],
  },
  {
    id: 'bank',
    label: 'Settlements',
    title: 'Where your money goes',
    sub: 'Settlements are paid to this account. We store the number encrypted and only ever show its last four digits.',
    save: 'profile',
    fields: [
      { name: 'bankHolder', label: 'Account holder name', validate: name },
      { name: 'bankIfsc', label: 'IFSC', placeholder: 'SBIN0001234', transform: (v) => v.trim().toUpperCase(), validate: optional((v) => IFSC.test(v.trim().toUpperCase()), 'An IFSC has 11 characters, like SBIN0001234') },
      { name: 'bankAccount', label: 'Account number', inputMode: 'numeric', secret: 'bankAccount', gapFields: ['bankAccountLast4'], validate: optional((v) => BANK_ACCOUNT.test(v), 'Account numbers have 9 to 18 digits') },
      // checked in the browser only, never sent
      { name: 'bankAccountConfirm', label: 'Account number again', inputMode: 'numeric', gapFields: [], skip: true, validate: (v, all) => (all.bankAccount && v !== all.bankAccount ? 'The numbers do not match' : null) },
    ],
  },
];

export default function SellerOnboarding() {
  return (
    <Wizard
      kind="seller"
      title="Register your snack business"
      intro="Fill in each step at your own pace; it saves as you go. When everything is in, submit it and the verification team checks your documents, usually within 48 hours. You can list snacks and take orders once you are approved."
      steps={STEPS}
      homePath="/seller"
    />
  );
}
