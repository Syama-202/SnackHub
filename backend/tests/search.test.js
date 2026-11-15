// Snack search (doc 12.3) on PostgreSQL, the live site's engine, and on Elasticsearch when
// one is running (npm run search:up; the Elasticsearch half is skipped otherwise). Both find
// exact, partial, misspelled and regional names (golgappa = pani puri), keep snacks that cannot
// be ordered right now in the results with why, never offer shops that do not reach the
// customer, filter, sort and page, and follow a seller's changes. Elasticsearch being down
// falls back to PostgreSQL.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest } from './helpers/app.js';
import { staffToken } from './helpers/onboarding.js';
import { createElastic } from '../src/utils/elastic.js';
import { searchDocs, syncSearch } from '../src/utils/searchSync.js';
import { searchSynonymModel } from '../src/models/catalog/searchSynonym.js';
import { DAYS } from '../../shared/domain/hours.js';
import * as H from './helpers/orders.js';

const h = await openHarness();
if (h.skip) console.warn(`search tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const ES_URL = process.env.TEST_ELASTICSEARCH_URL ?? 'http://127.0.0.1:9201';
const esUp = await fetch(`${ES_URL}/_cluster/health`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
if (!esUp) console.warn(`Elasticsearch search tests skipped: nothing answers at ${ES_URL} (npm run search:up)`);

const week = (windows) => Object.fromEntries(DAYS.map((d) => [d, windows]));
// a serving window that starts in two hours, so the snack is found but not orderable now
const later = () => {
  const ist = new Date(Date.now() + 330 * 60_000 + 2 * 3600_000);
  const at = `${String(ist.getUTCHours()).padStart(2, '0')}:${String(Math.floor(ist.getUTCMinutes() / 5) * 5).padStart(2, '0')}`;
  const end = new Date(ist.getTime() + 2 * 3600_000);
  return week([[at, `${String(end.getUTCHours()).padStart(2, '0')}:${String(Math.floor(end.getUTCMinutes() / 5) * 5).padStart(2, '0')}`]]);
};
const where = `lat=${H.HOME.lat}&lng=${H.HOME.lng}`;
const NAGPUR = 'lat=21.1458&lng=79.0882';

/** One more snack on a shop's menu, listed, with stock. */
async function addSnack(s, { title, category = 'namkeen', temp = 'AMBIENT', price = 6000, stock = 5, hours }) {
  const p = (await s.api.post('/seller/products', { title, category, servingTemp: temp, prepMinutes: 5, pricePaise: price, weight: '1 plate', shape: 'pile' }).expect(201)).body;
  if (stock) await s.api.patch(`/seller/products/${p.id}/stock`, { delta: stock, reason: 'new batch' }).expect(200);
  await s.api.patch(`/seller/products/${p.id}`, { active: true, ...(hours !== undefined && { availableHours: hours }) }).expect(200);
  return p;
}

/** Two shops near the customer with a chaat, sweet and tiffin menu between them. */
async function chaatStreet(t, staff) {
  const a = await H.openShop(t, staff);
  const b = await H.openShop(t, staff);
  const snacks = {
    pani: await addSnack(a, { title: 'Pani Puri', category: 'chaat', hours: later() }),
    katli: await addSnack(a, { title: 'Kaju Katli', category: 'sweet', price: 24000 }),
    katliB: await addSnack(b, { title: 'Kaju Katli', category: 'sweet', price: 18000 }),
    dosa: await addSnack(b, { title: 'Masala Dosa', category: 'tiffin', temp: 'HOT', price: 7000 }),
    gone: await addSnack(b, { title: 'Ragi Laddu', category: 'sweet', stock: 0 }),
  };
  return { a, b, snacks, mine: new Set([a.shop.id, b.shop.id]) };
}

function runs(title, opts) {
  describe.skipIf(h.skip || (opts.engine === 'elasticsearch' && !esUp))(title, () => {
    let t;
    let staff;
    let elastic = null;
    let alias;
    beforeAll(() => {
      alias = `snackhub-test-${Math.random().toString(36).slice(2, 8)}`;
    });
    beforeEach(async () => {
      if (opts.engine === 'elasticsearch') elastic = createElastic({ ELASTICSEARCH_URL: ES_URL, ELASTICSEARCH_INDEX: alias });
      t = await beginTest(h, { elastic });
      staff = await staffToken(t, 'reviewer');
    });
    afterEach(() => t.end());
    afterAll(async () => {
      if (opts.engine !== 'elasticsearch') return;
      const indices = Object.keys(await fetch(`${ES_URL}/_alias/${alias}`).then((r) => (r.ok ? r.json() : {})));
      for (const i of indices) await fetch(`${ES_URL}/${i}`, { method: 'DELETE' });
    });

    // the index holds what PostgreSQL holds for these shops (an Elasticsearch run only)
    const index = async (street) => {
      if (!elastic) return;
      const { docs } = await searchDocs(t.trx.catalog, { sellerId: street.a.shop.id });
      const more = await searchDocs(t.trx.catalog, { sellerId: street.b.shop.id });
      await elastic.reindex({ docs: [...docs, ...more.docs], groups: await searchSynonymModel.groups(t.trx.catalog) });
    };
    const find = async (c, q, extra = '') => (await c.api.get(`/search?q=${encodeURIComponent(q)}&${where}${extra}`).expect(200)).body;
    const ours = (body, street) => body.results.filter((r) => street.mine.has(r.sellerId));

    it('finds exact, partial, misspelled and regional names, best match first', async () => {
      const street = await chaatStreet(t, staff);
      await index(street);
      const c = await H.customerAt(t);
      const exact = await find(c, 'Kaju Katli');
      expect(exact.provider).toBe(opts.engine);
      expect(ours(exact, street).slice(0, 2).map((r) => r.title)).toEqual(['Kaju Katli', 'Kaju Katli']);
      expect(ours(await find(c, 'kaju'), street).map((r) => r.title)).toContain('Kaju Katli'); // a word's start
      expect(ours(await find(c, 'kaju katly'), street).map((r) => r.title)).toContain('Kaju Katli'); // a typo
      expect(ours(await find(c, 'masala dosaa'), street).map((r) => r.title)).toContain('Masala Dosa');
      for (const name of ['golgappa', 'puchka', 'pani poori', 'panipuri']) expect(ours(await find(c, name), street).map((r) => r.title), name).toContain('Pani Puri');
      expect((await find(c, 'zzqx')).results).toEqual([]);
    });

    it('keeps snacks it cannot sell now in the results, with why and when', async () => {
      const street = await chaatStreet(t, staff);
      await index(street);
      const c = await H.customerAt(t);
      const pani = ours(await find(c, 'pani puri'), street).find((r) => r.id === street.snacks.pani.id);
      expect(pani.availability).toMatchObject({ orderable: false, status: expect.stringMatching(/LATER_TODAY|ANOTHER_DAY/), nextAt: expect.any(Number), label: expect.stringMatching(/^Available /) });
      const laddu = ours(await find(c, 'ragi laddu'), street).find((r) => r.id === street.snacks.gone.id);
      expect(laddu.availability).toMatchObject({ status: 'OUT_OF_STOCK', label: 'Out of stock' });
      // what can be ordered now: neither of them
      const now = ours(await find(c, 'pani puri', '&availability=now'), street);
      expect(now.map((r) => r.id)).not.toContain(street.snacks.pani.id);
    });

    it('filters, sorts and pages across shops', async () => {
      const street = await chaatStreet(t, staff);
      await index(street);
      const c = await H.customerAt(t);
      const cheap = ours(await find(c, 'kaju katli', '&sort=price_asc'), street);
      expect(cheap.map((r) => r.pricePaise)).toEqual([18000, 24000]);
      expect(new Set(cheap.map((r) => r.sellerId)).size).toBe(2);
      expect(ours(await find(c, 'kaju katli', '&maxPrice=20000'), street).map((r) => r.pricePaise)).toEqual([18000]);
      expect(ours(await find(c, 'kaju katli', `&shopId=${street.a.shop.id}`), street).map((r) => r.sellerId)).toEqual([street.a.shop.id]);
      expect(ours(await find(c, 'katli', '&category=tiffin'), street)).toEqual([]);
      const page1 = await find(c, 'kaju katli', `&shopId=${street.b.shop.id}&pageSize=1&page=1`);
      expect(page1).toMatchObject({ page: 1, pageSize: 1 });
      await c.api.get(`/search?q=katli&${where}&minPrice=500&maxPrice=100`).expect(400);
      await c.api.get(`/search?q=katli&${where}&sort=random`).expect(400);
    });

    it("follows a seller's changes and never offers a snack taken off the menu", async () => {
      const street = await chaatStreet(t, staff);
      await index(street);
      const c = await H.customerAt(t);
      await street.b.api.patch(`/seller/products/${street.snacks.dosa.id}`, { title: 'Ghee Roast Dosa' }).expect(200);
      await street.b.api.patch(`/seller/products/${street.snacks.katliB.id}`, { active: false }).expect(200);
      // the change queued an index update in the outbox; the relay applies it
      if (elastic) {
        const rows = await t.trx.catalog('outbox').where({ type: 'search.sync' }).whereNull('published_at');
        expect(rows.length).toBeGreaterThan(0);
        // the queued updates for these two snacks, applied in one go
        const ids = rows.flatMap((r) => (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload).productIds ?? []);
        expect(ids).toEqual(expect.arrayContaining([street.snacks.dosa.id, street.snacks.katliB.id]));
        await syncSearch({ dbs: t.trx, elastic }, { productIds: [street.snacks.dosa.id, street.snacks.katliB.id] });
      }
      expect(ours(await find(c, 'ghee roast'), street).map((r) => r.title)).toEqual(['Ghee Roast Dosa']);
      expect(ours(await find(c, 'kaju katli'), street).map((r) => r.id)).toEqual([street.snacks.katli.id]);
    });

    it('offers nothing from elsewhere where no shop delivers, and says where that is', async () => {
      const c = await H.customerAt(t);
      const far = (await c.api.get(`/search?q=samosa&${NAGPUR}`).expect(200)).body;
      expect(far).toMatchObject({ total: 0, results: [], location: { status: 'UNSUPPORTED_CITY', nearestCity: expect.any(Object) } });
      expect((await c.api.get(`/search/suggest?q=sam&${NAGPUR}`).expect(200)).body.suggestions).toEqual([]);
    });

    it('suggests snack and shop names while typing, regional names included', async () => {
      const street = await chaatStreet(t, staff);
      await index(street);
      const c = await H.customerAt(t);
      const s1 = (await c.api.get(`/search/suggest?q=kaj&${where}`).expect(200)).body.suggestions;
      expect(s1).toContainEqual({ text: 'Kaju Katli', kind: 'snack' });
      const s2 = (await c.api.get(`/search/suggest?q=golg&${where}`).expect(200)).body.suggestions;
      expect(s2).toContainEqual({ text: 'Pani Puri', kind: 'snack' });
      await c.api.get(`/search/suggest?q=k&${where}`).expect(400);
    });
  });
}

runs('search on PostgreSQL', { engine: 'postgres' });
runs('search on Elasticsearch', { engine: 'elasticsearch' });

describe.skipIf(h.skip)('when Elasticsearch is down', () => {
  let t;
  let staff;
  beforeEach(async () => {
    // nothing listens here: every search falls back to PostgreSQL
    t = await beginTest(h, { elastic: createElastic({ ELASTICSEARCH_URL: 'http://127.0.0.1:9' }) });
    staff = await staffToken(t, 'reviewer');
  });
  afterEach(() => t.end());

  it('answers from PostgreSQL and says it fell back', async () => {
    const street = await chaatStreet(t, staff);
    const c = await H.customerAt(t);
    const body = (await c.api.get(`/search?q=golgappa&${where}`).expect(200)).body;
    expect(body).toMatchObject({ provider: 'postgres', fallback: true });
    expect(body.results.filter((r) => street.mine.has(r.sellerId)).map((r) => r.title)).toContain('Pani Puri');
    // the sync of a change waits in the outbox to be retried, never lost
    await street.a.api.patch(`/seller/products/${street.snacks.katli.id}`, { pricePaise: 25000 }).expect(200);
    await expect(syncSearch({ dbs: t.trx, elastic: createElastic({ ELASTICSEARCH_URL: 'http://127.0.0.1:9' }) }, { productIds: [street.snacks.katli.id] })).rejects.toThrow();
  });
});
