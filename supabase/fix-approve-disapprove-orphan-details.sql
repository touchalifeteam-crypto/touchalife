-- ============================================================
-- Orphan row details for eligible/non_eligible student sync
-- ============================================================
-- This file is non-destructive. It lists orphan rows and the
-- current relationship between admin_student_info and
-- eligible_students / non_eligible_students.
-- ============================================================

-- 1) Orphan eligible_students rows with no matching admin_student_info
SELECT
  e.id AS eligible_id,
  e.email,
  e.full_name,
  e.student_public_id,
  e.created_at,
  e.updated_at
FROM public.eligible_students e
LEFT JOIN public.admin_student_info a ON e.email = a.email
WHERE a.email IS NULL
ORDER BY e.created_at DESC
LIMIT 200;

-- 2) Orphan non_eligible_students rows with no matching admin_student_info
SELECT
  n.id AS non_eligible_id,
  n.email,
  n.full_name,
  n.student_public_id,
  n.created_at,
  n.updated_at
FROM public.non_eligible_students n
LEFT JOIN public.admin_student_info a ON n.email = a.email
WHERE a.email IS NULL
ORDER BY n.created_at DESC
LIMIT 200;

-- 3) Admin rows that still exist but are linked to eligible/non_eligible rows
SELECT
  a.id AS admin_id,
  a.email,
  a.full_name,
  a.status,
  a.created_at AS admin_created_at,
  a.updated_at AS admin_updated_at,
  e.id AS eligible_id,
  n.id AS non_eligible_id
FROM public.admin_student_info a
LEFT JOIN public.eligible_students e ON a.email = e.email
LEFT JOIN public.non_eligible_students n ON a.email = n.email
WHERE e.id IS NOT NULL OR n.id IS NOT NULL
ORDER BY a.updated_at DESC
LIMIT 200;

-- 4) Potential stale rows: matching eligible/non_eligible records when admin status is still Pending
SELECT
  a.id AS admin_id,
  a.email,
  a.full_name,
  a.status AS admin_status,
  e.id AS eligible_id,
  e.status AS eligible_status,
  e.updated_at AS eligible_updated_at,
  n.id AS non_eligible_id,
  n.status AS non_eligible_status,
  n.updated_at AS non_eligible_updated_at,
  a.created_at AS admin_created_at,
  a.updated_at AS admin_updated_at
FROM public.admin_student_info a
LEFT JOIN public.eligible_students e ON a.email = e.email
LEFT JOIN public.non_eligible_students n ON a.email = n.email
WHERE a.status = 'Pending'
  AND (e.id IS NOT NULL OR n.id IS NOT NULL)
ORDER BY a.updated_at DESC
LIMIT 200;
