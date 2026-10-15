-- ====================================================================
-- HALBA demo data: 12 fictional young talents across different skills,
-- with posts, claps, typed comments, supports and two teams.
-- Run in Supabase -> SQL Editor (after migrations 001–006).
-- Re-runnable: it first removes any previous demo accounts.
-- All demo logins:  <username>@demo.halba.app  /  Halba2026!
-- Remove everything:  delete from auth.users where email like '%@demo.halba.app';
-- Photos are Unsplash images hot-linked per Unsplash's API terms.
-- ====================================================================

alter table public.profiles add column if not exists is_demo boolean not null default false;

delete from auth.users where email like '%@demo.halba.app';

do $$
declare
  pw text := extensions.crypt('Halba2026!', extensions.gen_salt('bf'));
  k record;
  uid uuid;
  pid uuid;
  u jsonb := '{}'::jsonb;   -- username -> user id
  p jsonb := '{}'::jsonb;   -- username -> first post id
  img_swim text := 'https://images.unsplash.com/photo-1730244548329-4ae2f4fcaa7c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080';
  img_foot text := 'https://images.unsplash.com/photo-1635272024682-1fe2937e3eff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080';
  img_chess text := 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080';
  img_oud text := 'https://images.unsplash.com/photo-1593550573849-1d608bb469ca?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080';
  img_khat text := 'https://images.unsplash.com/photo-1628962691167-27b7db9997e0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080';
  img_track text := 'https://images.unsplash.com/photo-1760114852702-9c65fe257a52?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080';
  img_game text := 'https://images.unsplash.com/photo-1614179924047-e1ab49a0a0cf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080';
  img_draw text := 'https://images.unsplash.com/photo-1593472807861-5bb884af28f6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080';
  img_hoop text := 'https://images.unsplash.com/photo-1602357280104-742c517a1d82?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080';
begin
  -- ---------- people ----------
  for k in select * from (values
    ('noura_swims',  'Noura Al-Rashidi',  'female', 'Kuwait',       'Salmiya',   'Swimming',        2012, 'Freestyle and fly. Chasing the U15 national qualifying time.'),
    ('yousef10',     'Yousef Al-Mutairi', 'male',   'Kuwait',       'Jahra',     'Football',        2010, 'Winger, left foot. Jahra school league.'),
    ('fatima_chess', 'Fatima Hassan',     'female', 'Egypt',        'Hawalli',   'Chess',           2014, 'Rated 1480. Sicilian for life.'),
    ('abdullah_oud', 'Abdullah Al-Enezi', 'male',   'Kuwait',       'Farwaniya', 'Oud',             2009, 'Learning maqamat the old way — by ear.'),
    ('maryam_khat',  'Maryam Khalid',     'female', 'Saudi Arabia', 'Mangaf',    'Calligraphy',     2011, 'Thuluth and Naskh. Ink on everything.'),
    ('omar_runs',    'Omar Siddiqui',     'male',   'Pakistan',     'Salmiya',   'Running',         2013, '100m and 200m. Fastest in my grade, working on the school.'),
    ('lina_gg',      'Lina Haddad',       'female', 'Lebanon',      'Hawalli',   'Esports',         2010, 'Valorant IGL. Building the first all-girls school team in Kuwait.'),
    ('ahmed_draws',  'Ahmed Nasser',      'male',   'Jordan',       'Jabriya',   'Drawing',         2015, 'Pencil portraits. Faces are hard, so I draw faces.'),
    ('sara_hoops',   'Sara Al-Otaibi',    'female', 'Kuwait',       'Fahaheel',  'Basketball',      2011, 'Point guard. Fahaheel girls league.'),
    ('hamza_quran',  'Hamza Ali',         'male',   'India',        'Farwaniya', 'Quran recitation',2016, 'Memorising with my father every morning before school.'),
    ('dana_gym',     'Dana Al-Khaldi',    'female', 'Kuwait',       'Salwa',     'Gymnastics',      2017, 'Beam and floor. Not scared of the beam anymore.'),
    ('khalid_robots','Khalid Mansour',    'male',   'Syria',        'Khaitan',   'Robotics',        2012, 'Arduino, sensors, and a line-follower that finally follows the line.')
  ) as t(username, name, gender, nationality, city, skill, byear, about)
  loop
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      k.username || '@demo.halba.app', pw, now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('name', k.name), now() - interval '20 days', now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', k.username || '@demo.halba.app', 'email_verified', true),
      'email', now(), now(), now());
    insert into public.profiles (id, name, username, city, skill, about, gender, nationality, residence,
      birth_year, age_bracket, guardian_managed, is_demo, created_at)
    values (uid, k.name, k.username, k.city, k.skill, k.about, k.gender, k.nationality, 'Kuwait',
      k.byear,
      case when 2026 - k.byear < 12 then 'U12' when 2026 - k.byear < 15 then 'U15' when 2026 - k.byear < 18 then 'U18' else 'OPEN' end,
      2026 - k.byear < 13, true, now() - interval '20 days');
    u := u || jsonb_build_object(k.username, uid::text);
  end loop;

  -- ---------- posts ----------
  for k in select * from (values
    ('noura_swims',  '50m freestyle in 31.2s at Salmiya pool today. New personal best — 0.8s off the U15 qualifying time. 🏊‍♀️', img_swim, 1),
    ('yousef10',     'Hat-trick in the school league final. 4–1. Coach said the second one was the best goal he has seen this season. ⚽', img_foot, 2),
    ('fatima_chess', 'Won the Hawalli U12 Open with 5/5. Last game: Sicilian Najdorf, 34 moves, opponent resigned after a knight sacrifice on f5.', img_chess, 3),
    ('abdullah_oud', 'First full taqsim in maqam Hijaz without stopping. Three months of practice for four minutes of music. Worth it.', img_oud, 4),
    ('maryam_khat',  'Thuluth practice: "العلم نور". Still fighting the letter ع — it never sits right on the first try.', img_khat, 5),
    ('omar_runs',    '100m in 12.9s at school sports day. Last year it was 14.1. Next target: under 12.5 before summer.', img_track, 6),
    ('lina_gg',      'Top 8 in the Kuwait schools Valorant cup. First all-girls team to reach the quarter-finals. We are not done. 🎮', img_game, 7),
    ('ahmed_draws',  'Portrait of my cousin — she sat for me for an hour, the rest was from a photo. Pencil on A3, about six hours over two weekends. She said the eyes are right.', img_draw, 8),
    ('sara_hoops',   '22 points in the Fahaheel league semi-final, 7 of 9 from three. Final is next Friday. 🏀', img_hoop, 9),
    ('hamza_quran',  'Recited Juz'' Amma from memory in front of the whole school assembly today. My father cried. Now starting Juz'' Tabarak. 🤲', null, 10),
    ('dana_gym',     'First back walkover on the beam without a spot! Coach filmed it so I can show everyone.', null, 11),
    ('khalid_robots','Our line-follower robot finished the course in 41 seconds — 2nd place at the school robotics day. Lost first by 2 seconds. Rebuilding the sensor mount this week.', null, 12),
    ('noura_swims',  'Morning session: 2,400m. Kick set finally felt right. Nationals in 6 weeks.', null, 13),
    ('yousef10',     'Free-kick practice after school: 7 out of 10 in the top corner. The other 3 hit the wall.', null, 14),
    ('omar_runs',    'Question for the fast people here: how do you stop looking at the runner next to you? I lose 0.2s every time.', null, 15)
  ) as t(username, caption, media, n)
  loop
    pid := gen_random_uuid();
    insert into public.posts (id, user_id, caption, media_url, media_type, created_at)
    values (pid, (u->>k.username)::uuid, k.caption, k.media, case when k.media is null then null else 'image' end,
      now() - (k.n * interval '14 hours'));
    if not (p ? k.username) then p := p || jsonb_build_object(k.username, pid::text); end if;
  end loop;

  -- ---------- claps: everyone claps a few posts ----------
  insert into public.claps (post_id, user_id, created_at)
  select po.id, pr.id, po.created_at + interval '2 hours'
  from public.posts po
  join public.profiles pr on pr.is_demo and pr.id <> po.user_id
  join public.profiles au on au.id = po.user_id and au.is_demo
  where (abs(hashtext(po.id::text || pr.id::text)) % 10) < 6
  on conflict do nothing;

  -- ---------- typed comments ----------
  insert into public.comments (post_id, user_id, kind, body, created_at) values
    ((p->>'noura_swims')::uuid,  (u->>'omar_runs')::uuid,    'appreciate', 'That turn at 25m was clean. Congrats on the PB!', now() - interval '13 hours'),
    ((p->>'noura_swims')::uuid,  (u->>'dana_gym')::uuid,     'ask',        'How many sessions a week do you train?', now() - interval '12 hours'),
    ((p->>'noura_swims')::uuid,  (u->>'sara_hoops')::uuid,   'suggest',    'Try breathing every 3 strokes in the last 15m — it kept my cousin''s head steadier.', now() - interval '11 hours'),
    ((p->>'yousef10')::uuid,     (u->>'khalid_robots')::uuid,'appreciate', 'Three goals in a final. Unreal.', now() - interval '26 hours'),
    ((p->>'yousef10')::uuid,     (u->>'sara_hoops')::uuid,   'suggest',    'Post the video of the second goal — people need to see it.', now() - interval '25 hours'),
    ((p->>'fatima_chess')::uuid, (u->>'khalid_robots')::uuid,'ask',        'What do you do when they play 3.Bb5 instead?', now() - interval '40 hours'),
    ((p->>'fatima_chess')::uuid, (u->>'ahmed_draws')::uuid,  'appreciate', '5/5 is perfect. Hawalli champion!', now() - interval '39 hours'),
    ((p->>'abdullah_oud')::uuid, (u->>'maryam_khat')::uuid,  'appreciate', 'Hijaz is the hardest to keep in tune. Respect.', now() - interval '54 hours'),
    ((p->>'maryam_khat')::uuid,  (u->>'ahmed_draws')::uuid,  'suggest',    'Hold the qalam flatter for ع — the first curve needs the wide edge.', now() - interval '68 hours'),
    ((p->>'omar_runs')::uuid,    (u->>'yousef10')::uuid,     'appreciate', '1.2 seconds in a year. That is massive.', now() - interval '82 hours'),
    ((p->>'omar_runs')::uuid,    (u->>'noura_swims')::uuid,  'suggest',    'Work on the first 30m — your start looked slow in the sports day video.', now() - interval '81 hours'),
    ((p->>'lina_gg')::uuid,      (u->>'fatima_chess')::uuid, 'appreciate', 'Quarter-finals as the first girls team. History.', now() - interval '96 hours'),
    ((p->>'ahmed_draws')::uuid,  (u->>'maryam_khat')::uuid,  'ask',        'Which pencils? The shading in the hair is so soft.', now() - interval '110 hours'),
    ((p->>'sara_hoops')::uuid,   (u->>'yousef10')::uuid,     'appreciate', '7 of 9 from three?? Good luck in the final.', now() - interval '124 hours'),
    ((p->>'hamza_quran')::uuid,  (u->>'abdullah_oud')::uuid, 'appreciate', 'Ma sha Allah. Juz Tabarak next — you can do it.', now() - interval '138 hours'),
    ((p->>'dana_gym')::uuid,     (u->>'noura_swims')::uuid,  'appreciate', 'No spot! That is the scary part done.', now() - interval '152 hours'),
    ((p->>'khalid_robots')::uuid,(u->>'lina_gg')::uuid,      'ask',        'Which sensor are you using for the line? IR array or camera?', now() - interval '166 hours');

  -- ---------- supports ----------
  insert into public.supports (supporter_id, supported_id, created_at)
  select a.id, b.id, now() - interval '5 days'
  from public.profiles a join public.profiles b on a.is_demo and b.is_demo and a.id <> b.id
  where (abs(hashtext(a.id::text || b.id::text)) % 10) < 5
  on conflict do nothing;

  -- ---------- teams ----------
  pid := gen_random_uuid();
  insert into public.teams (id, name, handle, skill, city, about, admin_id, created_at)
  values (pid, 'Salmiya Sharks', 'salmiya_sharks', 'Swimming', 'Salmiya',
    'Youth swim squad training at the Salmiya pool. Ages 8–16, all strokes. Message Noura to join.', (u->>'noura_swims')::uuid, now() - interval '10 days');
  insert into public.team_members (team_id, user_id, status, role, requested_at, approved_at) values
    (pid, (u->>'noura_swims')::uuid, 'approved', 'admin',  now() - interval '10 days', now() - interval '10 days'),
    (pid, (u->>'dana_gym')::uuid,    'approved', 'member', now() - interval '8 days',  now() - interval '7 days'),
    (pid, (u->>'omar_runs')::uuid,   'pending',  'member', now() - interval '1 day',   null);

  pid := gen_random_uuid();
  insert into public.teams (id, name, handle, skill, city, about, admin_id, created_at)
  values (pid, 'Hawalli Chess Club', 'hawalli_chess', 'Chess', 'Hawalli',
    'Weekly blitz on Saturdays at the Hawalli youth centre. Bring a clock.', (u->>'fatima_chess')::uuid, now() - interval '9 days');
  insert into public.team_members (team_id, user_id, status, role, requested_at, approved_at) values
    (pid, (u->>'fatima_chess')::uuid,  'approved', 'admin',  now() - interval '9 days', now() - interval '9 days'),
    (pid, (u->>'khalid_robots')::uuid, 'approved', 'member', now() - interval '6 days', now() - interval '5 days'),
    (pid, (u->>'ahmed_draws')::uuid,   'approved', 'member', now() - interval '4 days', now() - interval '4 days');
end $$;

select count(*) as demo_profiles from public.profiles where is_demo;
