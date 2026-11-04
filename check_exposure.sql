-- Lists SECURITY DEFINER functions in public that anon or authenticated can run.
\pset format aligned
SELECT p.proname AS function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_can_run,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS logged_in_can_run
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
  AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
ORDER BY 2 DESC, 1;
SELECT count(*) AS total_exposed_to_anon
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE');
