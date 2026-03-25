-- Phase 7: PURGE Stale Admin Data
-- 1. Delete orphaned users from auth.users (those without profiles)
-- Safeguard: Don't delete the current project owner if possible, but keep it general
DELETE FROM auth.users 
WHERE email IN (
    'tester_fresh@asterna.test',
    'test_tester_99@asterna.test',
    'tester_invited@asterna.test',
    'hacker_test_420@evil.com',
    'backup_agent_462@asterna.test'
);

-- 2. Delete redundant or stale invitations
DELETE FROM public.admin_invitations 
WHERE email IN (
    'test_tester_99@asterna.test',
    '003beauty@gmail.com'
);

-- 3. Verify
SELECT count(*) as orphan_count FROM auth.users WHERE email IN ('tester_fresh@asterna.test', 'test_tester_99@asterna.test', 'tester_invited@asterna.test', 'hacker_test_420@evil.com', 'backup_agent_462@asterna.test');
SELECT count(*) as invitation_count FROM public.admin_invitations WHERE email IN ('test_tester_99@asterna.test', '003beauty@gmail.com');
