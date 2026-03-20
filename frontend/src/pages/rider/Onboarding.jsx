import Wizard from '../../components/onboarding/Wizard';
import { STATES } from '@shared/domain/documents';
import { IFSC, BANK_ACCOUNT, PIN, VEHICLE_REG, MIN_RIDER_AGE, ageOn } from '@shared/domain/onboarding';

const optional = (test, msg) => (v) => (v && !test(v) ? msg : null);
const name = (v) => (v && !/^[\p{L}][\p{L} .'-]{1,119}$/u.test(v.trim()) ? 'Use letters, spaces, dots and hyphens only' : null);
const phone = optional((v) => /^\+[1-9]\d{7,14}$/.test(v), 'Use the international format, like +919876543210');
const maxDob = new Date(Date.now() - MIN_RIDER_AGE * 365.25 * 86_400_000).toISOString().slice(0, 10);

// Rider onboarding (multi-role spec, rider): who you are, where you live, how you deliver, then
// the documents for that vehicle. Bicycle riders are never asked for motor-vehicle papers.
const STEPS = [
  {
    id: 'personal',
    label: 'About you',
    title: 'About you',
    sub: 'As on your government ID. Your date of birth is used only to check you are at least 18.',
    save: 'profile',
    fields: [
      { name: 'legalName', label: 'Full legal name', autoComplete: 'name', validate: name, wide: true },
      { name: 'dob', label: 'Date of birth', type: 'date', max: maxDob, validate: optional((v) => ageOn(v) >= MIN_RIDER_AGE, `Riders must be at least ${MIN_RIDER_AGE}`) },
      { name: 'emergencyName', label: 'Emergency contact name', validate: name },
      { name: 'emergencyPhone', label: 'Emergency contact phone', type: 'tel', placeholder: '+919876543210', validate: phone },
      {
        name: 'backgroundConsent',
        stored: 'backgroundConsentAt',
        gapFields: ['backgroundConsentAt'],
        type: 'checkbox',
        label: 'I agree to a background check by SnackHub’s verification partner, as part of keeping customers safe (demo: no real check is made).',
      },
    ],
  },
  {
    id: 'address',
    label: 'Address',
    title: 'Where you live',
    sub: 'Used for your account and payouts, never shown to customers.',
    save: 'profile',
    fields: [
      { name: 'addressLine', label: 'Home address', wide: true, autoComplete: 'street-address', validate: optional((v) => v.trim().length >= 5, 'Enter the full address') },
      { name: 'city', label: 'City', autoComplete: 'address-level2' },
      { name: 'state', label: 'State', type: 'select', options: STATES.map((s) => [s, s]) },
      { name: 'pin', label: 'PIN code', inputMode: 'numeric', autoComplete: 'postal-code', validate: optional((v) => PIN.test(v), 'A PIN code has 6 digits') },
      { name: 'bankHolder', label: 'Payout account holder (optional)', gapFields: [], validate: name },
      { name: 'bankIfsc', label: 'IFSC (optional)', gapFields: [], transform: (v) => v.trim().toUpperCase(), validate: optional((v) => IFSC.test(v.trim().toUpperCase()), 'An IFSC has 11 characters') },
      { name: 'bankAccount', label: 'Account number (optional)', inputMode: 'numeric', secret: 'bankAccount', gapFields: [], validate: optional((v) => BANK_ACCOUNT.test(v), 'Account numbers have 9 to 18 digits') },
    ],
  },
  {
    id: 'vehicle',
    label: 'Vehicle',
    title: 'How you deliver',
    sub: 'The documents we ask for depend on this. Electric scooters need no pollution certificate; bicycles need no vehicle papers at all.',
    save: 'vehicle',
    fields: [
      {
        name: 'mode',
        from: 'vehicle',
        label: 'Your vehicle',
        type: 'cards',
        options: [
          ['scooter', 'Petrol scooter', 'scooter', 'Licence, RC, insurance, PUC'],
          ['ev_scooter', 'Electric scooter', 'bolt', 'Licence, RC, insurance'],
          ['motorcycle', 'Motorbike', 'scooter', 'Licence, RC, insurance, PUC'],
          ['bicycle', 'Bicycle', 'heart', 'ID and photo only'],
        ],
        validate: (v) => (!v ? 'Choose how you deliver' : null),
      },
      {
        name: 'registrationNo',
        from: 'vehicle',
        label: 'Registration number (not for bicycles)',
        placeholder: 'AP07AB1234',
        transform: (v) => v.toUpperCase().replace(/[\s-]/g, ''),
        validate: (v, all) => (all.mode === 'bicycle' ? (v ? 'Bicycles have no registration number' : null) : !v ? 'Enter the registration number' : !VEHICLE_REG.test(v.toUpperCase().replace(/[\s-]/g, '')) ? 'Like AP07AB1234' : null),
      },
      { name: 'makeModel', from: 'vehicle', label: 'Make and model (optional)', placeholder: 'Honda Activa 6G', gapFields: [] },
    ],
  },
];

export default function RiderOnboarding() {
  return (
    <Wizard
      kind="rider"
      title="Become a delivery partner"
      intro="Fill in each step at your own pace; it saves as you go. When everything is in, submit it and the verification team checks your documents. You can go online and take deliveries once you are approved."
      steps={STEPS}
      homePath="/rider"
    />
  );
}
