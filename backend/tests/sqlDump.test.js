// The backup command's SQL text (src/utils/sqlDump.js): every kind of value is written so that
// MySQL reads back exactly what was stored.
import { describe, expect, it } from 'vitest';
import { insertSql, sqlValue } from '../src/utils/sqlDump.js';

describe('backup SQL', () => {
  it('writes each kind of value safely', () => {
    expect(sqlValue(null)).toBe('NULL');
    expect(sqlValue(6000)).toBe('6000');
    expect(sqlValue("Asha's shop")).toBe(String.raw`'Asha\'s shop'`);
    expect(sqlValue(new Date('2026-11-14T05:30:00.000Z'))).toBe("'2026-11-14 05:30:00.000'");
    expect(sqlValue(Buffer.from([0xde, 0xad]))).toBe("X'dead'");
    // a JSON column comes back from the driver as an object
    expect(sqlValue({ mon: [['08:00', '22:00']] })).toBe(String.raw`'{\"mon\":[[\"08:00\",\"22:00\"]]}'`);
    expect(sqlValue("'; DROP TABLE users; --")).toBe(String.raw`'\'; DROP TABLE users; --'`);
  });

  it('groups rows into statements and quotes the names', () => {
    const sql = insertSql('ordering', 'orders', ['id', 'note'], [{ id: 1, note: 'a' }, { id: 2, note: null }, { id: 3, note: 'c' }], 2);
    expect(sql).toBe("INSERT INTO `ordering`.`orders` (`id`, `note`) VALUES\n(1, 'a'),\n(2, NULL);\nINSERT INTO `ordering`.`orders` (`id`, `note`) VALUES\n(3, 'c');\n");
    expect(insertSql('ordering', 'orders', ['id'], [])).toBe('');
  });
});
