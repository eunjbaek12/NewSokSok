begin;
select plan(8);

insert into auth.users(id,email,is_anonymous,created_at) values
 ('91000000-0000-0000-0000-000000000001',null,true,now()-interval '2 days'),
 ('91000000-0000-0000-0000-000000000002','free@test.dev',false,now()-interval '2 days'),
 ('91000000-0000-0000-0000-000000000003','pro@test.dev',false,now()-interval '2 days');
update public.user_subscriptions set tier='pro',pro_until=now()+interval '30 days'
 where user_id='91000000-0000-0000-0000-000000000003';

select is((select tier from public.ai_effective_plan('91000000-0000-0000-0000-000000000001')),'guest','anonymous user resolves to guest');
select is((select day_limit from public.ai_effective_plan('91000000-0000-0000-0000-000000000001')),10,'guest gets 10 per day');
select is((select day_limit from public.ai_effective_plan('91000000-0000-0000-0000-000000000002')),50,'free gets 50 per day');
select is((select month_limit from public.ai_effective_plan('91000000-0000-0000-0000-000000000003')),5000,'pro gets 5000 per month');
select is((select day_limit from public.ai_effective_plan('91000000-0000-0000-0000-000000000003')),1000,'pro daily abuse cap remains 1000');
select is((select reward_amount from public.ai_effective_plan('91000000-0000-0000-0000-000000000001')),10,'guest reward is server-owned 10');
select is((select reward_amount from public.ai_effective_plan('91000000-0000-0000-0000-000000000002')),20,'free reward is server-owned 20');
select is((select reward_max_views from public.ai_effective_plan('91000000-0000-0000-0000-000000000002')),2,'free has two rewarded views');

select * from finish();
rollback;
