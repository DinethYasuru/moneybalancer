-- Internal transfers (main account -> secondary -> third party, all the
-- user's own money moving around) shouldn't count as real income or
-- expense. Add a third "transfer" direction so these can be recorded for
-- history without inflating expense/income totals. No account numbers or
-- other bank identifiers are ever stored here — just timestamp,
-- description, amount, and direction, same as every other transaction.

alter table public.statement_transactions drop constraint if exists statement_transactions_direction_check;
alter table public.statement_transactions add constraint statement_transactions_direction_check
  check (direction in ('debit', 'credit', 'transfer'));
