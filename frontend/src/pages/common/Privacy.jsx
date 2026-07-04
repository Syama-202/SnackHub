import { Link } from 'react-router-dom';
import Policy from '../../components/layout/Policy';
import { BUSINESS } from '../../constants/business';

const SECTIONS = [
  {
    id: 'collect',
    title: 'What we collect',
    body: (
      <ul>
        <li>Account details: your name, email, and your mobile number if you add one.</li>
        <li>Delivery details: the addresses and drop points you save, and your orders.</li>
        <li>For sellers and delivery partners: the documents and checks needed to verify you (for example a food licence, ID or driving licence), and bank details for payouts.</li>
        <li>For delivery partners: your location while you are on duty, so orders can be offered and tracked.</li>
        <li>Security records: sign-ins, the devices you use and changes to your account.</li>
      </ul>
    ),
  },
  {
    id: 'use',
    title: 'Why we use it',
    body: (
      <ul>
        <li>To run your account, take and deliver your orders, and send you updates about them.</li>
        <li>To verify sellers and delivery partners, and keep food and deliveries safe.</li>
        <li>To prevent fraud and keep accounts secure.</li>
        <li>To meet legal duties, such as keeping records of orders and payments.</li>
      </ul>
    ),
  },
  {
    id: 'share',
    title: 'Who sees it',
    body: (
      <ul>
        <li>The shop and the delivery partner for your order see what they need to prepare and deliver it, such as your name and delivery address.</li>
        <li>PhonePe processes online payments. We never see your UPI PIN or card details.</li>
        <li>Service providers who run parts of SnackHub for us: hosting and databases, file storage, email, and map tiles. They may use the data only to provide their service to us.</li>
        <li>Authorities, when the law requires it.</li>
      </ul>
    ),
  },
  {
    id: 'security',
    title: 'How we protect it',
    body: (
      <ul>
        <li>Traffic is encrypted. Passwords are stored only as secure hashes.</li>
        <li>Verification documents are kept in private storage, and only reviewers can open them, through links that expire.</li>
        <li>Staff accounts need two-step sign-in, and their actions are logged.</li>
      </ul>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and browser storage',
    body: (
      <p>We use one cookie to keep you signed in, and your browser’s storage for small settings such as your chosen address and this device’s id. We do not use advertising or tracking cookies.</p>
    ),
  },
  {
    id: 'rights',
    title: 'Your choices and rights',
    body: (
      <>
        <p>You can see and change your details in your account. Customers can download a copy of their data and delete their account under Your data on the Profile page; sellers and delivery partners can ask us to do it. Some records, such as order and payment records, must be kept for as long as the law requires.</p>
        <p>
          Push alerts and location access are your choice, and you can turn them off in your browser at any time. To use your rights or raise a concern, write to our Grievance Officer at <a href={`mailto:${BUSINESS.grievanceEmail}`}>{BUSINESS.grievanceEmail}</a>.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes',
    body: (
      <p>
        If we change how we use your data, we update this page and tell you in the app. Questions: see <Link to="/contact">Contact us</Link>.
      </p>
    ),
  },
];

export default function Privacy() {
  return <Policy title="Privacy policy" intro="What SnackHub collects about you, why, who sees it, and the choices you have." sections={SECTIONS} />;
}
