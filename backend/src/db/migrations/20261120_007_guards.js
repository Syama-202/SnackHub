// Rules the database keeps by itself, whatever the code does: history tables that can only be
// added to (the audit log, the payment ledger, cash deposits, verification reviews), updated_at
// moving on every change, and an order keeping the address it was placed with.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `CREATE FUNCTION identity.append_only() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '% is append only', TG_TABLE_NAME USING ERRCODE = 'P0001';
      END $$`,
    `CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON identity.audit_log FOR EACH ROW EXECUTE FUNCTION identity.append_only()`,
    `CREATE FUNCTION identity.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        -- like MySQL's ON UPDATE CURRENT_TIMESTAMP (the statement's time, not the transaction's): a statement that sets updated_at itself wins
        IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
          NEW.updated_at := statement_timestamp();
        END IF;
        RETURN NEW;
      END $$`,
    `CREATE TRIGGER users_touch BEFORE UPDATE ON identity.users FOR EACH ROW EXECUTE FUNCTION identity.touch_updated_at()`,
    `CREATE FUNCTION catalog.append_only() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '% is append only', TG_TABLE_NAME USING ERRCODE = 'P0001';
      END $$`,
    `CREATE TRIGGER seller_reviews_append_only BEFORE UPDATE OR DELETE ON catalog.seller_reviews FOR EACH ROW EXECUTE FUNCTION catalog.append_only()`,
    `CREATE FUNCTION catalog.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        -- like MySQL's ON UPDATE CURRENT_TIMESTAMP (the statement's time, not the transaction's): a statement that sets updated_at itself wins
        IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
          NEW.updated_at := statement_timestamp();
        END IF;
        RETURN NEW;
      END $$`,
    `CREATE TRIGGER catalog_items_touch BEFORE UPDATE ON catalog.catalog_items FOR EACH ROW EXECUTE FUNCTION catalog.touch_updated_at()`,
    `CREATE TRIGGER products_touch BEFORE UPDATE ON catalog.products FOR EACH ROW EXECUTE FUNCTION catalog.touch_updated_at()`,
    `CREATE TRIGGER seller_applications_touch BEFORE UPDATE ON catalog.seller_applications FOR EACH ROW EXECUTE FUNCTION catalog.touch_updated_at()`,
    `CREATE TRIGGER seller_businesses_touch BEFORE UPDATE ON catalog.seller_businesses FOR EACH ROW EXECUTE FUNCTION catalog.touch_updated_at()`,
    `CREATE TRIGGER seller_documents_touch BEFORE UPDATE ON catalog.seller_documents FOR EACH ROW EXECUTE FUNCTION catalog.touch_updated_at()`,
    `CREATE FUNCTION dispatch.append_only() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '% is append only', TG_TABLE_NAME USING ERRCODE = 'P0001';
      END $$`,
    `CREATE TRIGGER cash_deposits_append_only BEFORE UPDATE OR DELETE ON dispatch.cash_deposits FOR EACH ROW EXECUTE FUNCTION dispatch.append_only()`,
    `CREATE TRIGGER rider_reviews_append_only BEFORE UPDATE OR DELETE ON dispatch.rider_reviews FOR EACH ROW EXECUTE FUNCTION dispatch.append_only()`,
    `CREATE FUNCTION dispatch.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        -- like MySQL's ON UPDATE CURRENT_TIMESTAMP (the statement's time, not the transaction's): a statement that sets updated_at itself wins
        IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
          NEW.updated_at := statement_timestamp();
        END IF;
        RETURN NEW;
      END $$`,
    `CREATE TRIGGER rider_applications_touch BEFORE UPDATE ON dispatch.rider_applications FOR EACH ROW EXECUTE FUNCTION dispatch.touch_updated_at()`,
    `CREATE TRIGGER rider_documents_touch BEFORE UPDATE ON dispatch.rider_documents FOR EACH ROW EXECUTE FUNCTION dispatch.touch_updated_at()`,
    `CREATE TRIGGER rider_profiles_touch BEFORE UPDATE ON dispatch.rider_profiles FOR EACH ROW EXECUTE FUNCTION dispatch.touch_updated_at()`,
    `CREATE TRIGGER rider_vehicles_touch BEFORE UPDATE ON dispatch.rider_vehicles FOR EACH ROW EXECUTE FUNCTION dispatch.touch_updated_at()`,
    `CREATE FUNCTION payment.append_only() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '% is append only', TG_TABLE_NAME USING ERRCODE = 'P0001';
      END $$`,
    `CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON payment.ledger_entries FOR EACH ROW EXECUTE FUNCTION payment.append_only()`,
    `CREATE FUNCTION ordering.address_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.address_text IS DISTINCT FROM OLD.address_text OR NEW.address_detail IS DISTINCT FROM OLD.address_detail
           OR NEW.drop_lat IS DISTINCT FROM OLD.drop_lat OR NEW.drop_lng IS DISTINCT FROM OLD.drop_lng THEN
          RAISE EXCEPTION 'an order keeps the address it was placed with' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$`,
    `CREATE TRIGGER orders_address_frozen BEFORE UPDATE ON ordering.orders FOR EACH ROW EXECUTE FUNCTION ordering.address_frozen()`,
  ]);
}

export async function down(knex) {
  await runAll(knex, [
    `DROP FUNCTION IF EXISTS identity.append_only() CASCADE`,
    `DROP FUNCTION IF EXISTS identity.touch_updated_at() CASCADE`,
    `DROP FUNCTION IF EXISTS catalog.append_only() CASCADE`,
    `DROP FUNCTION IF EXISTS catalog.touch_updated_at() CASCADE`,
    `DROP FUNCTION IF EXISTS dispatch.append_only() CASCADE`,
    `DROP FUNCTION IF EXISTS dispatch.touch_updated_at() CASCADE`,
    `DROP FUNCTION IF EXISTS payment.append_only() CASCADE`,
    `DROP FUNCTION IF EXISTS ordering.address_frozen() CASCADE`,
  ]);
}
