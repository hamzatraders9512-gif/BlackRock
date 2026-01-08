-- 001_notify_tx.sql
-- Example Postgres trigger and NOTIFY for transaction inserts
-- Intended as an example migration for Postgres-based deployments

-- Transaction table assumed: transactions(id, user_id, type, amount, created_at, status)

CREATE OR REPLACE FUNCTION notify_transaction_insert() RETURNS trigger AS $$
DECLARE
  payload json;
BEGIN
  payload := json_build_object(
    'user_id', NEW.user_id,
    'tx_id', NEW.id,
    'type', NEW.type,
    'amount', NEW.amount,
    'created_at', NEW.created_at
  );
  PERFORM pg_notify('tx_inserted', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tx_notify_trigger ON transactions;
CREATE TRIGGER tx_notify_trigger
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE PROCEDURE notify_transaction_insert();

-- NOTE: Adjust table/column names to match your schema. Keep payload small.
