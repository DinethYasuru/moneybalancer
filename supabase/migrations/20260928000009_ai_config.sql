-- Stores the user's own AI provider config (they bring their own API key,
-- since this app has no backend server to hold one safely — it's used
-- directly from their browser to their chosen provider).
alter table public.user_settings add column if not exists ai_config jsonb not null default '{"enabled": false, "provider": "openai_compatible", "base_url": "https://api.openai.com/v1", "api_key": "", "model": "gpt-4o-mini"}'::jsonb;
