-- ============================================================
-- Diagnostics-only SQL for approve/disapprove backend behavior
-- ============================================================
-- This file is intentionally non-destructive.
-- It contains only SELECT statements to verify trigger, table, and
-- data state without making any database changes.
-- ============================================================

-- 1) Verify the admin_student_info status-change trigger exists
SELECT
  'Trigger verification:' AS check_type,
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  proname AS function_name,
  CASE
    WHEN tgname = 'trg_admin_student_info_status_change' THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END AS status
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgrelid = 'public.admin_student_info'::regclass
  AND NOT tgisinternal;

-- 2) Show current counts for verification
SELECT 'admin_student_info' AS table_name, status, COUNT(*) AS count
FROM public.admin_student_info
GROUP BY status
UNION ALL
SELECT 'eligible_students' AS table_name, status, COUNT(*) AS count
FROM public.eligible_students
GROUP BY status
UNION ALL
SELECT 'non_eligible_students' AS table_name, status, COUNT(*) AS count
FROM public.non_eligible_students
GROUP BY status;

-- 3) Diagnostic checks for inconsistent/missing rows
SELECT 'Students with Eligible status in admin_student_info' AS issue,
       COUNT(*) AS count
FROM public.admin_student_info
WHERE status = 'Eligible'

UNION ALL

SELECT 'Students with Not Eligible status in admin_student_info' AS issue,
       COUNT(*) AS count
FROM public.admin_student_info
WHERE status = 'Not Eligible'

UNION ALL

SELECT 'Orphan eligible_students (no matching admin record)' AS issue,
       COUNT(*) AS count
FROM public.eligible_students e
LEFT JOIN public.admin_student_info a ON e.email = a.email
WHERE a.email IS NULL

UNION ALL

SELECT 'Orphan non_eligible_students (no matching admin record)' AS issue,
       COUNT(*) AS count
FROM public.non_eligible_students n
LEFT JOIN public.admin_student_info a ON n.email = a.email
WHERE a.email IS NULL;
