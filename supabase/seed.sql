-- Chronos demo data: 30 demo accounts with interests, 200 posts, follows and
-- likes, generated inside Postgres (fixed random seed → same data each run).
-- Safe to re-run: deletes previous demo accounts first (cascades to their
-- posts, follows, likes). Real users are not touched.
do $$
declare
  firsts text[] := array['aarav','isha','kabir','meera','rohan','sana','vikram','ananya','arjun','diya',
    'ishaan','kavya','neel','pooja','rahul','riya','samar','tara','yash','zara','aditya','nisha','omkar',
    'priya','siddharth','tanvi','varun','aditi','dev','leena'];
  lasts  text[] := array['shah','patil','iyer','mehta','kulkarni','reddy','singh','joshi','nair','desai'];
  tags   text[] := array['food','travel','tech','fitness','art','music','nature','pets','cricket','photography'];
  caps   jsonb := '{
    "food": ["Street food crawl tonight", "Homemade biryani, finally got it right", "Best vada pav in the city?", "Sunday brunch done right"],
    "travel": ["Monsoon drive to the ghats", "Sunrise from the fort", "Weekend escape to the coast", "Hidden waterfall trek"],
    "tech": ["New desk setup", "Shipped my first open-source PR", "Late night debugging session", "Mechanical keyboard build"],
    "fitness": ["5 am run club", "New deadlift PR", "Yoga by the lake", "Leg day, no excuses"],
    "art": ["Watercolour practice", "Finished this sketch today", "Gallery visit", "Ink drawing study"],
    "music": ["Jam session with the band", "Vinyl haul", "Live gig last night", "Learning a new raga"],
    "nature": ["Fog over the valley", "Wildflowers everywhere", "Rainy evening", "Starry night camping"],
    "pets": ["Meet my new puppy", "Cat supervising my work", "Beach day with the dog", "Sleepy kitten"],
    "cricket": ["Gully cricket Sunday", "Stadium vibes", "Practice nets", "Match day"],
    "photography": ["Golden hour portraits", "Street photography walk", "Shot on 50mm", "Long exposure test"]
  }';
  ids uuid[] := '{}';
  i int; t1 text; t2 text; ln text; main text; uid uuid; author int;
begin
  perform setseed(0.27);
  delete from profiles where is_demo;

  for i in 1..30 loop
    ln := lasts[1 + floor(random() * 10)::int];
    t1 := tags[1 + floor(random() * 10)::int];
    loop t2 := tags[1 + floor(random() * 10)::int]; exit when t2 <> t1; end loop;
    insert into profiles (username, full_name, bio, avatar_url, interests, onboarded, is_demo)
    values (firsts[i] || '.' || ln, initcap(firsts[i]) || ' ' || initcap(ln), 'Into ' || t1 || ' & ' || t2,
            'https://api.dicebear.com/9.x/initials/svg?seed=' || firsts[i] || '.' || ln, array[t1, t2], true, true)
    returning id into uid;
    ids := ids || uid;
  end loop;

  for i in 1..200 loop
    author := 1 + (i % 30);
    select case when random() < 0.8 then p.interests[1 + floor(random() * 2)::int] else tags[1 + floor(random() * 10)::int] end
      into main from profiles p where p.id = ids[author];
    insert into posts (author_id, image_url, caption, tags, created_at)
    values (ids[author],
            -- Topic-matched photos in our own Storage (uploaded by
            -- scripts/upload-demo-images.mjs under the @chronos account;
            -- credits in supabase/demo-image-credits.json).
            'https://obinuxhvezlvtqtzsnmj.supabase.co/storage/v1/object/public/media/2603b74f-35fc-420b-bcda-375b02e9af9f/demo/'
              || main || '-' || (1 + (i % 8)) || '.jpg',
            (caps -> main ->> floor(random() * 4)::int) || ' #' || main,
            array[main],
            now() - make_interval(mins => floor(random() * 7 * 24 * 60)::int));
  end loop;

  insert into follows (follower_id, followee_id)
  select a.id, b.id from profiles a
  cross join lateral (select id from profiles b where b.is_demo and b.id <> a.id and b.interests && a.interests order by random() limit 5) b
  where a.is_demo on conflict do nothing;
  insert into follows (follower_id, followee_id)
  select a.id, b.id from profiles a
  cross join lateral (select id from profiles b where b.is_demo and b.id <> a.id and not (b.interests && a.interests) order by random() limit 3) b
  where a.is_demo on conflict do nothing;

  insert into likes (user_id, post_id)
  select a.id, x.id from profiles a
  cross join lateral (select id from posts p where p.author_id <> a.id and p.tags && a.interests order by random() limit 18) x
  where a.is_demo on conflict do nothing;
  insert into likes (user_id, post_id)
  select a.id, x.id from profiles a
  cross join lateral (select id from posts p where p.author_id <> a.id order by random() limit 5) x
  where a.is_demo on conflict do nothing;

  -- Seeding fires the like/follow notification triggers; demo accounts don't need them.
  delete from notifications where user_id in (select id from profiles where is_demo);
end $$;

select (select count(*) from profiles where is_demo) as demo_users,
       (select count(*) from posts) as posts,
       (select count(*) from follows) as follows,
       (select count(*) from likes) as likes;
