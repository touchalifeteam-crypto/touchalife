-- ============================================================
-- TEMPORARY FIX: Add anon access to non_eligible_students and eligible_students
-- ============================================================
-- If the issue is RLS policies not allowing unauthenticated OR
-- authenticated users to read, this will temporarily allow anon access too.
-- ============================================================

-- Add anon read access to non_eligible_students (if not exists)
CREATE POLICY "Enable read for anon" ON public.non_eligible_students
    FOR SELECT TO anon USING (true);

-- Add anon read access to eligible_students (if not exists)
CREATE POLICY "Enable read for anon" ON public.eligible_students
    FOR SELECT TO anon USING (true);

-- Verify policies exist
SELECT 
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE tablename IN ('non_eligible_students', 'eligible_students')
AND schemaname = 'public'
ORDER BY tablename, policyname;
