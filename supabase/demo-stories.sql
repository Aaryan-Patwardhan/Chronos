-- Chronos demo stories. Stories expire 24 hours after posting, so run this
-- again shortly before a demo (it replaces only the DEMO accounts' stories;
-- real users' stories are never touched).
-- Every demo account gets 1–3 stories, using photos from its own posts,
-- posted at different times over the last ~20 hours.
delete from posts where type = 'story' and author_id in (select id from profiles where is_demo);

insert into posts (author_id, image_url, caption, type)
select ph.author_id, ph.image_url, '', 'story'
from (
  select author_id, image_url,
         row_number() over (partition by author_id order by created_at desc) as k
  from posts where type = 'post' and author_id in (select id from profiles where is_demo)
) ph
join (select id, row_number() over (order by username) as n from profiles where is_demo) pk on pk.id = ph.author_id
where ph.k <= 1 + (pk.n % 3);

-- Spread the posting times (the 24 h expiry follows each story's own time).
update posts p
   set created_at = s.t, expires_at = s.t + interval '24 hours'
  from (select id, now() - make_interval(mins => abs(hashtext(id::text)) % 1200) as t
          from posts where type = 'story' and author_id in (select id from profiles where is_demo)) s
 where p.id = s.id;

select count(*) as demo_stories, count(distinct author_id) as accounts,
       min(expires_at) as first_expiry
from posts where type = 'story' and expires_at > now();
