import { Link } from 'react-router-dom';
import Policy from '../../components/layout/Policy';
import { BUSINESS } from '../../constants/business';

const SECTIONS = [
  {
    id: 'support',
    title: 'Customer support',
    body: (
      <ul>
        <li>
          Email: <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
        </li>
        <li>Phone: {BUSINESS.phone}</li>
        <li>Hours: {BUSINESS.hours}</li>
        <li>For a problem with an order, the fastest way is Report a problem on the order page, within 2 hours of delivery for food.</li>
      </ul>
    ),
  },
  {
    id: 'grievance',
    title: 'Grievance Officer',
    body: (
      <>
        <p>
          {BUSINESS.grievanceOfficer}, <a href={`mailto:${BUSINESS.grievanceEmail}`}>{BUSINESS.grievanceEmail}</a>. We acknowledge a complaint within 48 hours and aim to settle it within one month.
        </p>
      </>
    ),
  },
  {
    id: 'business',
    title: 'Business details',
    body: (
      <ul>
        <li>{BUSINESS.legalName}</li>
        <li>{BUSINESS.address}</li>
        <li>Serving {BUSINESS.region}</li>
      </ul>
    ),
  },
  {
    id: 'partners',
    title: 'Shops and delivery partners',
    body: (
      <p>
        Want to sell or ride with SnackHub? Apply as a <Link to="/seller/signup">seller</Link> or a <Link to="/rider/signup">delivery partner</Link>.
      </p>
    ),
  },
];

export default function Contact() {
  return <Policy eyebrow="Help" title="Contact us" intro="We are here for questions about orders, payments, refunds and your account." sections={SECTIONS} />;
}
