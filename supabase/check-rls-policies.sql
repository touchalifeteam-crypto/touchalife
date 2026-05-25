-- ============================================================
-- DIAGNOSTIC: Check RLS policies on non_eligible_students
-- ============================================================

-- Check if RLS is enabled
SELECT 
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('non_eligible_students', 'eligible_students')
AND schemaname = 'public';

-- Check existing policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('non_eligible_students', 'eligible_students')
AND schemaname = 'public'
ORDER BY tablename, policyname;

-- Test: Count records in non_eligible_students
SELECT COUNT(*) as total_records FROM public.non_eligible_students;

-- Test: Show first few records
SELECT id, email, full_name, status, created_at 
FROM public.non_eligible_students 
LIMIT 5;
