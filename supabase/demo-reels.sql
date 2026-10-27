-- Demo reels: 19 short vertical clips (Wikimedia Commons, credits in
-- demo-video-credits.json), each posted by a demo account that shares the
-- clip's topic, spread over the last 6 days, with likes from demo accounts.
-- Videos and covers live in Storage under the @chronos account's folder
-- (scripts/upload-demo-reels.mjs). Run once, after seed.sql.
do $$
begin
  if exists (select 1 from posts p join profiles a on a.id = p.author_id where p.type = 'reel' and a.is_demo) then
    raise exception 'Demo reels are already installed. Refusing to run twice.';
  end if;
end $$;

select setseed(0.61);

with clip(name, topic, caption, tags, secs, hours_ago) as (values
  ('art-1', 'art', 'Afternoon at the painters'' market — every canvas tells a story 🎨 #painting', '{art,painting}'::text[], 12.0, 20),
  ('art-2', 'art', 'Sugar painting: one pour, no second chances 🍬 #streetart', '{art,streetart}', 12.0, 70),
  ('cricket-1', 'cricket', 'Bowler''s worst nightmare — straight over the ropes 🏏 #six', '{cricket,six}', 9.4, 5),
  ('cricket-2', 'cricket', 'Pull shot for four. Saturday club cricket at its best', '{cricket}', 12.0, 52),
  ('fitness-1', 'fitness', 'Rowing intervals before breakfast 💪 #workout', '{fitness,workout}', 12.0, 30),
  ('food-1', 'food', 'Fresh chapatis off the pan, nothing beats it #homecooking', '{food,homecooking}', 12.0, 3),
  ('food-2', 'food', 'Idli batter day — fermentation is patience 🍚 #southindian', '{food,southindian}', 12.0, 90),
  ('music-1', 'music', 'Tabla in the village square 🥁 #tabla', '{music,tabla}', 12.0, 12),
  ('music-2', 'music', 'Evening guitar session 🎸 #guitar', '{music,guitar}', 12.0, 110),
  ('nature-1', 'nature', 'Watagataki falls — pure calm 🌿 #waterfall', '{nature,waterfall}', 12.0, 8),
  ('nature-2', 'nature', 'Shila waterfall in Zanskar, ice-cold and loud #travel', '{nature,travel}', 10.4, 60),
  ('pets-1', 'pets', 'The yawn of a cat who has done absolutely nothing all day 😼 #cat', '{pets,cat}', 12.0, 2),
  ('pets-2', 'pets', 'Puppies in slow motion = instant mood fix 🐶 #dogs', '{pets,dogs}', 12.0, 40),
  ('photography-1', 'photography', 'Fuji fading into the sunset — timelapse 📷 #timelapse', '{photography,timelapse}', 12.0, 26),
  ('photography-2', 'photography', 'Half Dome catching the last light #sunset', '{photography,sunset}', 10.4, 130),
  ('tech-1', 'tech', 'Built a robotic arm with an Arduino this weekend 🤖 #arduino', '{tech,arduino}', 12.0, 16),
  ('tech-2', 'tech', 'Delivery robot crossing the street like it owns the place #robots', '{tech,robots}', 12.0, 84),
  ('travel-1', 'travel', 'On the move — the journey is the destination #roadtrip', '{travel,roadtrip}', 12.0, 34),
  ('travel-2', 'travel', 'Toy train ride in Kerala 🚂 #kerala', '{travel,kerala}', 12.0, 100)
), author as (
  select distinct on (c.name) c.*, p.id as author_id
  from clip c join profiles p on p.is_demo and c.topic = any (p.interests)
  order by c.name, random()
), inserted as (
  insert into posts (author_id, type, image_url, video_url, duration, aspect, caption, tags, created_at)
  select author_id, 'reel',
    'https://obinuxhvezlvtqtzsnmj.supabase.co/storage/v1/object/public/media/2603b74f-35fc-420b-bcda-375b02e9af9f/demo/reel-' || name || '.jpg',
    'https://obinuxhvezlvtqtzsnmj.supabase.co/storage/v1/object/public/videos/2603b74f-35fc-420b-bcda-375b02e9af9f/demo/' || name || '.mp4',
    secs, 0.5625, caption, tags, now() - make_interval(hours => hours_ago)
  from author
  returning id, author_id, tags
)
-- Demo accounts like reels on topics they're into (about half of them).
insert into likes (user_id, post_id)
select p.id, i.id from inserted i join profiles p on p.is_demo and p.id <> i.author_id and p.interests && i.tags
where random() < 0.55
on conflict do nothing;

select count(*) as reels, sum(like_count) as likes from posts where type = 'reel';
