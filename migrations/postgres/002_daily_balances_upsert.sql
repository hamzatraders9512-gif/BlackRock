-- 002_daily_balances_upsert.sql
-- Example upsert migration to maintain daily_balances on new transactions

-- Assumes tables:
-- transactions(id, user_id, type, amount, created_at, status)
-- daily_balances(id, user_id, date, balance, last_updated)

-- This function computes the delta for a transaction and upserts into daily_balances
CREATE OR REPLACE FUNCTION upsert_daily_balance_for_tx() RETURNS trigger AS $$
DECLARE
  tx_date date := date_trunc('day', NEW.created_at)::date;
  delta numeric := CASE WHEN NEW.type IN ('deposit','profit','earnings') THEN NEW.amount WHEN NEW.type = 'withdrawal' THEN -NEW.amount ELSE 0 END;
BEGIN
  INSERT INTO daily_balances (user_id, date, balance, last_updated)
  VALUES (NEW.user_id, tx_date, delta, now())
  ON CONFLICT (user_id, date) DO UPDATE
  SET balance = daily_balances.balance + EXCLUDED.balance,
      last_updated = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tx_daily_balance_upsert ON transactions;
CREATE TRIGGER tx_daily_balance_upsert
AFTER INSERT ON transactions
FOR EACH ROW
WHEN (NEW.status = 'posted')
EXECUTE PROCEDURE upsert_daily_balance_for_tx();

-- NOTE: For backdated or edited transactions, run a background re-compute job.
