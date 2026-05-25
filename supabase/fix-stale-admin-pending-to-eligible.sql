-- ============================================================
-- FIX: Sync stale admin records to their target table status
-- ============================================================
-- Problem: 3 records have admin_status = 'Pending' but have
-- matching rows in eligible_students with status = 'Eligible'.
-- This indicates data sync was incomplete.
--
-- Safe Fix: Update admin_status to match the target table status.
-- ============================================================

-- Update admin_student_info records where status is Pending
-- but they have matching eligible_students rows
UPDATE public.admin_student_info a
SET status = 'Eligible',
    updated_at = NOW()
WHERE a.id IN (276, 298, 163)
  AND a.status = 'Pending'
  AND EXISTS (
    SELECT 1 FROM public.eligible_students e
    WHERE e.email = a.email AND e.status = 'Eligible'
  );

-- Verify the update worked
SELECT
  a.id AS admin_id,
  a.email,
  a.full_name,
  a.status AS admin_status,
  e.status AS eligible_status,
  a.updated_at AS admin_updated_at
FROM public.admin_student_info a
LEFT JOIN public.eligible_students e ON a.email = e.email
WHERE a.id IN (276, 298, 163)
ORDER BY a.id;
