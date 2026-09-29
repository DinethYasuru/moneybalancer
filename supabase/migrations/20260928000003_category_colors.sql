-- Give default categories a color/icon so the UI can show them distinctly,
-- and backfill any categories already seeded before this existed.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.categories (user_id, name, icon, color, is_default) values
    (new.id, 'Rent', '🏠', '#5b4fe8', true),
    (new.id, 'Electricity', '⚡', '#f0a93a', true),
    (new.id, 'Water', '💧', '#14b8a6', true),
    (new.id, 'Internet', '🌐', '#3b82f6', true),
    (new.id, 'Groceries', '🛒', '#17a673', true),
    (new.id, 'Transport', '🚗', '#f97316', true),
    (new.id, 'Dining Out', '🍽️', '#e0435c', true),
    (new.id, 'Subscriptions', '🔁', '#8b5cf6', true),
    (new.id, 'Health', '➕', '#ec4899', true),
    (new.id, 'Other', '📦', '#6b7280', true);
  return new;
end;
$$;

update public.categories set icon = '🏠', color = '#5b4fe8' where name = 'Rent' and color is null;
update public.categories set icon = '⚡', color = '#f0a93a' where name = 'Electricity' and color is null;
update public.categories set icon = '💧', color = '#14b8a6' where name = 'Water' and color is null;
update public.categories set icon = '🌐', color = '#3b82f6' where name = 'Internet' and color is null;
update public.categories set icon = '🛒', color = '#17a673' where name = 'Groceries' and color is null;
update public.categories set icon = '🚗', color = '#f97316' where name = 'Transport' and color is null;
update public.categories set icon = '🍽️', color = '#e0435c' where name = 'Dining Out' and color is null;
update public.categories set icon = '🔁', color = '#8b5cf6' where name = 'Subscriptions' and color is null;
update public.categories set icon = '➕', color = '#ec4899' where name = 'Health' and color is null;
update public.categories set icon = '📦', color = '#6b7280' where name = 'Other' and color is null;
update public.categories set icon = '🏷️', color = '#6b7280' where color is null;
