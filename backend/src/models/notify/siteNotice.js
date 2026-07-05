// notify.site_notices: the shop-wide announcement. The newest row is the current one.
const TABLE = 'site_notices';

export const siteNoticeModel = {
  latest: (db) => db(TABLE).orderBy('id', 'desc').first(),
  create: (db, { message, tone, endsAt, changedBy }) => db(TABLE).insert({ message, tone, ends_at: endsAt, changed_by: changedBy }).then(([id]) => id),
};
