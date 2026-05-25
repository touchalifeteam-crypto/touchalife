-- ============================================================
-- CLEANUP: Remove orphan records from eligible/non_eligible tables
-- ============================================================
-- Problem: eligible_students and non_eligible_students tables
-- contain orphan rows with no matching admin_student_info records.
--
-- Safe Cleanup: Delete orphan records that don't have a
-- matching email in admin_student_info.
-- ============================================================

-- Show orphans in eligible_students before deletion
SELECT COUNT(*) as orphan_eligible_count
FROM public.eligible_students e
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_student_info a WHERE a.email = e.email
);

-- Show orphans in non_eligible_students before deletion
SELECT COUNT(*) as orphan_non_eligible_count
FROM public.non_eligible_students n
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_student_info a WHERE a.email = n.email
);

-- Delete orphans from eligible_students
DELETE FROM public.eligible_students e
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_student_info a WHERE a.email = e.email
);

-- Delete orphans from non_eligible_students
DELETE FROM public.non_eligible_students n
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_student_info a WHERE a.email = n.email
);

-- Verify cleanup
SELECT 'After cleanup - eligible_students' as table_check, COUNT(*) as count FROM public.eligible_students
UNION ALL
SELECT 'After cleanup - non_eligible_students' as table_check, COUNT(*) as count FROM public.non_eligible_students
UNION ALL
SELECT 'admin_student_info - Eligible' as table_check, COUNT(*) as count FROM public.admin_student_info WHERE status = 'Eligible'
UNION ALL
SELECT 'admin_student_info - Not Eligible' as table_check, COUNT(*) as count FROM public.admin_student_info WHERE status = 'Not Eligible';
