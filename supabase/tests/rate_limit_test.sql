\pset format unaligned
\pset tuples_only on
-- as service_role: first 3 hits allowed, 4th blocked (limit 3)
SET ROLE service_role;
SELECT 'hit1='||public.rate_limit_hit('t:1.2.3.4',3,60) || ' hit2='||public.rate_limit_hit('t:1.2.3.4',3,60) || ' hit3='||public.rate_limit_hit('t:1.2.3.4',3,60) || ' hit4='||public.rate_limit_hit('t:1.2.3.4',3,60);
SELECT 'other bucket unaffected='||public.rate_limit_hit('t:9.9.9.9',3,60);
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN PERFORM public.rate_limit_hit('x',1,1); RAISE NOTICE 'RATE: anon ALLOWED (BAD)'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'RATE: anon denied (good)'; END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN PERFORM public.rate_limit_hit('x',1,1); RAISE NOTICE 'RATE: authenticated ALLOWED (BAD)'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'RATE: authenticated denied (good)'; END $$;
