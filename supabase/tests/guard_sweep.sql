\pset format unaligned
\pset tuples_only on
CREATE OR REPLACE FUNCTION pg_temp.sweep() RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; call text; who text; sq text; bad int := 0; total int := 0; denied int := 0; adm_ok int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.pronargs,
      (SELECT string_agg('NULL::'||format_type(t,NULL), ',' ORDER BY ord) FROM unnest(p.proargtypes) WITH ORDINALITY u(t,ord)) AS nulls
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosrc LIKE '%app_private.assert_staff()%'
  LOOP
    total := total + 1;
    call := format('SELECT * FROM public.%I(%s)', r.proname, coalesce(r.nulls,''));
    FOREACH who IN ARRAY ARRAY['anon','mallory','admin'] LOOP
      PERFORM set_config('request.jwt.claim.sub', CASE who WHEN 'anon' THEN '' WHEN 'admin' THEN '11111111-1111-1111-1111-111111111111' ELSE '33333333-3333-3333-3333-333333333333' END, true);
      PERFORM set_config('request.jwt.claim.role', CASE who WHEN 'anon' THEN 'anon' ELSE 'authenticated' END, true);
      EXECUTE 'SET LOCAL ROLE ' || CASE who WHEN 'anon' THEN 'anon' ELSE 'authenticated' END;
      BEGIN
        EXECUTE call;
        sq := 'ok';
      EXCEPTION WHEN OTHERS THEN
        sq := SQLSTATE;
      END;
      RESET ROLE;
      IF who = 'admin' THEN
        IF sq = '42501' THEN bad := bad + 1; RAISE NOTICE 'FAIL admin blocked: %', r.proname; ELSE adm_ok := adm_ok + 1; END IF;
      ELSE
        IF sq = '42501' THEN denied := denied + 1; ELSE bad := bad + 1; RAISE NOTICE 'FAIL % reached %: sqlstate %', who, r.proname, sq; END IF;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'SWEEP: % wrapped functions | non-staff denied %/% | admin reached impl %/% | failures %', total, denied, total*2, adm_ok, total, bad;
END $$;
SELECT pg_temp.sweep();
