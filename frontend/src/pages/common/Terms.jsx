import { Link } from 'react-router-dom';
import Policy from '../../components/layout/Policy';
import { BUSINESS } from '../../constants/business';
import { PROMISE_WORDING } from '@shared/domain/promise';

const SECTIONS = [
  {
    id: 'who',
    title: 'Who we are',
    body: (
      <p>
        SnackHub is {BUSINESS.legalName}, run from {BUSINESS.address} for customers in {BUSINESS.region}. SnackHub is a marketplace: local shops list and sell their snacks, and delivery partners carry them to you. The shop that makes your order is the seller of the food.
      </p>
    ),
  },
  {
    id: 'accounts',
    title: 'Your account',
    body: (
      <ul>
        <li>Each account belongs to one person. Keep your password to yourself, and tell us at once if you think someone else has used your account.</li>
        <li>Sellers and admins must use two-step sign-in. Customers and delivery partners can turn it on in Sign-in and security.</li>
        <li>You must give true details. Sellers and delivery partners must be 18 or older and pass our checks before they can sell or ride.</li>
        <li>We may pause or close an account that breaks these terms, puts people at risk or is used for fraud. We tell you why, unless the law stops us.</li>
      </ul>
    ),
  },
  {
    id: 'orders',
    title: 'Orders and prices',
    body: (
      <ul>
        <li>Shops set their own prices. Checkout shows every item, the delivery fee and the total before you place the order.</li>
        <li>An order is accepted when the shop accepts it. If the shop does not accept within 2 minutes, the order is cancelled and you are not charged.</li>
        <li>Delivery times are estimates: {PROMISE_WORDING}</li>
        <li>Shops may only sell food that is fit to eat and correctly described, under a valid food licence.</li>
      </ul>
    ),
  },
  {
    id: 'paying',
    title: 'Paying',
    body: (
      <ul>
        <li>Pay on delivery: you pay the delivery partner at your door, in cash or by UPI.</li>
        <li>Pay online: you pay in the secure window of Razorpay, our payment partner. Your UPI PIN and card details go to Razorpay only, never to SnackHub. The shop gets your order only after Razorpay confirms the payment to us.</li>
        <li>For a delivery, you share a delivery code with the partner. Share it only when the order is in your hands.</li>
      </ul>
    ),
  },
  {
    id: 'cancel',
    title: 'Cancelling and refunds',
    body: (
      <p>
        You can cancel free of charge until the shop has packed your order. How cancellations, failed payments, refunds and problems with an order are handled is set out in <Link to="/refunds">Cancellations and refunds</Link>.
      </p>
    ),
  },
  {
    id: 'use',
    title: 'Using SnackHub fairly',
    body: (
      <ul>
        <li>Do not misuse SnackHub: no false complaints, abuse of shops or delivery partners, fake accounts, or attempts to get around payments or security.</li>
        <li>Do not copy, scrape or overload the service, or try to reach parts of it you are not allowed to use.</li>
        <li>Reviews and complaints must be honest and about your own order.</li>
      </ul>
    ),
  },
  {
    id: 'liability',
    title: 'Our responsibility',
    body: (
      <>
        <p>We work to keep SnackHub available and correct, but it may sometimes be slow or unavailable. Nothing in these terms limits your rights under Indian consumer law.</p>
        <p>Where the law allows, our responsibility for an order is limited to the amount you paid for it.</p>
      </>
    ),
  },
  {
    id: 'law',
    title: 'Changes and the law',
    body: (
      <>
        <p>We may update these terms. If a change matters to you, we tell you in the app before it applies. These terms are governed by the laws of India.</p>
        <p>
          Questions or complaints: see <Link to="/contact">Contact us</Link>.
        </p>
      </>
    ),
  },
];

export default function Terms() {
  return <Policy title="Terms of use" intro="These terms apply when you use SnackHub to order, sell or deliver snacks." sections={SECTIONS} />;
}
