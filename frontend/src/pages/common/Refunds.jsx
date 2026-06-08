import { Link } from 'react-router-dom';
import Policy from '../../components/layout/Policy';
import { BUSINESS } from '../../constants/business';
import { PROMISE_WORDING } from '@shared/domain/promise';

const SECTIONS = [
  {
    id: 'you-cancel',
    title: 'If you cancel',
    body: (
      <ul>
        <li>You can cancel free of charge from the order page until the shop has packed your order.</li>
        <li>After it is packed, the food is already made, so contact us and we will look at what we can do.</li>
      </ul>
    ),
  },
  {
    id: 'we-cancel',
    title: 'If the shop or SnackHub cancels',
    body: (
      <ul>
        <li>If the shop turns the order down, or does not accept it within 2 minutes, it is cancelled.</li>
        <li>If an online payment fails, or is not finished within 15 minutes, the order is cancelled.</li>
        <li>In each case you pay nothing. Any money already taken is refunded in full, automatically.</li>
      </ul>
    ),
  },
  {
    id: 'how',
    title: 'How refunds are paid',
    body: (
      <ul>
        <li>Online payments go back to the way you paid, through PhonePe. Your bank usually shows the refund within 5 to 7 working days.</li>
        <li>For pay-on-delivery orders nothing is collected until delivery, so a cancelled order costs nothing.</li>
        <li>Your order page shows the refund’s progress. If a refund is delayed, we tell you and our team follows it up.</li>
      </ul>
    ),
  },
  {
    id: 'problem',
    title: 'If something is wrong with your order',
    body: (
      <ul>
        <li>Report it from the order page: food problems within 2 hours of delivery, with 1 to 3 photos; delivery and other problems within 24 hours.</li>
        <li>Clear cases are settled at once with SnackHub credit, valid for 30 days on your next pay-on-delivery order. Other cases are reviewed by our team.</li>
        <li>If food is unsafe to eat, report it straight away. We pause the shop while we check.</li>
      </ul>
    ),
  },
  {
    id: 'delivery',
    title: 'Delivery',
    body: (
      <ul>
        <li>We deliver from verified shops near the address you choose, only where a shop can reach you in time.</li>
        <li>{PROMISE_WORDING}</li>
        <li>You can follow the order live. Share the delivery code only when the order is in your hands.</li>
      </ul>
    ),
  },
  {
    id: 'help',
    title: 'Need help?',
    body: (
      <p>
        Write to <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> with your order number, or see <Link to="/contact">Contact us</Link>.
      </p>
    ),
  },
];

export default function Refunds() {
  return <Policy title="Cancellations, refunds and delivery" intro="When you can cancel, what happens if the shop or a payment cancels, and how money comes back to you." sections={SECTIONS} />;
}
