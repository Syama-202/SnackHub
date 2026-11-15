import { Link } from 'react-router-dom';
import { BUSINESS } from '../../constants/business';

// Pages linked from the footer and the sign-up checkbox
export const POLICY_LINKS = [
  ['Terms of use', '/terms'],
  ['Privacy policy', '/privacy'],
  ['Cancellations and refunds', '/refunds'],
  ['Contact us', '/contact'],
];

/**
 * One policy page: a title, the date it last changed, the project note, a contents list, and
 * its sections ({ id, title, body }). Plain text on a card, readable at phone width.
 */
export default function Policy({ eyebrow = 'SnackHub policies', title, intro, sections }) {
  return (
    <article className="page max-w-3xl py-10 md:py-14">
      <p className="text-sm font-bold uppercase tracking-wide text-orange-text">{eyebrow}</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-grey-800 md:text-4xl">{title}</h1>
      <p className="mt-3 text-sm text-grey-600">Last updated {BUSINESS.policiesUpdated}</p>
      <p role="note" className="mt-5 rounded-2xl border border-sun/60 bg-sun/15 px-4 py-3 text-sm text-grey-800">
        SnackHub is a student project, and this text has not been reviewed by a lawyer.
      </p>
      {intro && <p className="mt-6 text-lg text-grey-600">{intro}</p>}

      {sections.length > 3 && (
        <nav aria-label="On this page" className="surface mt-8 p-5">
          <h2 className="font-semibold text-grey-800">On this page</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-grey-600">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="hover:text-orange-text hover:underline">{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="mt-8 space-y-8">
        {sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-28">
            <h2 id={`${s.id}-title`} className="font-display text-2xl font-semibold text-grey-800">{s.title}</h2>
            <div className="mt-3 space-y-3 leading-relaxed text-grey-600 [&_a]:font-semibold [&_a]:text-orange-text [&_a:hover]:underline [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5">{s.body}</div>
          </section>
        ))}
      </div>

      <nav aria-label="Other policies" className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-grey-800/10 pt-6 text-sm font-semibold">
        {POLICY_LINKS.map(([label, to]) => (
          <Link key={to} to={to} className="text-grey-600 hover:text-orange-text">{label}</Link>
        ))}
      </nav>
    </article>
  );
}
