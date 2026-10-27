-- Chronos — database schema (applied 2026-10-27 through the Supabase MCP).
-- FOR A NEW, EMPTY PROJECT ONLY. It refuses to run if the app tables already
-- exist, because re-running it would delete every post, follow, like,
-- comment and message (this happened once on 2026-10-27). Change a live
-- database with a small migration instead.
do $$ begin
  if to_regclass('public.profiles') is not null then
    raise exception 'Chronos schema is already installed. Refusing to run: it would delete all user data. Use a migration for changes.';
  end if;
end $$;

-- ── Profiles ────────────────────────────────────────────────────────────
-- No foreign key to auth.users, so demo (seed) accounts can exist without
-- a login. Real users get a profile row with id = auth.uid() on sign-up.
create table profiles (
  id          uuid primary key default gen_random_uuid(),
  username    text unique not null check (username ~ '^[a-z0-9_.]{3,30}$'),
  full_name   text not null default '',
  bio         text not null default '',
  avatar_url  text not null default '',
  interests   text[] not null default '{}',
  onboarded   boolean not null default false,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table profiles add constraint profiles_full_name_len check (char_length(full_name) <= 50);
alter table profiles add constraint profiles_bio_len check (char_length(bio) <= 150);

create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index on follows (followee_id);

create table posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references profiles(id) on delete cascade,
  image_url     text not null,
  caption       text not null default '',
  tags          text[] not null default '{}',
  type          text not null default 'post' check (type in ('post', 'story')),
  expires_at    timestamptz,
  like_count    int not null default 0,
  comment_count int not null default 0,
  report_count  int not null default 0,
  created_at    timestamptz not null default now()
);
create index on posts (author_id, created_at desc);
create index on posts using gin (tags);
create index on posts (created_at desc);
-- Module 3: caption ≤ 2200, ≤ 10 tags, photos only from our own Storage.
alter table posts add constraint posts_caption_len check (char_length(caption) <= 2200);
alter table posts add constraint posts_tags_max check (cardinality(tags) <= 10);
alter table posts add constraint posts_image_from_storage
  check (image_url like 'https://obinuxhvezlvtqtzsnmj.supabase.co/storage/v1/object/public/media/%');

create table likes (
  user_id    uuid not null references profiles(id) on delete cascade,
  post_id    uuid not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index on likes (post_id);

create table comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  body       text not null check (length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index on comments (post_id, created_at);
alter table comments add constraint comments_body_not_blank check (btrim(body) <> '');  -- Module 8

create table saves (
  user_id    uuid not null references profiles(id) on delete cascade,
  post_id    uuid not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table see_less (
  user_id    uuid not null references profiles(id) on delete cascade,
  post_id    uuid not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table reports (
  user_id    uuid not null references profiles(id) on delete cascade,
  post_id    uuid not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- client_id makes sends idempotent: the offline outbox can retry safely.
create table messages (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid unique not null,
  sender_id    uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  body         text not null check (length(body) between 1 and 2000),
  seen_at      timestamptz,
  created_at   timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index on messages (sender_id, created_at desc);
create index on messages (recipient_id, created_at desc);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  actor_id   uuid not null references profiles(id) on delete cascade,
  kind       text not null check (kind in ('like', 'comment', 'follow')),
  post_id    uuid references posts(id) on delete cascade,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);

-- Ranking (server side only writes/reads these, with the user's token).
create table feed_prefs (
  user_id    uuid primary key references profiles(id) on delete cascade,
  weights    jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table feed_traces (
  user_id    uuid not null references profiles(id) on delete cascade,
  post_id    uuid not null references posts(id) on delete cascade,
  surface    text not null check (surface in ('feed', 'explore')),
  trace      jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id, surface)
);

-- ── Profile on sign-up ──────────────────────────────────────────────────
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
-- Creates the profile on sign-up. Username from the email (or metadata);
-- falls back to user_xxxxxx and avoids duplicates. Changed in onboarding.
declare
  clean text := regexp_replace(lower(coalesce(new.raw_user_meta_data->>'username',
                  split_part(coalesce(new.email, ''), '@', 1))), '[^a-z0-9_.]', '', 'g');
begin
  if length(clean) < 3 then clean := 'user_' || substr(md5(new.id::text), 1, 6); end if;
  clean := left(clean, 30);
  if exists (select 1 from profiles where username = clean) then
    clean := left(clean, 24) || '_' || substr(md5(new.id::text), 1, 4);
  end if;
  insert into profiles (id, username, full_name, avatar_url)
  values (new.id, clean, clean, 'https://api.dicebear.com/9.x/initials/svg?seed=' || clean)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Profiles for auth users created before this script ran.
insert into profiles (id, username, full_name, avatar_url)
select u.id,
       left(regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9_.]', '', 'g'), 24) || '_' || substr(md5(u.id::text), 1, 4),
       split_part(u.email, '@', 1),
       'https://api.dicebear.com/9.x/initials/svg?seed=' || split_part(u.email, '@', 1)
from auth.users u
on conflict (id) do nothing;

-- ── Counters + notifications (triggers) ─────────────────────────────────
create or replace function on_like_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update posts set like_count = like_count + 1 where id = new.post_id;
    insert into notifications (user_id, actor_id, kind, post_id)
    select p.author_id, new.user_id, 'like', p.id from posts p
    where p.id = new.post_id and p.author_id <> new.user_id;
    return new;
  else
    update posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end $$;
create trigger likes_count after insert or delete on likes
  for each row execute function on_like_change();

create or replace function on_comment_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update posts set comment_count = comment_count + 1 where id = new.post_id;
    insert into notifications (user_id, actor_id, kind, post_id)
    select p.author_id, new.user_id, 'comment', p.id from posts p
    where p.id = new.post_id and p.author_id <> new.user_id;
    return new;
  else
    update posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end $$;
create trigger comments_count after insert or delete on comments
  for each row execute function on_comment_change();

create or replace function on_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update posts set report_count = report_count + 1 where id = new.post_id;
  return new;
end $$;
create trigger reports_count after insert on reports
  for each row execute function on_report();

create or replace function on_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, kind) values (new.followee_id, new.follower_id, 'follow');
  return new;
end $$;
create trigger follows_notify after insert on follows
  for each row execute function on_follow();

-- ── Onboarding + messaging functions ────────────────────────────────────
-- All three run as the CALLER (security invoker), so RLS applies inside.
-- Errors are short codes; the app turns them into plain English.

-- Live username check on the onboarding screen.
create or replace function username_available(name text) returns boolean
language sql security invoker set search_path = public stable as $$
  select lower(name) ~ '^[a-z0-9_.]{3,30}$'
     and not exists (select 1 from profiles where username = lower(name) and id is distinct from (select auth.uid()));
$$;

-- Finishes onboarding in one call: username + interests, then follows a few
-- demo accounts with the same interests so the first feed is never empty
-- (the "cold start" problem every recommender has).
create or replace function complete_onboarding(p_username text, p_interests text[]) returns void
language plpgsql security invoker set search_path = public as $$
declare
  me    uuid := (select auth.uid());
  clean text := lower(trim(p_username));
begin
  if me is null then raise exception 'not_logged_in'; end if;
  if clean !~ '^[a-z0-9_.]{3,30}$' then raise exception 'username_invalid'; end if;
  if exists (select 1 from profiles where username = clean and id <> me) then raise exception 'username_taken'; end if;
  update profiles
     set username = clean, full_name = clean,
         avatar_url = 'https://api.dicebear.com/9.x/initials/svg?seed=' || clean,
         interests = coalesce(p_interests[1:6], '{}'), onboarded = true
   where id = me;
  insert into follows (follower_id, followee_id)
  select me, p.id from profiles p
   where p.is_demo and p.interests && p_interests and p.id <> me
   order by random() limit 6
  on conflict do nothing;
end $$;

-- Mark a conversation as seen. Works through the "recipient marks seen"
-- policy + the seen_at-only column grant below.
create or replace function mark_seen(partner uuid) returns void
language sql security invoker set search_path = public as $$
  update messages set seen_at = now()
  where recipient_id = (select auth.uid()) and sender_id = partner and seen_at is null;
$$;

-- ── Row Level Security ──────────────────────────────────────────────────
alter table profiles      enable row level security;
alter table follows       enable row level security;
alter table posts         enable row level security;
alter table likes         enable row level security;
alter table comments      enable row level security;
alter table saves         enable row level security;
alter table see_less      enable row level security;
alter table reports       enable row level security;
alter table messages      enable row level security;
alter table notifications enable row level security;
alter table feed_prefs    enable row level security;
alter table feed_traces   enable row level security;

create policy "profiles readable" on profiles for select to authenticated using (true);
create policy "edit own profile"  on profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "follows readable" on follows for select to authenticated using (true);
create policy "follow as self"   on follows for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "unfollow as self" on follows for delete to authenticated using (follower_id = (select auth.uid()));

create policy "posts readable" on posts for select to authenticated
  using (type = 'post' or expires_at is null or expires_at > now());
create policy "post as self"   on posts for insert to authenticated with check (author_id = (select auth.uid()));
create policy "delete own post" on posts for delete to authenticated using (author_id = (select auth.uid()));
create policy "edit own caption" on posts for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

create policy "likes readable" on likes for select to authenticated using (true);
create policy "like as self"   on likes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "unlike as self" on likes for delete to authenticated using (user_id = (select auth.uid()));

create policy "comments readable" on comments for select to authenticated using (true);
create policy "comment as self"   on comments for insert to authenticated with check (user_id = (select auth.uid()));
create policy "delete own comment" on comments for delete to authenticated using (user_id = (select auth.uid()));
-- Module 8: post authors may remove comments on their own posts.
create policy "post author removes comments" on comments for delete to authenticated
  using (exists (select 1 from posts p where p.id = comments.post_id and p.author_id = (select auth.uid())));

-- Private signals: only the owner sees their saves / see-less / reports.
create policy "own saves"    on saves    for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own see_less" on see_less for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own reports"  on reports  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read own messages" on messages for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy "send as self" on messages for insert to authenticated with check (sender_id = (select auth.uid()));
create policy "recipient marks seen" on messages for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

create policy "own notifications" on notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "mark notifications read" on notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own prefs"  on feed_prefs  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own traces" on feed_traces for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── API access (Data API) ──────────────────────────────────────────────
-- Since 2026 new tables are not exposed to the Data API automatically, so
-- access is granted explicitly. Only logged-in users get access; RLS above
-- decides which rows. The anon role gets nothing.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- Profiles: users may change only their editable fields (never id, is_demo,
-- created_at). Added in Module 2.
revoke update on profiles from authenticated;
grant update (username, full_name, bio, avatar_url, interests, onboarded) on profiles to authenticated;
-- Posts: authors may edit only the caption (Module 3).
revoke update on posts from authenticated;
grant update (caption) on posts to authenticated;
-- Comments, likes, saves, see_less, reports, follows are never updated (Module 8).
revoke update on comments, likes, saves, see_less, reports, follows from authenticated;

-- Messages: recipients may change seen_at only (column-level grant).
revoke update on messages from authenticated;
grant update (seen_at) on messages to authenticated;

-- Functions: Postgres and Supabase let roles call new functions by default.
-- Trigger functions must never be callable through the API; app functions
-- only by logged-in users. (Security advisor: 0 findings on 2026-10-27.)
revoke execute on function handle_new_user(), on_like_change(), on_comment_change(), on_report(), on_follow()
  from public, anon, authenticated;
revoke execute on function mark_seen(uuid), complete_onboarding(text, text[]), username_available(text) from public, anon;
grant execute on function mark_seen(uuid), complete_onboarding(text, text[]), username_available(text) to authenticated;

-- Indexes for foreign keys (performance advisor).
create index if not exists comments_user_id_idx on comments (user_id);
create index if not exists feed_traces_post_id_idx on feed_traces (post_id);
create index if not exists notifications_actor_id_idx on notifications (actor_id);
create index if not exists notifications_post_id_idx on notifications (post_id);
create index if not exists reports_post_id_idx on reports (post_id);
create index if not exists saves_post_id_idx on saves (post_id);
create index if not exists see_less_post_id_idx on see_less (post_id);

-- ── Realtime ────────────────────────────────────────────────────────────
do $$ begin
  begin alter publication supabase_realtime add table messages;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table notifications; exception when duplicate_object then null; end;
end $$;

-- ── Storage: public "media" bucket; users upload into their own folder ──
insert into storage.buckets (id, name, public) values ('media', 'media', true)
on conflict (id) do update set public = true;

-- Photos only, max 5 MB per file (Module 3).
update storage.buckets set file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'media';

drop policy if exists "media upload own folder" on storage.objects;
create policy "media upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "media delete own folder" on storage.objects;
create policy "media delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Deleting a file needs to SELECT it first (RLS), so owners may read rows of
-- their own folder only — nobody can list other people's files (Module 3).
drop policy if exists "media read own folder" on storage.objects;
create policy "media read own folder" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ── Module 7: search ────────────────────────────────────────────────────
create extension if not exists pg_trgm with schema extensions;
-- Trigram indexes: fast "contains" search on usernames and names at scale.
create index if not exists profiles_username_trgm on profiles using gin (username extensions.gin_trgm_ops);
create index if not exists profiles_full_name_trgm on profiles using gin (full_name extensions.gin_trgm_ops);
-- Topic search: tags starting with the query, most-used first; an empty
-- query returns the most popular topics. Runs as the caller (RLS applies).
create or replace function search_tags(q text) returns table (tag text, posts bigint)
language sql stable security invoker set search_path = public as $$
  select t as tag, count(*) as posts
  from posts, unnest(tags) as t
  where type = 'post'
    and t like regexp_replace(lower(coalesce(q, '')), '[^a-z0-9_]', '', 'g') || '%'
  group by t
  order by count(*) desc, t
  limit 10;
$$;
revoke execute on function search_tags(text) from public, anon;
grant execute on function search_tags(text) to authenticated;

-- ── Module 5: Stories (posts with type = 'story') ───────────────────────
-- Every story expires 24 h after posting, whatever the app sends; posts
-- never expire. Demo stories: supabase/demo-stories.sql (re-run before demos).
create or replace function set_story_expiry() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.type = 'story' then
    new.expires_at := now() + interval '24 hours';
    new.tags := '{}';
  else
    new.expires_at := null;
  end if;
  return new;
end $$;
create trigger posts_story_expiry before insert on posts for each row execute function set_story_expiry();
revoke execute on function set_story_expiry() from public, anon, authenticated;

-- Who has seen which story (unseen ring + "Seen by").
create table story_views (
  story_id  uuid not null references posts(id) on delete cascade,
  viewer_id uuid not null references profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
create index story_views_viewer_idx on story_views (viewer_id);
alter table story_views enable row level security;
create policy "record own view of a live story" on story_views for insert to authenticated
  with check (viewer_id = (select auth.uid())
    and exists (select 1 from posts p where p.id = story_id and p.type = 'story'));
create policy "own views and views of my stories" on story_views for select to authenticated
  using (viewer_id = (select auth.uid())
    or exists (select 1 from posts p where p.id = story_id and p.author_id = (select auth.uid())));
grant select, insert on story_views to authenticated;
create index posts_story_live_idx on posts (author_id, expires_at) where type = 'story';

-- Photo shape (width / height) saved at upload; the feed shows posts at
-- their real shape (clamped 4:5 … 1.91:1) instead of cropping to a square.
alter table posts add column aspect real;
alter table posts add constraint posts_aspect_range check (aspect is null or aspect between 0.3 and 3.5);
