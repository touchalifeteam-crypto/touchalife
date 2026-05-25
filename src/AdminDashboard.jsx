
/* eslint-disable no-unused-vars */
import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminDashboard.css";
import supabase from "./supabaseClient";
import { createNotification, getAdminNotifications, deleteNotification } from "./notificationService";

// Utility function to convert UTC to IST (Indian Standard Time)
const formatToIST = (dateString) => {
  if (!dateString) return "—";
  const utcDate = new Date(dateString);
  const istOptions = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  };
  return new Intl.DateTimeFormat('en-IN', istOptions).format(utcDate);
};

// For notifications - timestamps already stored in IST (no UTC conversion needed)
/*const formatNotificationTime = (dateString) => {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "—";
  const istOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  };
  return new Intl.DateTimeFormat('en-IN', istOptions).format(date);
};*/

const parseMoney = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const escapeCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const toISODateString = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }
  return date.toISOString().split('T')[0];
};

const normalizeCampName = (value) => (value || '').trim();

const buildCampScopeKey = (campName, campDate) => `${campName}__${campDate}`;

const parseCampScopeKey = (scopeKey = '') => {
  const separatorIndex = scopeKey.lastIndexOf('__');
  if (separatorIndex < 0) {
    return { campName: scopeKey, campDate: '' };
  }

  return {
    campName: scopeKey.slice(0, separatorIndex),
    campDate: scopeKey.slice(separatorIndex + 2),
  };
};

const asComparableId = (value) => (value === null || value === undefined ? '' : String(value));

const getStoragePathFromUrl = (fileUrl) => {
  if (!fileUrl) return '';

  const marker = '/student_documents/';

  try {
    const url = new URL(fileUrl);
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      return url.pathname.slice(markerIndex + marker.length);
    }
    return '';
  } catch {
    const fileUrlString = String(fileUrl);
    const markerIndex = fileUrlString.indexOf(marker);
    if (markerIndex >= 0) {
      return fileUrlString.slice(markerIndex + marker.length);
    }
    return '';
  }
};

// Highlight matching search text
const highlightMatch = (text, query) => {
  if (!text || !query) return text || '';
  const queryLower = query.toLowerCase().trim();
  if (!queryLower) return text;
  
  const textLower = text.toLowerCase();
  const index = textLower.indexOf(queryLower);
  
  if (index === -1) return text;
  
  const before = text.slice(0, index);
  const match = text.slice(index, index + queryLower.length);
  const after = text.slice(index + queryLower.length);
  
  return `${before}<mark style="background-color: #ffeb3b; padding: 0 2px; border-radius: 2px;">${match}</mark>${after}`;
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [donors, setDonors] = useState([]);
  const [viewDonor, setViewDonor] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [adminName, setAdminName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(true);
  const [systemNotifications, setSystemNotifications] = useState(true);

  const [eligibleStudents, setEligibleStudents] = useState([]);
  const [_eligibleStudentsRaw, setEligibleStudentsRaw] = useState([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [documentVerificationCampFilter, setDocumentVerificationCampFilter] = useState('all');
  const [documentVerificationSearchQuery, setDocumentVerificationSearchQuery] = useState('');
  const [_eligibleCount, setEligibleCount] = useState(0);
  const [nonEligibleStudents, setNonEligibleStudents] = useState([]);
  const [loadingNonEligible, setLoadingNonEligible] = useState(false);
  const [_nonEligibleCount, setNonEligibleCount] = useState(0);
  const [_successMessage, _setSuccessMessage] = useState('');
  const [showEligibleTable, setShowEligibleTable] = useState(false);
  const [showNonEligibleTable, setShowNonEligibleTable] = useState(false);
  const [showFeeReceiptsReportTable, setShowFeeReceiptsReportTable] = useState(false);
  const [showDonorContributionsReportTable, setShowDonorContributionsReportTable] = useState(false);
  const [showAddDonorModal, setShowAddDonorModal] = useState(false);
  const [campOptions, setCampOptions] = useState([]);
  const [loadingCampOptions, setLoadingCampOptions] = useState(false);
  const [newCampName, setNewCampName] = useState("");
  const [newCampDate, setNewCampDate] = useState("");
  const [newCampExtraDates, setNewCampExtraDates] = useState("");
  const [addingCamp, setAddingCamp] = useState(false);
  const [reportCampScopeKey, setReportCampScopeKey] = useState("");

  const documentVerificationCampOptions = useMemo(() => {
    const seen = new Set();
    const options = [];

    (eligibleStudents || []).forEach((student) => {
      const campName = normalizeCampName(student.camp_name || student.campName);
      if (!campName) return;
      if (seen.has(campName)) return;
      seen.add(campName);
      options.push({ value: campName, label: campName });
    });

    return [
      { value: 'all', label: 'All Camps' },
      ...options.sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [eligibleStudents]);

  const filteredEligibleStudentsForVerification = useMemo(() => {
    const searchQuery = (documentVerificationSearchQuery || '').toLowerCase().trim();

    return (eligibleStudents || []).filter((student) => {
      const campName = normalizeCampName(student.camp_name || student.campName);
      if (documentVerificationCampFilter !== 'all' && campName.toLowerCase() !== documentVerificationCampFilter.toLowerCase()) {
        return false;
      }

      if (!searchQuery) {
        return true;
      }

      const name = (student.student_name || student.full_name || student.name || '').toLowerCase();
      const email = (student.email || '').toLowerCase();
      return name.includes(searchQuery) || email.includes(searchQuery);
    });
  }, [eligibleStudents, documentVerificationCampFilter, documentVerificationSearchQuery]);
  const [newDonorForm, setNewDonorForm] = useState({
    full_name: '',
    gender: '',
    phone: '',
    email: '',
    donor_type: 'Individual',
    organization_name: '',
    amount: '',
    payment_method: 'UPI',
    transaction_id: '',
    donation_type: 'One-time',
    donation_date: new Date().toISOString().slice(0, 16), // Today in local time
  });
  const [submittingDonor, setSubmittingDonor] = useState(false);
  const [loadingDonors, setLoadingDonors] = useState(false);

  // Edit donor states
  const [showEditDonorModal, setShowEditDonorModal] = useState(false);
  const [editDonorForm, setEditDonorForm] = useState({});

  // Notification state
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationAudience, setNotificationAudience] = useState("all");
  const [notificationExpiresAt, setNotificationExpiresAt] = useState("");
  const [isAllTimeNotification, setIsAllTimeNotification] = useState(false);
  const [creatingNotification, setCreatingNotification] = useState(false);

  // Admin notifications list
  const [adminNotifications, setAdminNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [showNotificationsList, setShowNotificationsList] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Real-time monthly stats for Students Under Review
  const [_studentsThisMonth, setStudentsThisMonth] = useState(0);
  const [_studentsLastMonth, setStudentsLastMonth] = useState(0);
  const [_studentTrend, setStudentTrend] = useState({ percent: 0, direction: 'neutral', label: '— from last month' });

  // Notification list handlers
  const handleToggleNotificationsList = async () => {
    if (!showNotificationsList) {
      setLoadingNotifications(true);
      const result = await getAdminNotifications();
      if (result.success) {
        setAdminNotifications(result.notifications);
      }
      setLoadingNotifications(false);
    }
    setShowNotificationsList(!showNotificationsList);
  };


  const handleDeleteNotification = async (id) => {
    if (!window.confirm('Delete this notification?')) return;
    
    setDeletingId(id);
    const result = await deleteNotification(id);
    console.log('[DEBUG] Delete result:', result); // DEBUG
    
    if (result.success) {
      // Refresh full list from server
      const refreshResult = await getAdminNotifications();
      if (refreshResult.success) {
        setAdminNotifications(refreshResult.notifications);
      }
      alert('✅ Deleted successfully');
    } else {
      alert('❌ Delete failed: ' + result.error);
    }
    
    setDeletingId(null);
  };




  const fetchDonors = async () => {
    setLoadingDonors(true);
    try {
      const { data: donorDetails, error: donorError } = await supabase
        .from('donor_details')
        .select('*')
        .order('donation_date', { ascending: false });

      if (donorError) {
        console.error('[DONORS] Error fetching donors:', donorError);
        console.error('[DONORS] Error details:', donorError.message, donorError.code, donorError.details);
        alert('Error fetching donors: ' + donorError.message + ' (Code: ' + (donorError.code || 'N/A') + ')');
        setDonors([]);
        return;
      }

      if (!donorDetails) {
        console.warn('[DONORS] donorDetails is null/undefined — possible RLS policy blocking access or network issue');
        setDonors([]);
        return;
      }

      if (donorDetails.length === 0) {
        console.warn('[DONORS] donor_details table returned 0 rows — table may be empty or RLS may be blocking access');
      }

      console.log('[DONORS] Fetched from donor_details:', donorDetails.length, 'donors');
      console.log('[DONORS] Donor data sample:', donorDetails[0]);

      const mappedDonors = donorDetails.map(d => ({
        ...d,
        name: d.full_name,
        formattedAmount: new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0
        }).format(d.amount || 0),
        formattedDate: d.donation_date ? formatToIST(d.donation_date) : '—'
      }));
      setDonors(mappedDonors);
      console.log('[DONORS] Mapped donors count:', mappedDonors.length);
    } catch (err) {
      console.error('[DONORS] Unexpected error in fetchDonors:', err);
      console.error('[DONORS] Stack trace:', err.stack);
      alert('Unexpected error fetching donors: ' + err.message);
      setDonors([]);
    } finally {
      setLoadingDonors(false);
    }
  };

  const fetchCampOptions = useCallback(async () => {
    setLoadingCampOptions(true);
    try {
      const { data, error } = await supabase
        .from("camp_master")
        .select("id, camp_name, camp_date, created_at")
        .order("camp_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching camp options:", error);
        return;
      }

      setCampOptions(data || []);
    } finally {
      setLoadingCampOptions(false);
    }
  }, []);

  const handleAddCamp = async () => {
    const campName = newCampName.trim();
    const extraDates = newCampExtraDates
      .split(/[\n,]/)
      .map((date) => date.trim())
      .filter(Boolean);
    const campDates = [...new Set([newCampDate, ...extraDates])].filter(Boolean);

    if (!campName) {
      alert("Please enter a camp name.");
      return;
    }

    if (campDates.length === 0) {
      alert("Please select at least one camp date.");
      return;
    }

    const invalidDate = campDates.find((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date));
    if (invalidDate) {
      alert(`Invalid camp date: ${invalidDate}`);
      return;
    }

    setAddingCamp(true);
    try {
      let addedCount = 0;
      let duplicateCount = 0;

      for (const campDate of campDates) {
        const { error } = await supabase
          .from("camp_master")
          .insert({
            camp_name: campName,
            camp_date: campDate,
            created_by: currentUser?.email || null,
          });

        if (error) {
          if (error.code === "23505") {
            duplicateCount += 1;
            continue;
          }

          throw error;
        }

        addedCount += 1;
      }

      setNewCampName("");
      setNewCampDate("");
      setNewCampExtraDates("");
      await fetchCampOptions();

      if (addedCount > 0 && duplicateCount > 0) {
        alert(`Added ${addedCount} camp date(s). Skipped ${duplicateCount} duplicate date(s).`);
      } else if (addedCount > 0) {
        alert("Camp added successfully!");
      } else {
        alert("All selected camp dates already exist.");
      }
    } catch (err) {
      console.error("Error adding camp:", err);
      alert("Failed to add camp: " + err.message);
    } finally {
      setAddingCamp(false);
    }
  };

  const attachStudentPublicIds = useCallback(async (rows = []) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    const rowStudentIds = [...new Set(
      rows
        .map((row) => row.student_form_id ?? row.student_id)
        .filter((value) => value !== null && value !== undefined)
    )];

    const rowEmails = [...new Set(
      rows
        .map((row) => (row.email || '').trim())
        .filter(Boolean)
    )];

    const idToPublicId = new Map();
    const emailToPublicId = new Map();

    if (rowStudentIds.length > 0) {
      const { data: byIdRows, error: byIdError } = await supabase
        .from('student_form_submissions')
.select('id, student_public_id, is_single_parent, special_remarks')
        .in('id', rowStudentIds);

      if (byIdError) {
        console.error('Error resolving student_public_id by id:', byIdError);
      } else {
        (byIdRows || []).forEach((item) => {
          if (item?.id && item?.student_public_id) {
            idToPublicId.set(item.id, item.student_public_id);
          }
        });
      }
    }

    if (rowEmails.length > 0) {
      const { data: byEmailRows, error: byEmailError } = await supabase
        .from('student_form_submissions')
.select('email, student_public_id, created_at, is_single_parent, special_remarks')
        .in('email', rowEmails)
        .order('created_at', { ascending: false });

      if (byEmailError) {
        console.error('Error resolving student_public_id by email:', byEmailError);
      } else {
        (byEmailRows || []).forEach((item) => {
          const emailKey = (item?.email || '').trim();
          if (emailKey && item?.student_public_id && !emailToPublicId.has(emailKey)) {
            emailToPublicId.set(emailKey, item.student_public_id);
          }
        });
      }
    }

    return rows.map((row) => {
      const emailKey = (row.email || '').trim();
      const lookupStudentId = row.student_form_id ?? row.student_id;
      return {
        ...row,
        student_public_id:
          row.student_public_id ||
          idToPublicId.get(lookupStudentId) ||
          emailToPublicId.get(emailKey) ||
          null,
      };
    });
  }, []);

  // Custom admin auth check + data fetch
  useEffect(() => {
    // Check custom admin token FIRST
    const adminToken = localStorage.getItem('admin_token');
    if (!adminToken) {
      navigate('/adminlogin');
      return;
    }

    const fetchUserData = async () => {
      try {
        // Get current user session (backup)
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setCurrentUser(session.user);

          // Initialize settings with current user data
          setAdminName(session.user.user_metadata?.name || session.user.email?.split('@')[0] || "");
        }

        // Fetch ALL students with status='Pending' from admin_student_info
        console.log('[DEBUG] Fetching students with status=Pending from admin_student_info...');
        
        const { data: studentData, error: studentError } = await supabase
          .from('admin_student_info')
          .select('*', { count: 'exact' })
          .eq('status', 'Pending')
          .order('created_at', { ascending: false })
          .range(0, 10000); // Fetch up to 10,000 rows (override default 100 limit)
        
        console.log('[DEBUG] Fetched from admin_student_info:', studentData?.length || 0, 'students');
        if (studentData) {
          console.log('[DEBUG] Total count from database:', studentData.length);
        }

        // Save raw fetch result for debugging
        setLastFetch({ data: studentData || null, error: studentError, fetchedAt: new Date().toISOString() });

        if (studentError) {
          console.error('AdminDashboard: Error fetching student data:', studentError);
        } else {
          console.log('AdminDashboard: fetched studentData (count):', Array.isArray(studentData) ? studentData.length : 0);
          // Transform student data to match admin dashboard format
          const transformedStudents = (studentData || []).map((student, index) => {
            const transformed = {
              id: student.id || index + 1,
              student_id: student.id,
              student_form_id: student.student_id || null,
              student_public_id: student.student_public_id || null,
              is_single_parent: student.is_single_parent ?? false,
              special_remarks: student.special_remarks ?? null,
              name: student.full_name || "",
              full_name: student.full_name || "",
              year: student.class || student.year,
              fee_status: student.fee || "Not Provided",
              course: student.educationcategory || student.class || student.year || student.course || "—",
              campName: normalizeCampName(student.camp_name),
              campDate: toISODateString(student.camp_date),
              age: student.age,
              class: student.class,
              prev_percent: student.prev_percent,
              present_percent: student.present_percent,
              email: student.email,
              contact: student.contact,
              parent_contact_2: student.parent_contact_2,
              whatsapp: student.whatsapp,
              student_contact: student.student_contact,
              address: student.address,
              school: student.school,
              college: student.college,
              academic_achievements_choice: student.academic_achievements_choice || student.academic_achievements || '',
              non_academic_achievements_choice: student.non_academic_achievements_choice || student.non_academic_achievements || '',
              academic_achievements: student.academic_achievements || '',
              non_academic_achievements: student.non_academic_achievements || '',
              scholarship: student.scholarship,
              has_scholarship: student.has_scholarship,
              does_work: student.does_work,
              earning_members: student.earning_members,
              volunteer_name: student.volunteer_name,
              volunteer_contact: student.volunteer_contact,
              status: student.status,
              created_at: student.created_at
            };
            return transformed;
          });
          const studentsWithPublicIds = await attachStudentPublicIds(transformedStudents);
          setStudents(studentsWithPublicIds);
          console.log('✅ [DEBUG] Total students loaded:', studentsWithPublicIds.length);
          console.log('✅ [DEBUG] Sample student:', studentsWithPublicIds[0]);
        }

        // Fetch donors
        await fetchDonors();
        await fetchCampOptions();
        await fetchEligibleStudents();
        await fetchNonEligibleStudents();

      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
    fetchEligibleCount();
    fetchNonEligibleCount();
    fetchFeeTrackingRecords();
    fetchStudentMonthlyStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

// New filters for replacement
const [newFilters, setNewFilters] = useState({ camp: 'all', education: 'all', toppers: false, achievements: 'all', singleParent: false, specialRemarks: false });

  // Search functionality for Manage Beneficiaries
  const [searchQuery, setSearchQuery] = useState("");
  const [nonEligibleSearchQuery, setNonEligibleSearchQuery] = useState("");

  // Manage Beneficiaries camp options should come from loaded admin_student_info records.
  const uniqueCamps = useMemo(() => {
    const campsWithDates = students
      .map((student) => {
        const campName = normalizeCampName(student.campName || student.camp_name);
        const campDate = toISODateString(student.campDate || student.camp_date);
        if (!campName || !campDate) {
          return null;
        }

        const uniqueKey = buildCampScopeKey(campName, campDate);
        return {
          value: uniqueKey,
          label: `${campName} - ${new Date(campDate).toLocaleDateString('en-IN')}`,
          campName,
          campDate,
        };
      })
      .filter(Boolean);

    const uniqueByNameAndDate = [...new Map(campsWithDates.map(camp => [camp.value, camp])).values()];

    uniqueByNameAndDate.sort((a, b) => new Date(b.campDate) - new Date(a.campDate));

    const result = [
      { value: 'all', label: 'All' },
      ...uniqueByNameAndDate
    ];

    return result;
  }, [students]);

  const uniqueEducations = useMemo(() => {
    const educations = [...students.map(s => s.course).filter(Boolean), ...students.map(s => s.year).filter(Boolean)];
    return ['all', ...new Set(educations)];
  }, [students]);

  const reportCampOptions = useMemo(() => {
    const options = campOptions
      .map((camp) => {
        const campName = camp.camp_name?.trim();
        const campDate = toISODateString(camp.camp_date);
        if (!campName || !campDate) {
          return null;
        }

        return {
          key: buildCampScopeKey(campName, campDate),
          campName,
          campDate,
          label: `${campName} - ${new Date(campDate).toLocaleDateString('en-IN')}`,
        };
      })
      .filter(Boolean);

    const uniqueOptions = [...new Map(options.map((option) => [option.key, option])).values()].sort((a, b) => {
      const dateDiff = b.campDate.localeCompare(a.campDate);
      return dateDiff !== 0 ? dateDiff : a.campName.localeCompare(b.campName);
    });

    return [
      { key: 'all', campName: 'ALL', campDate: '', label: 'ALL - Entire Reports' },
      ...uniqueOptions,
    ];
  }, [campOptions]);

  useEffect(() => {
    if (!reportCampScopeKey && reportCampOptions.length > 0) {
      setReportCampScopeKey(reportCampOptions[0].key);
    }
  }, [reportCampScopeKey, reportCampOptions]);

  const selectedReportCampScope = useMemo(() => {
    return reportCampOptions.find((option) => option.key === reportCampScopeKey) || null;
  }, [reportCampOptions, reportCampScopeKey]);

  const achievementsFilterOptions = [
    { value: 'all', label: 'Any Certificates' },
    { value: 'both', label: 'Academic + Non-Academic' },
    { value: 'academic_only', label: 'Academic Only' },
    { value: 'non_academic_only', label: 'Non-Academic Only' },
  ];

  const [activeSection, setActiveSection] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewStudent, setViewStudent] = useState(null);
  const [editStudent, setEditStudent] = useState(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [viewEligibleStudent, setViewEligibleStudent] = useState(null);
  const [viewNonEligibleStudent, setViewNonEligibleStudent] = useState(null);
  const [viewDocumentsStudent, setViewDocumentsStudent] = useState(null);
  const [viewDocumentsCategory, setViewDocumentsCategory] = useState(null);
  const [studentDocuments, setStudentDocuments] = useState([]);
  const [groupedDocuments, setGroupedDocuments] = useState({});
  const [sortedYears, setSortedYears] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState(null);

  const [feeSectionTab, setFeeSectionTab] = useState('tracking');
  const [feeReceiptSubTab, setFeeReceiptSubTab] = useState('pending'); // 'pending' or 'verified'
  const [feeTrackingRecords, setFeeTrackingRecords] = useState([]);
  const [loadingFeeTracking, setLoadingFeeTracking] = useState(false);
  const [savingFeeRecord, setSavingFeeRecord] = useState(false);
  const [uploadingVoucherFor, setUploadingVoucherFor] = useState(null);
  const [feePaidInput, setFeePaidInput] = useState({});
  const [viewingFeeStudent, setViewingFeeStudent] = useState(null);
  const [completeFeeStudentData, setCompleteFeeStudentData] = useState(null);

  // Fetch complete student data from student_form_submissions when viewing fee details
  useEffect(() => {
    if (!viewingFeeStudent) {
      setCompleteFeeStudentData(null);
      return;
    }

    const fetchCompleteData = async () => {
      try {
        const { data, error } = await supabase
          .from('student_form_submissions')
          .select('*')
          .eq('email', viewingFeeStudent.email)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('Error fetching complete student data:', error);
        } else {
          console.log('[FEE_VIEW] Fetched complete student data:', data);
          setCompleteFeeStudentData(data);
        }
      } catch (err) {
        console.error('Error:', err);
      }
    };

    fetchCompleteData();
  }, [viewingFeeStudent]);
  const [viewingReceiptRecord, setViewingReceiptRecord] = useState(null);

  const totals = useMemo(() => {
    const totalStudents = students.length;
    const feesCollected = donors.reduce((s, d) => s + (d.amount || 0), 0);
    const pendingFees = students.filter((s) => s.feeStatus === "Pending").length;
    const activeDonors = donors.length;
    
    console.log('[TOTALS] Dashboard Overview Calculation:');
    console.log('[TOTALS] - Total Students:', totalStudents);
    console.log('[TOTALS] - Donors array length:', donors.length);
    console.log('[TOTALS] - Fees Collected:', feesCollected);
    console.log('[TOTALS] - Pending Fees:', pendingFees);
    console.log('[TOTALS] - Active Donors:', activeDonors);
    console.log('[TOTALS] - Sample donor:', donors[0]);
    
    return { totalStudents, feesCollected, pendingFees, activeDonors };
  }, [students, donors]);

  const verifiedFeeStudents = useMemo(() => {
    // Count students who have paid ANY fee (even partial) from fee_tracking table
    return feeTrackingRecords.filter((record) => parseMoney(record.fee_paid_by_tal) > 0);
  }, [feeTrackingRecords]);

  const getFeeTrackingRecord = (student) => {
    const studentFormId = student.student_form_id || student.student_id || student.id;
    if (!studentFormId) return null;
    const comparableStudentId = asComparableId(studentFormId);
    return feeTrackingRecords.find((record) => asComparableId(record.student_form_id) === comparableStudentId);
  };

const feeTrackingStudents = useMemo(() => {
    return feeTrackingRecords.filter((record) => {
      return parseMoney(record.fee_paid_by_tal) <= 0;
    });
  }, [feeTrackingRecords]);

const paidFeeRecords = useMemo(() => {
    return feeTrackingRecords.filter((record) => parseMoney(record.fee_paid_by_tal) > 0);
  }, [feeTrackingRecords]);

  const voucherNoUploadRecords = useMemo(() => {
    return paidFeeRecords.filter((record) => !record.voucher_url);
  }, [paidFeeRecords]);

  // Students with voucher uploaded but fee receipt NOT uploaded
  const voucherUploadedNoReceiptRecords = useMemo(() => {
    return paidFeeRecords.filter((record) => record.voucher_url && !record.fee_receipt_url);
  }, [paidFeeRecords]);

  // Students with student-uploaded fee receipts (from fee_tracking where fee_receipt_url IS NOT NULL and fee_receipt_checked = 'false')
  const [studentFeeReceipts, setStudentFeeReceipts] = useState([]);
  const [loadingStudentReceipts, setLoadingStudentReceipts] = useState(false);

  useEffect(() => {
    if (feeSectionTab === 'receipts') {
      fetchStudentFeeReceipts();
    }
  }, [feeSectionTab]);

  const fetchStudentFeeReceipts = async () => {
    setLoadingStudentReceipts(true);
    try {
      const { data, error } = await supabase
        .from('fee_tracking')
        .select('*')
        .not('fee_receipt_url', 'is', null)
        .eq('fee_receipt_checked', 'false')
        .order('fee_receipt_url_updated_at', { ascending: false });
      
      if (error) throw error;
      setStudentFeeReceipts(data || []);
    } catch (err) {
      console.error('Error fetching student fee receipts:', err);
    } finally {
      setLoadingStudentReceipts(false);
    }
  };

  const handleVerifyFeeReceipt = async (receipt) => {
    if (!window.confirm(`Verify fee receipt for ${receipt.student_name}?`)) return;
    
    try {
      // Mark fee receipt as verified in fee_tracking table
      const { error: updateError } = await supabase
        .from('fee_tracking')
        .update({ 
          fee_receipt_checked: 'true'
        })
        .eq('id', receipt.id);
      
      if (updateError) throw updateError;

      await fetchStudentFeeReceipts();
      alert('✅ Fee receipt verified successfully!');
    } catch (err) {
      console.error('Verification failed:', err);
      alert('Verification failed: ' + err.message);
    }
  };

  const feeReceiptRecords = useMemo(() => {
    return feeTrackingRecords.filter((record) => record.fee_receipt_checked === 'true');
  }, [feeTrackingRecords]);

  const matchesSelectedReportScope = useCallback((campName, campDate) => {
    if (!selectedReportCampScope || selectedReportCampScope.key === 'all') {
      return true;
    }

    return (
      (campName || '').trim() === selectedReportCampScope.campName &&
      toISODateString(campDate) === selectedReportCampScope.campDate
    );
  }, [selectedReportCampScope]);

  const scopedEligibleStudents = useMemo(() => {
    return eligibleStudents.filter((student) =>
      matchesSelectedReportScope(student.camp_name || student.campName, student.camp_date || student.campDate)
    );
  }, [eligibleStudents, matchesSelectedReportScope]);

  const scopedNonEligibleStudents = useMemo(() => {
    return nonEligibleStudents.filter((student) =>
      matchesSelectedReportScope(student.camp_name || student.campName, student.camp_date || student.campDate)
    );
  }, [nonEligibleStudents, matchesSelectedReportScope]);

  const scopedFeeReceiptRecords = useMemo(() => {
    return feeReceiptRecords.filter((record) =>
      matchesSelectedReportScope(record.camp_name || record.campName, record.camp_date || record.campDate)
    );
  }, [feeReceiptRecords, matchesSelectedReportScope]);

  const scopedFeeTrackingStudents = useMemo(() => {
    return feeTrackingStudents.filter((record) =>
      matchesSelectedReportScope(record.camp_name || record.campName, record.camp_date || record.campDate)
    );
  }, [feeTrackingStudents, matchesSelectedReportScope]);

  const scopedPaidFeeRecords = useMemo(() => {
    return paidFeeRecords.filter((record) =>
      matchesSelectedReportScope(record.camp_name || record.campName, record.camp_date || record.campDate)
    );
  }, [paidFeeRecords, matchesSelectedReportScope]);

const totalFeeDue = useMemo(() => {
    return feeTrackingRecords.reduce((sum, record) => {
      const requiredFee = parseMoney(record.total_educational_expenses);
      const paidAmount = parseMoney(record.fee_paid_by_tal);
      return sum + Math.max(requiredFee - paidAmount, 0);
    }, 0);
  }, [feeTrackingRecords]);

  // Calculate total funds available (donor amount - amount used for fee payments)
  const totalFundsAvailable = useMemo(() => {
    const totalDonated = donors.reduce((s, d) => s + parseMoney(d.amount), 0);
    const totalPaid = feeTrackingRecords.reduce((s, r) => s + parseMoney(r.fee_paid_by_tal), 0);
    return Math.max(totalDonated - totalPaid, 0);
  }, [donors, feeTrackingRecords]);

  // Calculate fund utilization percentage
  const fundUtilizationPercent = useMemo(() => {
    const totalDonated = donors.reduce((s, d) => s + parseMoney(d.amount), 0);
    const totalPaid = feeTrackingRecords.reduce((s, r) => s + parseMoney(r.fee_paid_by_tal), 0);
    if (totalDonated <= 0) return 0;
    return Math.round((totalPaid / totalDonated) * 100);
  }, [donors, feeTrackingRecords]);

const getMaxPercent = useCallback((s) => {
  return Math.max(
    parseFloat(s.prev_percent || 0),
    parseFloat(s.present_percent || 0)
  );
}, []);

const getAvgPercentage = (s) => {
  const prev = parseFloat(s.prev_percent || 0);
  const pres = parseFloat(s.present_percent || 0);
  const avg = ((prev + pres) / 2).toFixed(1);
  return avg > 0 ? avg + '%' : '—';
};

const calculatePriority = useCallback((s) => {
  const incomeScore = Math.max(0, 40 - (parseInt(s.earning_members || 1) * 10));
  const academicScore = Math.min(25, getMaxPercent(s));

  let familyScore = 0;
  if (s.has_scholarship === false && s.does_work === false && parseInt(s.earning_members || 0) <= 2) {
    familyScore = 20;
  } else if (!s.has_scholarship || !s.does_work) {
    familyScore = 10;
  }

  const extraScore =
    (parseFloat(s.prev_percent || 0) < parseFloat(s.present_percent || 0) ? 10 : 0) +
    (s.does_work === false ? 5 : 0);

  return Math.min(100, Math.max(0, incomeScore + academicScore + familyScore + extraScore));
}, [getMaxPercent]);

  // Updated filteredStudents with new filters (old filters deprecated)
  const filteredStudents = useMemo(() => {
    console.log('[DEBUG] filteredStudents recalculating...');
    console.log('[DEBUG] Total students array length:', students.length);
    console.log('[DEBUG] Current filters:', newFilters);
    
    if (students.length > 0) {
      const studentsWithCampData = students.filter(s => s.campName && s.campDate);
      console.log(`[DEBUG] Students with camp data: ${studentsWithCampData.length}/${students.length}`);
      console.log('[DEBUG] Sample student data:', {
        name: students[0].name,
        campName: students[0].campName,
        campDate: students[0].campDate,
      });
    }
    
    const normalizeAchievementFlag = (value) => {
      if (value === true || value === 'true') {
        return true;
      }
      const trimmed = (value || '').toString().trim();
      return trimmed !== '' && trimmed !== 'false';
    };

    const filterAchievementMatch = (student) => {
      const hasAcademic = normalizeAchievementFlag(student.academic_achievements_choice) || normalizeAchievementFlag(student.academic_achievements);
      const hasNonAcademic = normalizeAchievementFlag(student.non_academic_achievements_choice) || normalizeAchievementFlag(student.non_academic_achievements);

      // When 'all' is selected, do NOT filter out students.
      // IMPORTANT: do not return `true` for the entire function by accident when
      // `newFilters.achievements` is undefined or empty.
      if (!newFilters.achievements || newFilters.achievements === 'all') return true;
      if (newFilters.achievements === 'both') return hasAcademic && hasNonAcademic;
      if (newFilters.achievements === 'academic_only') return hasAcademic && !hasNonAcademic;
      if (newFilters.achievements === 'non_academic_only') return !hasAcademic && hasNonAcademic;

      return true;
    };

    const normalizeBoolean = (value) => {
      if (value === true || value === 'true' || value === 'YES' || value === 'yes' || value === 'Y' || value === 'y') {
        return true;
      }
      return !!value;
    };

    const hasText = (value) => {
      return typeof value === 'string' && value.trim().length > 0;
    };

return students
      .filter((s, idx) => {
        // Search filter - real-time search by name
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase().trim();
          const nameMatches = (s.name || s.full_name || '').toLowerCase().includes(query);
          const emailMatches = (s.email || '').toLowerCase().includes(query);
          if (!nameMatches && !emailMatches) {
            return false;
          }
        }

        // New filters
        if (newFilters.camp !== 'all') {
          const { campName: filterCampName, campDate: filterCampDate } = parseCampScopeKey(newFilters.camp);
          const studentCampName = normalizeCampName(s.campName || s.camp_name);
          const studentCampDate = toISODateString(s.campDate || s.camp_date);

          const nameMatches = studentCampName === filterCampName;
          const dateMatches = studentCampDate === filterCampDate;
          
          if (idx < 3 || (!nameMatches || !dateMatches)) {
            console.log(`[CAMP_FILTER_DEBUG] Student #${idx} - ${s.name || 'Unknown'}:`, {
              filter: newFilters.camp,
              filterCampName,
              filterCampDate,
              studentCampName: studentCampName || 'EMPTY',
              studentCampDate: studentCampDate || 'EMPTY',
              nameMatch: nameMatches,
              dateMatch: dateMatches,
              willShow: nameMatches && dateMatches
            });
          }
          
          if (!nameMatches || !dateMatches) {
            return false;
          }
        }
        if (newFilters.education !== 'all' && s.course !== newFilters.education && s.year !== newFilters.education) return false;
        if (!filterAchievementMatch(s)) return false;
        if (newFilters.singleParent && !normalizeBoolean(s.is_single_parent)) return false;
        if (newFilters.specialRemarks && !hasText(s.special_remarks)) return false;
        return true;
      })
      .map(s => ({...s, avgPercent: ((parseFloat(s.prev_percent || 0) + parseFloat(s.present_percent || 0)) / 2)}))
      .sort((a, b) => {
        // If toppers filter is ON, sort by average percentage (highest first)
        if (newFilters.toppers) {
          return b.avgPercent - a.avgPercent;
        }
        return 0;
      });
}, [students, newFilters, searchQuery]);

// After filtering, log the result
useEffect(() => {
  console.log('[DEBUG] Manage Beneficiaries will show:', filteredStudents.length, 'students');
  console.log('[DEBUG] Filters status:', {
    camp: newFilters.camp,
    education: newFilters.education,
    toppers: newFilters.toppers,
    achievements: newFilters.achievements,
    singleParent: newFilters.singleParent,
    specialRemarks: newFilters.specialRemarks
  });
  
  if (newFilters.camp !== 'all') {
    console.log(`[DEBUG] Camp filter applied: showing ${filteredStudents.length} students matching "${newFilters.camp}"`);
  }
}, [filteredStudents, newFilters]);

// Filtered non-eligible students with same filters
const filteredNonEligibleStudents = useMemo(() => {
  const normalizeAchievementFlag = (value) => {
    if (value === true || value === 'true' || value === 'YES' || value === 'yes' || value === 'Y' || value === 'y') {
      return true;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return true;
    }
    return false;
  };

  const normalizeBoolean = (value) => {
    if (value === true || value === 'true' || value === 'YES' || value === 'yes' || value === 'Y' || value === 'y') {
      return true;
    }
    return !!value;
  };

  const hasText = (value) => {
    return typeof value === 'string' && value.trim().length > 0;
  };

  const filterAchievementMatch = (student) => {
    const hasAcademic = normalizeAchievementFlag(student.academic_achievements_choice) || normalizeAchievementFlag(student.academic_achievements);
    const hasNonAcademic = normalizeAchievementFlag(student.non_academic_achievements_choice) || normalizeAchievementFlag(student.non_academic_achievements);

    if (newFilters.achievements === 'both') return hasAcademic && hasNonAcademic;
    if (newFilters.achievements === 'academic_only') return hasAcademic && !hasNonAcademic;
    if (newFilters.achievements === 'non_academic_only') return !hasAcademic && hasNonAcademic;
    return true;
  };

  return nonEligibleStudents
    .filter((s) => {
      // Search filter for non-eligible students
      if (nonEligibleSearchQuery.trim()) {
        const query = nonEligibleSearchQuery.toLowerCase().trim();
        const name = (s.student_name || s.full_name || s.name || '').toLowerCase();
        const email = (s.email || '').toLowerCase();
        if (!name.includes(query) && !email.includes(query)) {
          return false;
        }
      }

      // New filters
      const campName = s.camp_name || s.campName;
      const education = s.education || s.course || s.class || s.year;
      if (newFilters.camp !== 'all') {
        const { campName: filterCampName, campDate: filterCampDate } = parseCampScopeKey(newFilters.camp);
        const normalizedCampName = normalizeCampName(campName);
        const studentCampDate = toISODateString(s.camp_date || s.campDate);
        if (normalizedCampName !== filterCampName || studentCampDate !== filterCampDate) {
          return false;
        }
      }
      if (newFilters.education !== 'all' && education !== newFilters.education) return false;
      if (newFilters.toppers && getMaxPercent(s) < 90) return false;
      if (!filterAchievementMatch(s)) return false;
      if (newFilters.singleParent && !normalizeBoolean(s.is_single_parent)) return false;
      if (newFilters.specialRemarks && !hasText(s.special_remarks)) return false;
      return true;
    })
    .map(s => ({...s, priority: calculatePriority(s)}))
    .sort((a, b) => b.priority - a.priority);
}, [nonEligibleStudents, newFilters, nonEligibleSearchQuery, calculatePriority, getMaxPercent]);

const fetchEligibleCount = async () => {
  const { count, error } = await supabase
    .from("eligible_students")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("Error fetching eligible count:", error);
  } else {
    setEligibleCount(count || 0);
  }
};

const fetchNonEligibleCount = async () => {
  const { count, error } = await supabase
    .from("non_eligible_students")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("Error fetching non-eligible count:", error);
  } else {
    setNonEligibleCount(count || 0);
  }
};

// Fetch real-time monthly stats for Students Under Review
const fetchStudentMonthlyStats = async () => {
  try {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    // Count students created this month (Pending status)
    const { count: thisMonthCount, error: thisMonthError } = await supabase
      .from('admin_student_info')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Pending')
      .gte('created_at', startOfThisMonth);

    if (thisMonthError) {
      console.error('Error fetching this month student count:', thisMonthError);
    } else {
      setStudentsThisMonth(thisMonthCount || 0);
    }

    // Count students created last month (Pending status)
    const { count: lastMonthCount, error: lastMonthError } = await supabase
      .from('admin_student_info')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Pending')
      .gte('created_at', startOfLastMonth)
      .lt('created_at', startOfThisMonth);

    if (lastMonthError) {
      console.error('Error fetching last month student count:', lastMonthError);
    } else {
      setStudentsLastMonth(lastMonthCount || 0);
    }

    // Calculate trend
    const thisMonth = thisMonthCount || 0;
    const lastMonth = lastMonthCount || 0;

    if (lastMonth === 0 && thisMonth === 0) {
      setStudentTrend({ percent: 0, direction: 'neutral', label: 'No change from last month' });
    } else if (lastMonth === 0) {
      setStudentTrend({ percent: 100, direction: 'positive', label: '↑ 100% — New this month' });
    } else {
      const diff = thisMonth - lastMonth;
      const percent = Math.round((diff / lastMonth) * 100);
      if (percent > 0) {
        setStudentTrend({ percent, direction: 'positive', label: `↑ ${percent}% from last month` });
      } else if (percent < 0) {
        setStudentTrend({ percent: Math.abs(percent), direction: 'negative', label: `↓ ${Math.abs(percent)}% from last month` });
      } else {
        setStudentTrend({ percent: 0, direction: 'neutral', label: 'No change from last month' });
      }
    }
  } catch (err) {
    console.error('Error in fetchStudentMonthlyStats:', err);
  }
};

  const fetchEligibleStudents = async () => {
    setLoadingEligible(true);
    try {
      const { data, error } = await supabase
        .from('eligible_students')
        .select('*')
        
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching eligible students:', error);
        alert('Error fetching eligible students: ' + error.message);
      } else {
        // Fetch document counts for each student using email as link
        const studentsWithDocs = await Promise.all((data || []).map(async (student) => {
          // First get the student_form_submissions ID using email
          const { data: formData } = await supabase
            .from('student_form_submissions')
            .select('id')
            .eq('email', student.email)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const studentFormId = formData?.id;
          let docs = [];

          // DEBUG: trace linking for known issue student
          if (student?.email && student.email.toLowerCase().includes('navyaelkapelli53@gmail.com'.toLowerCase())) {
            console.log('[ELIGIBLE_DEBUG TARGET] student row:', {
              eligible_student_id: student.id,
              student_id_field: student.student_id,
              student_form_id_field: student.student_form_id,
              email: student.email,
            });
            console.log('[ELIGIBLE_DEBUG TARGET] resolved student_form_submissions.id:', studentFormId);
          }


          // Try to fetch documents using multiple possible linkage fields.
          // Historical data may link student_documents.student_id to:
          // 1) student_form_submissions.id (studentFormId)
          // 2) eligible_students.id (student.id)
          // 3) student_documents.student_id stored as the numeric student_id (e.g. 229)
          const candidateStudentIds = new Set();
          if (studentFormId !== null && studentFormId !== undefined && studentFormId !== '') {
            candidateStudentIds.add(Number(studentFormId));
          }
          if (student.id !== null && student.id !== undefined && student.id !== '') {
            candidateStudentIds.add(Number(student.id));
          }
          // If admin dashboard row already includes a numeric student_id, use it too.
          if (student.student_id !== null && student.student_id !== undefined && student.student_id !== '') {
            candidateStudentIds.add(Number(student.student_id));
          }

          const candidateIds = Array.from(candidateStudentIds).filter((x) => Number.isFinite(x));

          if (candidateIds.length > 0) {
            const { data: candidateDocs } = await supabase
              .from('student_documents')
              .select('id, student_id, category, is_checked')
              .in('student_id', candidateIds);

            docs = candidateDocs || [];

            if (docs.length > 0) {
              console.log(`[FETCH_ELIGIBLE] Found ${docs.length} documents for ${student.email} using candidate student_ids:`, candidateIds);
            } else {
              console.log(`[FETCH_ELIGIBLE] No documents found for ${student.email} using candidate student_ids:`, candidateIds);
            }
          } else {
            console.log(`[FETCH_ELIGIBLE] Skipping doc fetch for ${student.email} - no valid candidate student_ids computed`, {
              studentFormId,
              eligible_id: student.id,
              eligible_student_student_id: student.student_id,
            });
          }


          const academics = docs?.filter(d => d.category === 'academic')?.length || 0;
          const personal = docs?.filter(d => d.category === 'personal')?.length || 0;
          const extracurricular = docs?.filter(d => d.category === 'extracurricular')?.length || 0;
          
          // Count verified documents - handle boolean true only (not string)
          const verifiedCount = docs?.filter(d => {
            const isChecked = d.is_checked;
            const isVerified = isChecked === true;
            return isVerified;
          }).length || 0;
          
          const totalDocs = docs?.length || 0;
          
          // Debug log for each student
          if (totalDocs > 0) {
            console.log(`[ELIGIBLE] Student ${student.email}: ${totalDocs} docs, ${verifiedCount} verified, IDs:`, docs.map(d => ({ id: d.id, category: d.category, is_checked: d.is_checked })));
          }

          return {
            ...student,
            academic_count: academics,
            personal_count: personal,
            extracurricular_count: extracurricular,
            verified_count: verifiedCount,
            document_count: totalDocs
          };
        }));

        const studentsWithPublicIds = await attachStudentPublicIds(studentsWithDocs);
        
        console.log('[ELIGIBLE] ========== STUDENT FILTERING DEBUG ==========');
        console.log('[ELIGIBLE] Total students from eligible_students view:', studentsWithPublicIds?.length || 0);
        
        // Separate into pending and verified for debugging
        // Use doc_verification_count to determine if student should be removed
        const verifiedStudents = [];
        const pendingStudents = [];
        
        studentsWithPublicIds?.forEach((student) => {
          const docCount = student.document_count || 0;

          // Document verification visibility is based on whether the underlying
          // student_documents rows are marked as checked/verified.
          const isCheckedVerified = (student.verified_count || 0) > 0;
          const isVerified = docCount > 0 && isCheckedVerified;

          
          if (isVerified) {
            verifiedStudents.push({
              email: student.email,
              name: student.full_name || student.name,
              docs: docCount,
            verification_count: (student.doc_verification_count || student.verified_count || 0)
            });
          } else {
            pendingStudents.push(student);
          }
        });
        
        console.log('[ELIGIBLE] Verified students (doc_verification_count > 0, will be REMOVED):', verifiedStudents);
        console.log('[ELIGIBLE] Pending verification students (will SHOW in list):', pendingStudents.length);
        console.log('[ELIGIBLE] ========== END DEBUG ==========');
        
        setEligibleStudentsRaw(studentsWithPublicIds || []);
        setEligibleStudents(pendingStudents);
        setEligibleCount(pendingStudents?.length || 0);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Error fetching data');
    } finally {
      setLoadingEligible(false);
    }
  };

  const handleViewDocuments = async (student, category) => {
    setViewDocumentsStudent(student);
    setViewDocumentsCategory(category);
    setLoadingDocs(true);

    try {
      await refreshDocumentPanel(student, category);
    } catch (err) {
      console.error('Error fetching documents:', err);
      alert('Error fetching documents: ' + err.message);
    } finally {
      setLoadingDocs(false);
    }
  };

  const refreshDocumentPanel = async (student, category) => {
    const realStudentId = Number(
      student.student_id ||
      student.student_form_id ||
      student.id
    );

    console.log("Fetching docs for:", realStudentId);

    const { data: fetchedDocs, error: docsError } = await supabase
      .from('student_documents')
      .select('*')
      .eq('student_id', realStudentId)
      .eq('category', category)
      .order('uploaded_at', { ascending: false });

    if (docsError) {
      console.error('Error fetching documents:', docsError);
      return;
    }

    const groupedDocs = {};
    (fetchedDocs || []).forEach(doc => {
      const year = doc.education_year || 'Unknown';
      if (!groupedDocs[year]) {
        groupedDocs[year] = [];
      }
      groupedDocs[year].push(doc);
    });

    const sortedYears = Object.keys(groupedDocs).sort((a, b) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return b.localeCompare(a);
    });

    setStudentDocuments(fetchedDocs || []);
    setGroupedDocuments(groupedDocs);
    setSortedYears(sortedYears);
  };

  const handleVerifyStudentDocuments = async (student) => {
    setLoadingEligible(true);
    try {
      console.log('[DOC_VERIFY] Starting verification for student:', student.email);
      
      const { data: formData, error: formError } = await supabase
        .from('student_form_submissions')
        .select('*')
        .eq('email', student.email)
        .single();

      if (formError || !formData?.id) {
        alert('Unable to verify documents: student form not found');
        return;
      }

      const studentFormId = formData.id;
      console.log('[DOC_VERIFY] Student form ID:', studentFormId);

      // Fetch ALL documents for this student BEFORE update to see current state
      let docsBefore = [];
      let documentStudentId = studentFormId;

      // Try to fetch documents using student_form_submissions ID
      const { data: formDocs } = await supabase
        .from('student_documents')
        .select('id, student_id, category, is_checked')
        .eq('student_id', studentFormId);
      
      docsBefore = formDocs || [];

      // If no documents found with form ID, try the eligible_students.id as fallback
      if (docsBefore.length === 0 && student.id) {
        console.log(`[DOC_VERIFY] No docs found with formId ${studentFormId}, trying eligible_students.id ${student.id}`);
        const { data: eligibleDocs } = await supabase
          .from('student_documents')
          .select('id, student_id, category, is_checked')
          .eq('student_id', student.id);
        
        if (eligibleDocs && eligibleDocs.length > 0) {
          docsBefore = eligibleDocs;
          documentStudentId = student.id;
          console.log(`[DOC_VERIFY] Found ${eligibleDocs.length} documents using eligible_students.id`);
        }
      }
      
      console.log('[DOC_VERIFY] Documents BEFORE update:', docsBefore?.length, 'total');
      console.log('[DOC_VERIFY] Documents BEFORE update - is_checked values:', docsBefore?.map(d => ({ category: d.category, is_checked: d.is_checked })));

      // Update documents using the determined student_id
      const { error: updateError } = await supabase
        .from('student_documents')
        .update({ is_checked: true })
        .eq('student_id', documentStudentId)
        .in('category', ['academic', 'personal', 'extracurricular']);

      if (updateError) {
        console.error('Error verifying documents:', updateError);
        alert('Unable to mark documents as verified: ' + updateError.message);
        return;
      }
      
      console.log('[DOC_VERIFY] Documents updated successfully');
      
      // Fetch documents AFTER update to confirm
      const { data: docsAfter } = await supabase
        .from('student_documents')
        .select('id, student_id, category, is_checked')
        .eq('student_id', documentStudentId);
      
      console.log('[DOC_VERIFY] Documents AFTER update:', docsAfter?.length, 'total');
      console.log('[DOC_VERIFY] Documents AFTER update - is_checked values:', docsAfter?.map(d => ({ category: d.category, is_checked: d.is_checked })));
      
      // Count how many docs are now verified
      const verifiedAfterUpdate = docsAfter?.filter(d => d.is_checked === true).length || 0;
      const totalAfterUpdate = docsAfter?.length || 0;
      console.log(`[DOC_VERIFY] Verification summary: ${verifiedAfterUpdate}/${totalAfterUpdate} documents now verified`);

      // Increment doc_verification_count to track verification progress
      // This is used internally to move student to fee tracking
      const currentCount = student.doc_verification_count || 0;
      const newCount = currentCount + 1;
      
      console.log(`[DOC_VERIFY] Incrementing doc_verification_count from ${currentCount} to ${newCount} for ${student.email}`);
      
      // Update doc_verification_count in eligible_students
      const { error: countError } = await supabase
        .from('eligible_students')
        .update({ doc_verification_count: newCount })
        .eq('email', student.email);
      
      if (countError) {
        console.error('[DOC_VERIFY] Error updating doc_verification_count:', countError);
        // Don't fail the verification if count update fails
      } else {
        console.log(`[DOC_VERIFY] doc_verification_count updated successfully to ${newCount}`);
      }

      // After verification, populate/update fee_tracking with latest student data
      await populateOrUpdateFeeTracking(studentFormId, formData);

      // Refresh the eligible students list (this will automatically filter out fully verified students)
      console.log('[DOC_VERIFY] Refreshing eligible students list...');
      await fetchEligibleStudents();
      console.log('[DOC_VERIFY] Eligible students list refreshed');
      
      alert('✅ Documents verified successfully!');
    } catch (err) {
      console.error('Error verifying documents:', err);
      alert('Error verifying documents: ' + err.message);
    } finally {
      setLoadingEligible(false);
    }
  };

  // Populate or update fee_tracking after document verification
  // This function is called every time doc_verification_count is incremented
  // ALL fields populated from student_form_submissions - NO NULL values allowed
  const populateOrUpdateFeeTracking = async (studentFormId, formData) => {
    try {
      // Calculate total_educational_expenses from form data
      let totalEducationalExpenses = 0;
      
      // Priority 1: Use total_educational_expenses field directly
      if (formData.total_educational_expenses) {
        totalEducationalExpenses = parseFloat(formData.total_educational_expenses) || 0;
      }
      
      // Priority 2: Calculate from educational_expenses JSON
      if (totalEducationalExpenses === 0 && formData.educational_expenses && typeof formData.educational_expenses === 'object') {
        totalEducationalExpenses = Object.values(formData.educational_expenses).reduce((sum, expense) => {
          if (expense && expense.checked && expense.amount) {
            return sum + parseFloat(expense.amount) || 0;
          }
          return sum;
        }, 0);
      }

// Priority 3: Use fee field as fallback
      if (totalEducationalExpenses === 0 && formData.fee) {
        totalEducationalExpenses = parseFloat(formData.fee) || 0;
      }

      // Prepare fee tracking payload with exact table schema
      // ALL fields must have values - NO NULL values allowed except voucher_url
      const feePayload = {
        student_form_id: studentFormId || 0,
        student_public_id: formData.student_public_id || `STU-${studentFormId}`,
        student_name: formData.full_name || formData.first_name || formData.last_name || 'Student Name',
        email: formData.email || 'no-email@example.com',
        whatsapp_number: formData.whatsapp || formData.contact || 'N/A',
        camp_name: formData.camp_name || 'N/A',
        camp_date: formData.camp_date || new Date().toISOString().split('T')[0],
        education: formData.educationcategory || formData.educationsubcategory || formData.class || formData.educationyear || 'N/A',
        school: formData.school || 'N/A',
        branch: formData.branch || 'N/A',
        total_educational_expenses: totalEducationalExpenses || 0,
        fee_paid_by_tal: 0,
        total_paid_by_tal: 0,
        fee_status: 'Pending',
        voucher_url: null, // Only field allowed to be null initially
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Log what we're about to insert for debugging
      console.log('Fee tracking payload:', feePayload);

// ALWAYS CREATE NEW ROW ON EVERY VERIFICATION (per requirement)
console.log('📝 Creating NEW fee_tracking row for verification #', formData.email);

const { error: insertError, data: insertedData } = await supabase
  .from('fee_tracking')
  .insert(feePayload)
  .select();

if (insertError) {
  console.error('❌ INSERT failed:', insertError);
} else {
  console.log('✅ NEW Fee tracking record CREATED:', insertedData[0].id);
}

await fetchFeeTrackingRecords();

      // ESLint fix: error is insertError
      if (insertError) {
        console.error('❌ INSERT failed:', insertError);
      } else {
        console.log('✅ NEW Fee tracking record CREATED:', insertedData[0]?.id);
      }
      await fetchFeeTrackingRecords();
    } catch (err) {
      console.error('❌ Error in populateOrUpdateFeeTracking:', err);
      console.error('Error stack:', err.stack);
    }
  };

  // Verify individual document
  const handleVerifySingleDocument = async (docId) => {
    try {
      const { data: currentDoc, error: currentDocError } = await supabase
        .from('student_documents')
        .select('category')
        .eq('id', docId)
        .maybeSingle();

      if (currentDocError) {
        throw currentDocError;
      }

      const { error: updateError } = await supabase
        .from('student_documents')
        .update({ is_checked: true })
        .eq('id', docId);

      if (updateError) {
        throw updateError;
      }

      // Refresh the document list
      if (viewDocumentsStudent && currentDoc?.category) {
        await refreshDocumentPanel(viewDocumentsStudent, currentDoc.category);
      }
      
      // Refresh the eligible students list to remove fully verified students
      console.log('[DOC_VERIFY] Refreshing eligible students list...');
      await fetchEligibleStudents();
      console.log('[DOC_VERIFY] Eligible students list refreshed');
      
      alert('✅ Document verified successfully!');
    } catch (err) {
      console.error('Error verifying document:', err);
      alert('Error verifying document: ' + err.message);
    }
  };

  const handleDeleteSingleDocument = async (doc) => {
    const confirmDelete = window.confirm(
      `Delete ${doc.document_name || doc.file_name || 'this document'}? This will remove it permanently.`,
    );

    if (!confirmDelete) return;

    setDeletingDocumentId(doc.id);

    try {
      const storagePath = getStoragePathFromUrl(doc.file_url);

      if (storagePath) {
        const { error: storageError } = await supabase.storage
          .from('student_documents')
          .remove([storagePath]);

        if (storageError) {
          console.error('Error deleting storage file:', storageError);
        }
      }

      const { error: deleteError } = await supabase
        .from('student_documents')
        .delete()
        .eq('id', doc.id);

      if (deleteError) {
        throw deleteError;
      }

      if (viewDocumentsStudent) {
        await refreshDocumentPanel(viewDocumentsStudent, viewDocumentsCategory || doc.category);
      }

      alert('✅ Document deleted successfully!');
    } catch (err) {
      console.error('Error deleting document:', err);
      alert('Error deleting document: ' + err.message);
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const fetchNonEligibleStudents = useCallback(async () => {
    setLoadingNonEligible(true);
    try {
      console.log('[FETCH_NON_ELIGIBLE] Starting fetch...');
      const { data, error } = await supabase
        .from('non_eligible_students')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('[FETCH_NON_ELIGIBLE] Raw response:', { data, error });

      if (error) {
        console.error('[FETCH_NON_ELIGIBLE] ❌ Supabase error:', error);
        alert('⚠️ Error fetching non-eligible students: ' + error.message);
        setNonEligibleStudents([]);
        setNonEligibleCount(0);
        return;
      }

      if (!data || data.length === 0) {
        console.log('[FETCH_NON_ELIGIBLE] ✓ No non-eligible students found in table');
        setNonEligibleStudents([]);
        setNonEligibleCount(0);
        return;
      }

      console.log('[FETCH_NON_ELIGIBLE] Fetched', data.length, 'records. First record:', data[0]);

      // Transform data to match table format with robust field handling
      const transformedStudents = (data || []).map((student, index) => {
        // Handle various possible field names from database
        const dbId = student.id || index + 1;
        const dbName = student.full_name || student.student_name || student.name || 'Student';
        const dbEmail = student.email || student.student_email || 'no-email@example.com';
        const dbContact = student.contact || student.student_contact || student.phone || student.whatsapp || 'N/A';
        const dbClass = student.class || student.year || 'N/A';
        const dbSchool = student.school || 'N/A';
        const dbAddress = student.address || 'N/A';
        const dbAge = student.age || null;
        const dbPublicId = student.student_public_id || `STU-${dbId}`;
        const dbCreatedAt = student.created_at || new Date().toISOString();
        const dbCampName = student.camp_name || student.campName || null;
        const dbCampDate = student.camp_date || student.campDate || null;
        const dbStatus = student.status || 'Not Eligible';
        
        // Academic fields
        const dbPrevPercent = student.prev_percent || null;
        const dbPresentPercent = student.present_percent || null;
        const dbAcademicAchievements = student.academic_achievements || null;
        const dbNonAcademicAchievements = student.non_academic_achievements || null;
        
        // Family information
        const dbHasScholarship = student.has_scholarship || student.scholarship === 'Yes' || false;
        const dbDoesWork = student.does_work || false;
        const dbEarningMembers = student.earning_members || 0;
        const dbIsSingleParent = student.is_single_parent || false;
        const dbSpecialRemarks = student.special_remarks || '';
        
        // Volunteer/Contact info
        const dbVolunteerName = student.volunteer_name || 'N/A';
        const dbVolunteerContact = student.volunteer_contact || 'N/A';
        const dbParentContact2 = student.parent_contact_2 || 'N/A';

        return {
          id: dbId,
          student_id: student.student_id || dbId,
          student_public_id: dbPublicId,
          full_name: dbName,
          name: dbName,
          email: dbEmail,
          contact: dbContact,
          contact_number: dbContact,
          phone: dbContact,
          whatsapp: student.whatsapp || dbContact,
          student_contact: student.student_contact || dbContact,
          parent_contact_2: dbParentContact2,
          address: dbAddress,
          age: dbAge,
          class: dbClass,
          year: dbClass,
          school: dbSchool,
          prev_percent: dbPrevPercent,
          present_percent: dbPresentPercent,
          academic_achievements: dbAcademicAchievements,
          non_academic_achievements: dbNonAcademicAchievements,
          has_scholarship: dbHasScholarship,
          scholarship: dbHasScholarship ? 'Yes' : 'No',
          does_work: dbDoesWork,
          earning_members: dbEarningMembers,
          is_single_parent: dbIsSingleParent,
          special_remarks: dbSpecialRemarks,
          volunteer_name: dbVolunteerName,
          volunteer_contact: dbVolunteerContact,
          // CamelCase versions (for UI table rendering)
          campName: dbCampName,
          campDate: dbCampDate,
          camp_name: dbCampName,
          camp_date: dbCampDate,
          status: dbStatus,
          created_at: dbCreatedAt,
          updated_at: student.updated_at || dbCreatedAt
        };
      });

      console.log('[FETCH_NON_ELIGIBLE] Transformed', transformedStudents.length, 'non-eligible students');
      setNonEligibleStudents(transformedStudents);
      setNonEligibleCount(transformedStudents.length);

      try {
        const studentsWithPublicIds = await attachStudentPublicIds(transformedStudents);
        if (Array.isArray(studentsWithPublicIds) && studentsWithPublicIds.length > 0) {
          setNonEligibleStudents(studentsWithPublicIds);
          setNonEligibleCount(studentsWithPublicIds.length);
        }
      } catch (attachError) {
        console.warn('[FETCH_NON_ELIGIBLE] attachStudentPublicIds failed, showing raw records:', attachError);
      }
    } catch (err) {
      console.error('[FETCH_NON_ELIGIBLE] Unexpected error:', err);
    } finally {
      setLoadingNonEligible(false);
    }
  }, [attachStudentPublicIds]);

  useEffect(() => {
    if (activeSection === 'noneligible') {
      console.log('[SECTION_CHANGE] Non-eligible section activated, fetching data...');
      fetchNonEligibleStudents();
    }
  }, [activeSection, fetchNonEligibleStudents]);

  // Auto-load non-eligible students on component mount and refresh periodically
  useEffect(() => {
    console.log('[MOUNT] Component mounted, loading non-eligible students...');
    fetchNonEligibleStudents();
    
    // Refresh every 30 seconds if on non-eligible section
    const interval = setInterval(() => {
      if (activeSection === 'noneligible') {
        console.log('[AUTO_REFRESH] Refreshing non-eligible students...');
        fetchNonEligibleStudents();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [fetchNonEligibleStudents, activeSection]);

  const fetchFeeTrackingRecords = async () => {
    setLoadingFeeTracking(true);
    try {
      const { data, error } = await supabase
        .from('fee_tracking')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching fee tracking records:', error);
        return;
      }
      setFeeTrackingRecords(data || []);
    } catch (err) {
      console.error('Error fetching fee tracking records:', err);
    } finally {
      setLoadingFeeTracking(false);
    }
  };

  const handleFeePaidChange = (studentId, value) => {
    setFeePaidInput((prev) => ({ ...prev, [studentId]: value }));
  };

  const handleSaveFeeRecord = async (student) => {
    const studentFormId = student.student_form_id || student.student_id || student.id;
    if (!studentFormId) {
      alert('Cannot save fee record: missing student form id');
      return;
    }

    const normalizedStudentFormId = Number(studentFormId);
    const recordStudentFormId = Number.isFinite(normalizedStudentFormId) ? normalizedStudentFormId : studentFormId;
    const existingRecord = getFeeTrackingRecord(student);
    const requiredFee = parseMoney(existingRecord?.total_educational_expenses || 0);
    const paidValue = parseMoney(feePaidInput[studentFormId] ?? existingRecord?.fee_paid_by_tal ?? 0);
    
    // VALIDATION: fee_paid_by_tal should NEVER exceed total_educational_expenses
    if (paidValue > requiredFee && requiredFee > 0) {
      alert(`Error: Paid amount (₹${paidValue.toLocaleString()}) cannot exceed required fee (₹${requiredFee.toLocaleString()})`);
      return;
    }
    
    const feeStatus = paidValue === 0 ? 'Pending' : paidValue >= requiredFee && requiredFee > 0 ? 'Paid' : 'Partial';
    const studentName = student.student_name || student.full_name || student.name || existingRecord?.student_name;
    const studentEmail = student.email || existingRecord?.email;
    const studentPublicId = student.student_public_id || existingRecord?.student_public_id || asComparableId(studentFormId);

    if (!studentName || !studentEmail) {
      alert('Cannot save fee record: student name and email are required');
      return;
    }

    const payload = {
      student_form_id: recordStudentFormId || 0,
      student_public_id: studentPublicId || `STU-${recordStudentFormId}`,
      student_name: studentName || 'Student Name',
      email: studentEmail || 'no-email@example.com',
      whatsapp_number: student.whatsapp_number || student.whatsapp || existingRecord?.whatsapp_number || 'N/A',
      camp_name: student.camp_name || student.campName || existingRecord?.camp_name || 'N/A',
      camp_date: student.camp_date || student.campDate || existingRecord?.camp_date || new Date().toISOString().split('T')[0],
      education: student.education || student.course || student.educationcategory || existingRecord?.education || 'N/A',
      school: student.school || existingRecord?.school || 'N/A',
      branch: student.branch || existingRecord?.branch || 'N/A',
      total_educational_expenses: existingRecord?.total_educational_expenses || student.total_educational_expenses || requiredFee || 0,
      fee_paid_by_tal: paidValue || 0,
      total_paid_by_tal: paidValue || 0,
      fee_status: feeStatus || 'Pending',
      updated_at: new Date().toISOString(),
    };

    setSavingFeeRecord(true);
    try {
      // Find LATEST record by student_form_id for update
      const { data: existing, error: findError } = await supabase
        .from('fee_tracking')
        .select('id')
        .eq('student_form_id', recordStudentFormId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findError) {
        console.error('Error locating fee tracking record:', findError);
        alert('Unable to save fee record.');
        return;
      }

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('fee_tracking')
          .update(payload)
          .eq('id', existing.id);

        if (updateError) {
          throw updateError;
        }
        console.log(`✅ Updated fee record ID ${existing.id}`);
      } else {
        console.warn('No existing fee record found - creating new');
        const { error: insertError } = await supabase
          .from('fee_tracking')
          .insert(payload);

        if (insertError) {
          throw insertError;
        }
      }

      await fetchFeeTrackingRecords();
alert(`✅ Fee record saved! Status: ${feeStatus}. Student dashboard auto-updates via realtime. Ask student to update total_educational_expenses in profile → syncs on next doc verification.`);
    } catch (err) {
      console.error('Error saving fee record:', err);
      alert('Unable to save fee record: ' + err.message);
    } finally {
      setSavingFeeRecord(false);
    }
  };

  const handleUploadVoucher = async (student, file) => {
    const studentFormId = student.student_form_id || student.student_id || student.id;
    if (!studentFormId) {
      alert('Cannot upload voucher: missing student form id');
      return;
    }

    const safeEmail = (student.email || 'student').replace(/[^a-zA-Z0-9@._-]/g, '_');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${safeEmail}/voucher/${Date.now()}-${safeName}`;

    setUploadingVoucherFor(studentFormId);
    try {
      const { error: uploadError } = await supabase.storage
        .from('student_documents')
        .upload(filePath, file, { upsert: false });
      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('student_documents')
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase
        .from('student_documents')
        .insert({
          student_id: studentFormId,
          category: 'fee',
          document_name: 'Voucher Upload',
          file_name: file.name,
          file_url: publicUrl,
          uploaded_at: new Date().toISOString(),
        });

      if (insertError) {
        throw insertError;
      }

      // Find LATEST paid fee record by student_form_id
      const { data: existing, error: findError } = await supabase
        .from('fee_tracking')
        .select('id, student_name, email, student_public_id, fee_paid_by_tal')
        .eq('student_form_id', studentFormId)
        .gte('fee_paid_by_tal', 1)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findError) {
        throw findError;
      }

      if (!existing?.id || parseMoney(existing.fee_paid_by_tal) <= 0) {
        alert('Save the fee record first before uploading a voucher.');
        return;
      }

      const updatePayload = {
        voucher_url: publicUrl,
        voucher_uploaded_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('fee_tracking')
          .update(updatePayload)
          .eq('id', existing.id);
        if (updateError) throw updateError;
      }

await fetchFeeTrackingRecords();
      await fetchStudentFeeReceipts(); // Refresh receipts list to show new admin voucher
      alert('✅ Voucher uploaded successfully and ready for verification in Fee Receipts tab!');
    } catch (err) {
      console.error('Error uploading voucher:', err);
      alert('Voucher upload failed: ' + err.message);
    } finally {
      setUploadingVoucherFor(null);
    }
  };

  const handleDownloadEligibleReport = () => {
    if (!selectedReportCampScope) {
      alert('Please select a camp name and camp date for the report scope.');
      return;
    }

    if (scopedEligibleStudents.length === 0) {
      alert(selectedReportCampScope.key === 'all'
        ? 'No eligible students found for the full report.'
        : `No eligible students found for ${selectedReportCampScope.campName} on ${selectedReportCampScope.campDate}`);
      return;
    }

    const rows = [
      "Student ID,Name,email,contact,Education details,School/College,created_at",
      ...scopedEligibleStudents.map(s => {
        const studentName = s.full_name || s.student_name || s.name || '';
        const classVal = s.class || s.year || '';
        return `"${s.student_public_id || ''}","${studentName}","${s.email || ''}","${s.contact || ''}","${classVal}","${s.school || ''}","${s.created_at || ''}"`;
      })
    ];
    
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedReportCampScope.key === 'all'
      ? 'eligible-students-all.csv'
      : `eligible-students-${selectedReportCampScope.campName}-${selectedReportCampScope.campDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    alert('Report downloaded successfully!');
  };

  const handleDownloadNonEligibleReport = () => {
    if (!selectedReportCampScope) {
      alert('Please select a camp name and camp date for the report scope.');
      return;
    }

    if (scopedNonEligibleStudents.length === 0) {
      alert(selectedReportCampScope.key === 'all'
        ? 'No non-eligible students found for the full report.'
        : `No non-eligible students found for ${selectedReportCampScope.campName} on ${selectedReportCampScope.campDate}`);
      return;
    }

    const rows = [
      "Student ID,Name,email,contact,Education details,School/College,created_at",
      ...scopedNonEligibleStudents.map(s => {
        const studentName = s.full_name || s.student_name || s.name || '';
        const classVal = s.class || s.year || '';
        return `"${s.student_public_id || ''}","${studentName}","${s.email || ''}","${s.contact || ''}","${classVal}","${s.school || ''}","${s.created_at || ''}"`;
      })
    ];
    
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedReportCampScope.key === 'all'
      ? 'non-eligible-students-all.csv'
      : `non-eligible-students-${selectedReportCampScope.campName}-${selectedReportCampScope.campDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    alert('Report downloaded successfully!');
  };
/*
  const handleDelete = (id) => {
    if (!window.confirm("Delete this student record?")) return;
    setStudents((prev) => prev.filter((p) => p.id !== id));
  };
*/


const handleApprove = async (student) => {
  try {
    const { error } = await supabase.rpc('approve_student', {
      p_id: student.student_id || student.id,
    });

    if (error) {
      console.error('[APPROVE_STUDENT] RPC error:', error);
      alert("❌ " + error.message);
      return;
    }

    console.log('[APPROVE_STUDENT] Successfully approved student:', student.email);

    // send email
    await fetch("https://rmsmoqkfunrumebfjzah.supabase.co/functions/v1/send-eligibility-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtc21vcWtmdW5ydW1lYmZqemFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NjMzNTksImV4cCI6MjA3NzIzOTM1OX0.VxTjXGWfojQxE_f7SVyXIsBTFKHrEzwJ9dkCmQZeX8U
`,
      },
      body: JSON.stringify({
        email: student.email,
        name: student.full_name || "Student",
      }),
    });

    alert("✅ Student approved");

    // Refresh all tables and counts
    await fetchStudents();
    await fetchEligibleStudents();
    await fetchNonEligibleStudents();
    await fetchEligibleCount();
    await fetchNonEligibleCount();
  } catch (err) {
    console.error('[APPROVE_STUDENT] Catch error:', err);
    alert("❌ " + err.message);
  }
};

const handleMoveToEligible = async (student) => {
  try {

    // =====================================================
    // 1️⃣ MOVE STUDENT FIRST
    // =====================================================

    const moveId = student.id;

    const { data, error } = await supabase.rpc(
      "move_to_eligible_from_non_eligible",
      {
        p_id: moveId,
      }
    );

    if (error) {
      console.error("RPC ERROR:", error);
      alert(`❌ ${error.message}`);
      return;
    }

    if (!data?.success) {
      console.error("MOVE FAILED:", data);
      alert(`❌ ${data?.message || "Failed to move student"}`);
      return;
    }

    // =====================================================
    // 2️⃣ REFRESH DATABASE DATA
    // =====================================================

    await fetchNonEligibleStudents();
    await fetchEligibleStudents();
    await fetchEligibleCount();

    // =====================================================
    // 3️⃣ SEND EMAIL AFTER SUCCESS
    // =====================================================

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        console.error("No session token");
      } else if (student.email) {

        const response = await fetch(
          "https://rmsmoqkfunrumebfjzah.supabase.co/functions/v1/send-eligibility-email",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              email: student.email,
              name:
                student.student_name ||
                student.full_name ||
                student.name ||
                "Student",
            }),
          }
        );

        const result = await response.json();

        console.log("EMAIL RESPONSE:", result);

        if (!response.ok) {
          console.error("Email failed:", result);

          alert(
            `⚠️ Student moved successfully but email failed`
          );

          return;
        }

        console.log("✅ Email sent");
      }

    } catch (mailErr) {
      console.error("MAIL ERROR:", mailErr);
    }

    // =====================================================
    // 4️⃣ SUCCESS
    // =====================================================

    alert("✅ Student moved to Eligible successfully");

  } catch (err) {
    console.error(err);
    alert(`❌ ${err.message}`);
  }
};

const handleNotApprove = async (student) => {
  // Remove from UI instantly
  setStudents((prev) =>
    prev.filter((s) => s.student_id !== student.student_id)
  );

  try {
    // Use RPC to reject student (handles RLS properly)
    const { error } = await supabase.rpc('reject_student', {
      p_id: student.student_id || student.id,
    });

    if (error) {
      console.error('[REJECT_STUDENT] RPC error:', error);
      alert('❌ Failed to reject student: ' + error.message);
      // restore UI if failed
      await fetchStudents();
      return;
    }

    console.log('[REJECT_STUDENT] Successfully rejected student:', student.email);

    // Refresh all tables after rejection
    await fetchStudents();
    await fetchEligibleStudents();
    await fetchNonEligibleStudents();
    await fetchNonEligibleCount();

    alert('✅ Student moved to Non-Eligible successfully!');
  } catch (err) {
    console.error('[REJECT_STUDENT] Catch error:', err);
    alert('❌ Error: ' + err.message);

    // restore UI if error
    await fetchStudents();
  }
};

const fetchStudents = async () => {
  try {
    const { data, error } = await supabase
      .from('admin_student_info')
      .select('*')
      .eq('status', 'Pending');

    if (error) {
      console.error('[FETCH_STUDENTS] Supabase error:', error);
      return;
    }

    if (!data || data.length === 0) {
      console.log('[FETCH_STUDENTS] No pending students found');
      setStudents([]);
      return;
    }

    // Transform data to match table format with robust field handling
    const transformedStudents = (data || []).map((student, index) => {
      // Handle various possible field names from database
      const dbId = student.id || student.student_id || index + 1;
      const dbFormId = student.student_id || student.form_id || null;
      const dbName = student.student_name || student.full_name || student.name || 'Student';
      const dbEmail = student.email || student.student_email || 'no-email@example.com';
      const dbContact = student.contact || student.phone || student.whatsapp || student.contact_number || 'N/A';
      const dbEducation = student.education || student.course || student.class || student.educationcategory || student.year || 'N/A';
      const dbClass = student.class || student.year || student.education || 'N/A';
      const dbPublicId = student.student_public_id || student.public_id || `STU-${dbId}`;
      const dbCreatedAt = student.created_at || new Date().toISOString();
      const dbCampName = student.camp_name || student.campName || null;
      const dbCampDate = student.camp_date || student.campDate || null;
      const dbPercentage = student.percentage || student.prev_percent || student.present_percent || null;

      return {
        id: dbId,
        student_id: dbId,
        student_form_id: dbFormId,
        student_public_id: dbPublicId,
        name: dbName,
        full_name: dbName,
        email: dbEmail,
        contact: dbContact,
        contact_number: dbContact,
        phone: dbContact,
        education: dbEducation,
        course: dbEducation,
        class: dbClass,
        year: dbClass,
        school: student.school || 'N/A',
        // Snake case versions
        camp_name: dbCampName,
        camp_date: dbCampDate,
        // CamelCase versions (for UI table rendering)
        campName: dbCampName,
        campDate: dbCampDate,
        percentage: dbPercentage,
        created_at: dbCreatedAt,
        status: student.status || 'Pending'
      };
    });

    console.log('[FETCH_STUDENTS] Transformed', transformedStudents.length, 'students');
    const studentsWithPublicIds = await attachStudentPublicIds(transformedStudents);
    setStudents(studentsWithPublicIds);
  } catch (err) {
    console.error('[FETCH_STUDENTS] Unexpected error:', err);
  }
};





  const parseOptionalFloat = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const parseOptionalInt = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const handleEditSave = async (data) => {
    const patchData = {
      full_name: data.name,
      email: data.email,
      contact: data.contact,
      parent_contact_2: data.parent_contact_2,
      whatsapp: data.whatsapp,
      student_contact: data.student_contact,
      address: data.address,
      school: data.school,
      class: data.year,
      camp_name: data.campName || null,
      camp_date: data.campDate ? data.campDate.trim() || null : null,
      prev_percent: parseOptionalFloat(data.prev_percent),
      present_percent: parseOptionalFloat(data.present_percent),
      has_scholarship: data.has_scholarship === 'Yes' || data.has_scholarship === 'YES' || data.has_scholarship === true,
      scholarship: data.scholarship,
      does_work: data.does_work === 'Yes' || data.does_work === 'YES' || data.does_work === true,
      earning_members: parseOptionalInt(data.earning_members),
      academic_achievements: data.academic_achievements,
      non_academic_achievements: data.non_academic_achievements,
      is_single_parent: data.is_single_parent === 'Yes' || data.is_single_parent === 'YES' || data.is_single_parent === true,
      special_remarks: data.special_remarks,
      volunteer_name: data.volunteer_name,
      volunteer_contact: data.volunteer_contact,
    };

    try {
      const { error } = await supabase
        .from('admin_student_info')
        .update(patchData)
        .eq('id', data.id);

      if (error) {
        console.error('Error saving student edit:', error);
        alert('❌ Failed to save student edits: ' + error.message);
        return;
      }

      const studentFormId = editStudent?.student_form_id || data.student_form_id;
      if (studentFormId) {
        const studentPatch = {
          full_name: data.name,
          first_name: data.name,
          email: data.email,
          contact: data.contact,
          parent_contact_2: data.parent_contact_2,
          whatsapp: data.whatsapp,
          student_contact: data.student_contact,
          address: data.address,
          school: data.school,
          branch: data.college,
          class: data.year,
          educationcategory: data.course,
          camp_name: data.campName || null,
          camp_date: data.campDate ? data.campDate.trim() || null : null,
          prev_percent: parseOptionalFloat(data.prev_percent),
          present_percent: parseOptionalFloat(data.present_percent),
          has_scholarship: patchData.has_scholarship,
          scholarship: data.scholarship,
          does_work: patchData.does_work,
          earning_members: parseOptionalInt(data.earning_members),
          academic_achievements: data.academic_achievements,
          non_academic_achievements: data.non_academic_achievements,
          is_single_parent: patchData.is_single_parent,
          special_remarks: data.special_remarks,
          volunteer_name: data.volunteer_name,
          volunteer_contact: data.volunteer_contact,
        };

        const { error: studentError } = await supabase
          .from('student_form_submissions')
          .update(studentPatch)
          .eq('id', studentFormId);

        if (studentError) {
          console.error('Error saving student_form_submissions edit:', studentError);
          alert('⚠️ Saved admin record, but failed to update student_form_submissions: ' + studentError.message);
        }
      }

      setStudents((prev) => prev.map((p) => (p.id === data.id ? { ...p, ...patchData, ...data } : p)));
      if (viewStudent?.id === data.id) {
        setViewStudent((prev) => ({ ...prev, ...patchData, ...data }));
      }
      setEditStudent(null);
      alert('✅ Student details updated successfully.');
    } catch (err) {
      console.error(err);
      alert('❌ Error saving student edits: ' + (err.message || err));
    }
  };

  const exportCSV = () => {
    // include new fields campName,campDate,course,paidDate
    const rows = [
      "Student ID,Name,email,contact,Education details,School/College,created_at,donor,feeStatus,course,campName,campDate,paidDate",
      ...students.map(s => {
        const studentName = s.full_name || s.student_name || s.name || '';
        const classVal = s.class || s.year || '';
        return `"${s.student_public_id || ""}","${studentName}","${s.email || ''}","${s.contact || ''}","${classVal}","${s.school || ''}","${s.created_at || ''}",${s.donor},${s.feeStatus},"${s.course || ""}","${s.campName || ""}",${s.campDate || ""},${s.paidDate || ""}`;
      })
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- New handlers for interactive buttons ---
  /*const handleAddDonor = () => {
    const name = window.prompt('Donor name');
    if (!name) return;
    const amount = window.prompt('Amount (number)');
    if (!amount) return;
    const newDonor = { id: Date.now(), name, amount: Number(amount), years: '2025-2026' };
    setDonors((d) => [...d, newDonor]);
    alert('Donor added (demo)');
  };
  */
/*
  const handleExportDonorReport = () => {
    const rows = ['id,name,amount,years', ...donors.map(d => `${d.id},${d.name},${d.amount},${d.years}`)];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'donors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
*/

  // Edit donor state
  const [editingDonor, setEditingDonor] = useState(null);
  
  const formatDonationDateForInput = (donationDate) => {
    if (!donationDate) return '';
    if (typeof donationDate === 'string') return donationDate.slice(0, 16);
    if (donationDate instanceof Date) return donationDate.toISOString().slice(0, 16);
    return new Date(donationDate).toISOString().slice(0, 16);
  };

  const handleEditDonor = (donor) => {
    const editData = {
      ...donor,
      donation_date: formatDonationDateForInput(donor.donation_date),
    };
    setEditingDonor(editData);
    setEditDonorForm(editData);
    setShowEditDonorModal(true);
  };
  
  const handleDeleteDonor = async (donor) => {
    if (!window.confirm(`Delete donor ${donor.full_name}?`)) return;
    
    const { error } = await supabase
      .from('donor_details')
      .delete()
      .eq('id', donor.id);
    
    if (error) {
      alert('❌ Delete failed: ' + error.message);
    } else {
      await fetchDonors();
      alert('✅ Donor deleted');
    }
  };


  const handleExportDonorReport = () => {
    const rows = ['id,full_name,email,phone,donor_type,amount,payment_method,transaction_id,donation_type,donation_date,created_at', 
                  ...donors.map(d => `${d.id},"${d.full_name || d.name}","${d.email}","${d.phone || ''}","${d.donor_type}","${d.amount}","${d.payment_method || ''}","${d.transaction_id || ''}","${d.donation_type}","${d.donation_date}","${d.created_at}"`)];
    const blob = new Blob([rows.join('\\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'donors.csv';
    a.click();
    URL.revokeObjectURL(url);
    alert('Donor report downloaded successfully!');
  };

  const handleOpenAddDonor = () => {
    setNewDonorForm({
      full_name: '',
      gender: '',
      phone: '',
      email: '',
      donor_type: 'Individual',
      organization_name: '',
      amount: '',
      payment_method: 'UPI',
      transaction_id: '',
      donation_type: 'One-time',
      donation_date: new Date().toISOString().slice(0, 16),
    });
    setShowAddDonorModal(true);
  };

  const handleCancelAddDonor = () => {
    setShowAddDonorModal(false);
  };

  const validateDonorForm = (form) => {
    if (!form.full_name.trim()) return 'Full name is required';
    if (form.phone && !/^\d{10}$/.test(form.phone.replace(/[^0-9]/g, ''))) return 'Phone must be valid 10-digit number';
    if (!form.email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Invalid email format';
    if (form.gender && !['Male', 'Female', 'Other'].includes(form.gender)) return 'Select Male, Female, or Other';
    if (!form.donor_type) return 'Donor type is required';
    if (form.donor_type === 'Organization' && !form.organization_name.trim()) return 'Organization name is required';
    if (!form.amount || isNaN(form.amount) || parseFloat(form.amount) <= 0) return 'Valid positive amount is required';
    if (!form.payment_method) return 'Payment method is required';
    if (!form.transaction_id.trim()) return 'Transaction ID is required';
    if (!form.donation_type) return 'Donation type is required';
    if (!form.donation_date) return 'Donation date is required';
    return null;
  };


  const handleSubmitNewDonor = async (e) => {
    e.preventDefault();
    const error = validateDonorForm(newDonorForm);
    if (error) {
      alert('❌ ' + error);
      return;
    }

    setSubmittingDonor(true);
    try {
      const formData = {
        full_name: (newDonorForm.full_name || '').trim(),
        gender: (newDonorForm.gender || '').trim() || null,
        phone: (newDonorForm.phone || '').trim() || null,
        email: (newDonorForm.email || '').trim().toLowerCase(),
        donor_type: newDonorForm.donor_type,
        organization_name: (newDonorForm.organization_name || '').trim() || null,
        amount: parseFloat(newDonorForm.amount),
        payment_method: newDonorForm.payment_method,
        transaction_id: (newDonorForm.transaction_id || '').trim() || `TXN_${Date.now()}`,
        donation_type: newDonorForm.donation_type,
        donation_date: newDonorForm.donation_date ? new Date(newDonorForm.donation_date).toISOString() : new Date().toISOString(),
        created_at: new Date().toISOString()
      };


      const {  error } = await supabase
        .from('donor_details')
        .insert([formData])
        .select()
        .single();

      if (error) {
        console.error('[ADD DONOR] Supabase error:', error);
        console.error('[ADD DONOR] Error message:', error.message);
        console.error('[ADD DONOR] Error code:', error.code);
        console.error('[ADD DONOR] Error details:', error.details);
        alert('❌ Failed to add donor: ' + (error.message || error));
        return;
      }

      // Refresh donors list
      await fetchDonors();

      alert('✅ Donor added successfully!');
      setShowAddDonorModal(false);
    } catch (err) {
      console.error('Unexpected error:', err);
      alert('❌ An unexpected error occurred');
    } finally {
      setSubmittingDonor(false);
    }
  };

  const handleEditDonorFormChange = (e) => {
    const { name, value } = e.target;
    if (name === 'full_name') {
      const cleanedValue = value.replace(/[^a-zA-Z\s.'-]/g, '');
      setEditDonorForm(prev => ({ ...prev, [name]: cleanedValue }));
      return;
    }
    setEditDonorForm(prev => ({ ...prev, [name]: value }));
  };

  const handleEditPhoneChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
    setEditDonorForm(prev => ({ ...prev, phone: value }));
  };

  const handleDonorFormChange = (e) => {
    const { name, value } = e.target;
    // Allow only letters, spaces, and common name characters for full_name
    if (name === 'full_name') {
      const cleanedValue = value.replace(/[^a-zA-Z\s.'-]/g, '');
      setNewDonorForm(prev => ({ ...prev, [name]: cleanedValue }));
      return;
    }
    setNewDonorForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
    setNewDonorForm(prev => ({ ...prev, phone: value }));
  };

  const handleCancelEditDonor = () => {
    setShowEditDonorModal(false);
    setEditingDonor(null);
    setEditDonorForm({});
  };

  const handleSubmitEditDonor = async (e) => {
    e.preventDefault();
    const error = validateDonorForm(editDonorForm);
    if (error) {
      alert('❌ ' + error);
      return;
    }
    setSubmittingDonor(true);
    try {
      if (!editingDonor?.id) {
        alert('❌ Unable to update donor: missing donor identifier.');
        return;
      }
      const formData = {
        full_name: (editDonorForm.full_name || '').trim(),
        gender: (editDonorForm.gender || '').trim() || null,
        phone: (editDonorForm.phone || '').trim() || null,
        email: (editDonorForm.email || '').trim().toLowerCase(),
        donor_type: editDonorForm.donor_type,
        organization_name: (editDonorForm.organization_name || '').trim() || null,
        amount: parseFloat(editDonorForm.amount),
        payment_method: editDonorForm.payment_method,
        transaction_id: (editDonorForm.transaction_id || '').trim(),
        donation_type: editDonorForm.donation_type,
        donation_date: editDonorForm.donation_date ? new Date(editDonorForm.donation_date).toISOString() : new Date().toISOString()
      };
      const { data, error } = await supabase
        .from('donor_details')
        .update(formData)
        .eq('id', editingDonor.id)
        .select()
        .single();
      if (error) {
        console.error('[EDIT DONOR] Supabase update error:', error);
        console.error('[EDIT DONOR] Error message:', error.message);
        console.error('[EDIT DONOR] Error code:', error.code);
        console.error('[EDIT DONOR] Error details:', error.details);
        alert('❌ Update failed: ' + error.message);
        return;
      }
      await fetchDonors();
      alert('✅ Donor updated successfully!');
      setShowEditDonorModal(false);
      setEditingDonor(null);
      setEditDonorForm({});
    } catch (err) {
      console.error('[EDIT DONOR] Unexpected error:', err);
      console.error('[EDIT DONOR] Error message:', err.message);
      console.error('[EDIT DONOR] Error stack:', err.stack);
      alert('❌ Unexpected error: ' + (err.message || err));
    } finally {
      setSubmittingDonor(false);
    }
  };
  const handleSendReminders = () => {
    alert('Reminders sent (demo)');
  };

  const handleDownloadFeeReport = () => {
    const sourceRows = feeSectionTab === 'tracking'
      ? scopedFeeTrackingStudents.map((student) => {
          const record = getFeeTrackingRecord(student);
          const requiredFee = parseMoney(record?.total_educational_expenses ?? student.fee);
          const paidAmount = parseMoney(record?.fee_paid_by_tal);
          const balance = Math.max(requiredFee - paidAmount, 0);
          return {
            student_public_id: student.student_public_id || record?.student_public_id || '',
            student_name: student.student_name || student.full_name || student.name || record?.student_name || '',
            email: student.email || record?.email || '',
            rtotal_educational_expenses: requiredFee,
            paid_amount: paidAmount,
            balance,
            fee_status: record?.fee_status || 'Pending',
          };
        })
      : feeSectionTab === 'receipts'
        ? scopedFeeReceiptRecords.map((record) => {
            const requiredFee = parseMoney(record.total_educational_expenses);
            const paidAmount = parseMoney(record.fee_paid_by_tal);
            const balance = Math.max(requiredFee - paidAmount, 0);
            return {
              student_public_id: record.student_public_id || '',
              student_name: record.student_name || '',
              email: record.email || '',
              total_educational_expenses: requiredFee,
              paid_amount: paidAmount,
              balance,
              fee_status: record.fee_status || 'Pending',
            };
          })
        : scopedPaidFeeRecords.map((record) => {
            const requiredFee = parseMoney(record.total_educational_expenses);
            const paidAmount = parseMoney(record.fee_paid_by_tal);
            const balance = Math.max(requiredFee - paidAmount, 0);
            return {
              student_public_id: record.student_public_id || '',
              student_name: record.student_name || '',
              email: record.email || '',
              total_educational_expenses: requiredFee,
              paid_amount: paidAmount,
              balance,
              fee_status: record.fee_status || 'Pending',
            };
          });

    if (sourceRows.length === 0) {
      alert('No fee records available to export');
      return;
    }

    const rows = [
      'student_public_id,student_name,email,total_educational_expenses,paid_amount,balance,status',
      ...sourceRows.map((row) => `"${row.student_public_id}","${row.student_name}","${row.email}",${row.total_educational_expenses},${row.paid_amount},${row.balance},"${row.fee_status}"`),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fee-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateReport = () => {
    if (!selectedReportCampScope) {
      alert('Please select a camp name and camp date for the report scope.');
      return;
    }

    const scopedAllFeeRecords = [...scopedFeeTrackingStudents, ...scopedPaidFeeRecords];
    const totalFunds = donors.reduce((sum, donor) => sum + parseMoney(donor.amount), 0);
    const totalRequiredInScope = scopedAllFeeRecords.reduce(
      (sum, record) => sum + parseMoney(record.total_educational_expenses),
      0
    );
    const totalPaidInScope = scopedAllFeeRecords.reduce(
      (sum, record) => sum + parseMoney(record.fee_paid_by_tal),
      0
    );
    const totalBalanceInScope = Math.max(totalRequiredInScope - totalPaidInScope, 0);

    const rows = [
      ['Custom Report', ''],
      ['Generated At', new Date().toISOString()],
      ['Camp Name', selectedReportCampScope.campName],
      ['Camp Date', selectedReportCampScope.campDate],
      [],
      ['Summary', 'Value'],
      ['Total Donors', donors.length],
      ['Total Funds Raised', totalFunds],
      ['Eligible Students (Scoped)', scopedEligibleStudents.length],
      ['Non-Eligible Students (Scoped)', scopedNonEligibleStudents.length],
      ['Fee Receipts Verified (Scoped)', scopedFeeReceiptRecords.length],
      ['Fee Required (Scoped)', totalRequiredInScope],
      ['Fee Paid (Scoped)', totalPaidInScope],
      ['Fee Balance (Scoped)', totalBalanceInScope],
      [],
      ['Eligible Students', ''],
      ['student_public_id', 'student_name', 'email', 'contact', 'education', 'year', 'school', 'college', 'created_at'],
      ...scopedEligibleStudents.map((student) => [
        student.student_public_id || '',
        student.student_name || student.full_name || '',
        student.email || '',
        student.contact || '',
        student.education || student.course || '',
        student.year || student.class || '',
        student.school || '',
        student.college || '',
        student.created_at || '',
      ]),
      [],
      ['Non-Eligible Students', ''],
      ['student_public_id', 'student_name', 'email', 'contact', 'education', 'year', 'school', 'college', 'created_at'],
      ...scopedNonEligibleStudents.map((student) => [
        student.student_public_id || '',
        student.student_name || student.full_name || '',
        student.email || '',
        student.contact || '',
        student.education || student.course || '',
        student.year || student.class || '',
        student.school || '',
        student.college || '',
        student.created_at || '',
      ]),
      [],
      ['Fee Receipts (Verified)', ''],
      ['student_public_id', 'student_name', 'email', 'total_educational_expenses', 'fee_paid_by_tal', 'balance', 'voucher_uploaded_at'],
      ...scopedFeeReceiptRecords.map((record) => {
        const requiredFee = parseMoney(record.total_educational_expenses);
        const paidFee = parseMoney(record.fee_paid_by_tal);
        return [
          record.student_public_id || '',
          record.student_name || '',
          record.email || '',
          requiredFee,
          paidFee,
          Math.max(requiredFee - paidFee, 0),
          record.voucher_uploaded_at || '',
        ];
      }),
    ];

    const csvContent = rows
      .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
      .join('\n');

    const safeCampName = selectedReportCampScope.campName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-report-${safeCampName || 'camp'}-${selectedReportCampScope.campDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    alert('Custom report downloaded successfully!');
  };

  const handleDownloadFeeReceiptsReport = () => {
    if (!selectedReportCampScope) {
      alert('Please select a camp name and camp date for the report scope.');
      return;
    }

    if (scopedFeeReceiptRecords.length === 0) {
      alert(`No completed fee receipts found for ${selectedReportCampScope.campName} on ${selectedReportCampScope.campDate}`);
      return;
    }

    const rows = [
      'student_public_id,student_name,email,total_educational_expenses,paid_amount,balance,status,voucher_uploaded_at',
      ...scopedFeeReceiptRecords.map((record) => {
        const requiredFee = parseMoney(record.total_educational_expenses);
        const paidAmount = parseMoney(record.fee_paid_by_tal);
        const balance = Math.max(requiredFee - paidAmount, 0);
        return `"${record.student_public_id || ''}","${record.student_name || ''}","${record.email || ''}",${requiredFee},${paidAmount},${balance},"${record.fee_status || 'Pending'}","${record.voucher_uploaded_at || ''}"`;
      }),
    ];

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedReportCampScope.key === 'all'
      ? 'fee-receipts-report-all.csv'
      : 'fee-receipts-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDonorContributionsReport = () => {
    if (donors.length === 0) {
      alert('No donor data to export');
      return;
    }

    const rows = [
      'donor_id,donor_name,amount,donation_date,camp_name,email,contact',
      ...donors.map(d => 
        `"${d.id || ''}","${d.name || ''}",${d.amount || 0},"${d.donation_date || ''}","${d.camp_name || ''}","${d.email || ''}","${d.contact || ''}"`
      )
    ];

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedReportCampScope?.key === 'all'
      ? 'donor-contributions-report-all.csv'
      : 'donor-contributions-report.csv';
    a.click();
    URL.revokeObjectURL(url);
    alert('Donor contributions report downloaded successfully!');
  };

  const handleDownloadSpecificReport = (key) => {
    if (key === 'financial') {
      const totalFunds = donors.reduce((s, d) => s + parseMoney(d.amount), 0);
      const totalUsed = feeTrackingRecords.reduce((s, r) => s + parseMoney(r.fee_paid_by_tal), 0);
      const available = Math.max(totalFunds - totalUsed, 0);
      
      const rows = [
        'Financial Overview Report',
        `Generated on: ${new Date().toLocaleString('en-IN')}`,
        '',
        'Summary',
        `Total Funds Raised,\u20b9${totalFunds.toLocaleString()}`,
        `Total Used,\u20b9${totalUsed.toLocaleString()}`,
        `Total Available,\u20b9${available.toLocaleString()}`,
        `Utilization Rate,${totalFunds > 0 ? Math.round((totalUsed / totalFunds) * 100) : 0}%`,
        '',
        'Donors Count,' + donors.length,
        'Students Paid,' + feeTrackingRecords.filter(r => parseMoney(r.fee_paid_by_tal) > 0).length
      ];
      
      const csvContent = rows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financial-overview-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      alert('✅ Financial report downloaded!');
    }
  };

  const handleSaveSettings = async () => {
    try {
      // Update user metadata with the new admin name
      if (currentUser) {
        const { error } = await supabase.auth.updateUser({
          data: {
            name: adminName,
            contact_number: contactNumber,
            preferences: {
              email_notifications: emailNotifications,
              sms_alerts: smsAlerts,
              system_notifications: systemNotifications,
              default_language: "English",
              time_zone: "IST",
            }
          }
        });

        if (error) {
          console.error('Error updating user settings:', error);
          alert('Error saving settings: ' + error.message);
          return;
        }

        // Update the current user state with the new name
        const updatedUser = {
          ...currentUser,
          user_metadata: {
            ...currentUser.user_metadata,
            name: adminName
          }
        };
        setCurrentUser(updatedUser);

        alert('Settings saved successfully!');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings: ' + error.message);
    }
  };
/*
  // When opening edit modal, create a shallow copy so editing doesn't mutate state directly
  const openEditModal = (s) => {
    setEditStudent({ ...s });
  };
*/
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  // Handle creating notifications
  const handleCreateNotification = async (e) => {
    e.preventDefault();

    // Validation: require title
    if (!notificationTitle.trim()) {
      alert("Please enter a notification title.");
      return;
    }

    // Validation: require message
    if (!notificationMessage.trim()) {
      alert("Please enter a notification message.");
      return;
    }

    // Validation: require expiry unless it's an all-time notification
    if (!isAllTimeNotification && !notificationExpiresAt) {
      alert("Please select an expiry time or check 'All time notification'.");
      return;
    }

    setCreatingNotification(true);

    // Send IST string directly - Supabase will interpret as local time and store as timestamptz
    const expiresAtIST = isAllTimeNotification ? null : notificationExpiresAt + ':00';


    const result = await createNotification(
      notificationTitle,
      notificationMessage,
      notificationAudience,
      expiresAtIST
    );

    if (result.success) {
      alert("Notification created successfully!");
      // Reset form including new state
      setNotificationTitle("");
      setNotificationMessage("");
      setNotificationAudience("all");
      setNotificationExpiresAt("");
      setIsAllTimeNotification(false);
    } else {
      alert("Error creating notification: " + result.error);
    }

    setCreatingNotification(false);
  };


  // Filter Components
  const FilterCard = ({ title, icon, options, value, onChange }) => (
    <div className="filter-card" style={{ position: 'relative' }}>
      <div className="filter-icon">{icon}</div>
      <div className="filter-title">{title}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="filter-select"
      >
        {options.map((opt, idx) => {
          const optionValue = opt.value ?? opt;
          const optionLabel = opt.label ?? (optionValue === 'all' ? 'All' : optionValue.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()));
          return (
            <option key={idx} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </div>
  );

  const FilterToggle = ({ title, icon, checked, onChange }) => (
    <div className={`filter-card filter-toggle ${checked ? 'filter-active' : ''}`} onClick={() => onChange(!checked)}>
      <div className="filter-icon">{icon}</div>
      <div className="filter-title">{title}</div>
      <div className={`toggle-switch ${checked ? 'active' : ''}`}></div>
    </div>
  );

  return (

    <div className="admin-root">
     <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand">Touch A Life - Admin</div>
          <nav>
            <ul>
              <li className={activeSection === "overview" ? "active" : ""} onClick={() => setActiveSection("overview")}>Dashboard Overview</li>
              <li className={activeSection === "manage" ? "active" : ""} onClick={() => setActiveSection("manage")}>Manage Beneficiaries</li>
              <li className={activeSection === "noneligible" ? "active" : ""} onClick={() => setActiveSection("noneligible")}>Non-Eligible Students</li>
              <li className={activeSection === "mapping" ? "active" : ""} onClick={() => setActiveSection("mapping")}>Donor Details</li>
              <li className={activeSection === "verification" ? "active" : ""} onClick={() => setActiveSection("verification")}>Document Verification</li>
              <li className={activeSection === "fees" ? "active" : ""} onClick={() => setActiveSection("fees")}>Fee Tracking</li>
              <li className={activeSection === "broadcast" ? "active" : ""} onClick={() => setActiveSection("broadcast")}>Alerts & Broadcast</li>
              <li className={activeSection === "reports" ? "active" : ""} onClick={() => setActiveSection("reports")}>Reports & Exports</li>
              {/* <li className={activeSection === "settings" ? "active" : ""} onClick={() => setActiveSection("settings")}>Settings</li> */}
            </ul>
          </nav>
        </div>
        <button className="logout-btn" onClick={handleLogout}>Logout</button>
      </aside>
      {sidebarOpen && (
  <div
    className="sidebar-overlay"
    onClick={() => setSidebarOpen(false)}
  />
)}

      <div className="admin-main">
        <header className="admin-header">
  <div className="header-left">
    <button 
      className="menu-toggle"
      onClick={() => setSidebarOpen(!sidebarOpen)}
    >
      ☰
    </button>

    <h2>
      {activeSection === "overview" 
        ? "Dashboard Overview" 
        : activeSection === "manage" 
        ? "Manage Beneficiaries" 
        : activeSection === "noneligible"
        ? "Non-Eligible Students"
        : activeSection === "mapping" 
        ? "Donor Details" 
        : activeSection === "verification" 
        ? "Document Verification" 
        : activeSection === "fees" 
        ? "Fee Tracking" 
        : activeSection === "broadcast" 
        ? "Alerts & Broadcast" 
        : activeSection === "reports" 
        ? "Reports & Exports" 
        : "Settings"}
    </h2>
  </div>
        </header>

        <main className="admin-content">
          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              Loading dashboard...
             
            </div>
          )}

          {!loading && activeSection === "overview" && (
            <>
              {/* Overview cards */}
              <section className="cards-row">
                <div className="card">
                  <div className="card-icon student-icon">👥</div>
                  <div className="card-content">
                    <div className="card-title">Students Under Review</div>
                    <div className="card-value">{totals.totalStudents}</div>
                    <div className="card-trend positive">Live data</div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-icon money-icon">💰</div>
                  <div className="card-content">
                    <div className="card-title">Donation Collected</div>
                    <div className="card-value">₹{totals.feesCollected.toLocaleString('en-IN')}</div>
                    <div className="card-trend positive">Live data</div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-icon pending-icon">✅</div>
                  <div className="card-content">
                    <div className="card-title">Students with Fees Paid</div>
                    <div className="card-value">{verifiedFeeStudents.length}</div>
                    <div className="card-trend positive">Live data</div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-icon donor-icon">🤝</div>
                  <div className="card-content">
                    <div className="card-title">Active Donors</div>
                    <div className="card-value">{totals.activeDonors}</div>
                    <div className="card-trend positive">Live data</div>
                  </div>
                </div>
              </section>

              <section className="manage-section" style={{ marginTop: "1.5rem" }}>
                <div className="section-header" style={{ marginBottom: "1rem" }}>
                  <h3>Camp Master</h3>
                </div>

                <div className="manage-controls camp-master-controls" style={{ marginBottom: "1rem" }}>
                  <div className="form-group camp-master-form" style={{ width: "100%" }}>
                    <label className="camp-name-field">
                      <span className="field-label">Camp Name</span>
                      <input
                        type="text"
                        placeholder="Enter camp name"
                        value={newCampName}
                        onChange={(e) => setNewCampName(e.target.value)}
                      />
                    </label>
                    <label className="camp-date-field">
                      <span className="field-label">Camp Date</span>
                      <input
                        type="date"
                        value={newCampDate}
                        onChange={(e) => setNewCampDate(e.target.value)}
                      />
                    </label>
                    <label className="camp-extra-field">
                      <span className="field-label">Additional Camp Dates (optional)</span>
                      <textarea
                        placeholder="2025-10-12, 2026-03-11"
                        value={newCampExtraDates}
                        onChange={(e) => setNewCampExtraDates(e.target.value)}
                        rows={3}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn primary camp-add-btn"
                      onClick={handleAddCamp}
                      disabled={addingCamp}
                    >
                      {addingCamp ? "Adding..." : "Add Camp"}
                    </button>
                  </div>
                </div>

                {loadingCampOptions ? (
                  <div style={{ textAlign: "center", padding: "1rem", color: "#666" }}>
                    Loading camps...
                  </div>
                ) : campOptions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "1rem", color: "#666" }}>
                    No camps added yet.
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Camp Name</th>
                          <th>Camp Date</th>
                          <th>Created On</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campOptions.map((camp) => (
                          <tr key={camp.id}>
                            <td>{camp.camp_name || "—"}</td>
                            <td>{camp.camp_date ? new Date(camp.camp_date).toLocaleDateString("en-IN") : "—"}</td>
                            <td>{camp.created_at ? formatToIST(camp.created_at) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              
              {/*
              <section className="quick-stats">
                <div className="stat-card">
                  <h3>Recent Activity</h3>
                  <div className="activity-list">
                    <div className="activity-item">
                      <span className="activity-dot green"></span>
                      <div className="activity-content">
                        <div className="activity-text">New student registered</div>
                        <div className="activity-time">2 hours ago</div>
                      </div>
                    </div>
                    <div className="activity-item">
                      <span className="activity-dot blue"></span>
                      <div className="activity-content">
                        <div className="activity-text">Fees collected from 3 students</div>
                        <div className="activity-time">5 hours ago</div>
                      </div>
                    </div>
                    <div className="activity-item">
                      <span className="activity-dot orange"></span>
                      <div className="activity-content">
                        <div className="activity-text">New donor joined</div>
                        <div className="activity-time">1 day ago</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="stat-card">
                  <h3>Fee Status Distribution</h3>
                  <div className="status-grid">
                    <div className="status-item">
                      <div className="status-label">Paid</div>
                      <div className="status-bar">
                        <div className="status-fill green" style={{width: '65%'}}></div>
                      </div>
                      <div className="status-value">65%</div>
                    </div>
                    <div className="status-item">
                      <div className="status-label">Partial</div>
                      <div className="status-bar">
                        <div className="status-fill orange" style={{width: '20%'}}></div>
                      </div>
                      <div className="status-value">20%</div>
                    </div>
                    <div className="status-item">
                      <div className="status-label">Pending</div>
                      <div className="status-bar">
                        <div className="status-fill red" style={{width: '15%'}}></div>
                      </div>
                      <div className="status-value">15%</div>
                    </div>
                  </div>
                </div>

                <div className="stat-card">
                  <h3>Upcoming Deadlines</h3>
                  <div className="deadline-list">
                    <div className="deadline-item">
                      <div className="deadline-date">Nov 15</div>
                      <div className="deadline-content">
                        <div>Fee submission deadline</div>
                        <div className="deadline-count">8 students pending</div>
                      </div>
                    </div>
                    <div className="deadline-item">
                      <div className="deadline-date">Nov 20</div>
                      <div className="deadline-content">
                        <div>Document verification</div>
                        <div className="deadline-count">12 students pending</div>
                      </div>
                    </div>
                    <div className="deadline-item">
                      <div className="deadline-date">Nov 30</div>
                      <div className="deadline-content">
                        <div>Progress report submission</div>
                        <div className="deadline-count">15 reports due</div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              */}
            </>
          )} 

{/* Manage Beneficiaries */}
          {activeSection === "manage" && (
            <section className="manage-section">
<div className="manage-controls">

<div className="new-filters-grid">
                  <FilterCard 
                    title="Camp" 
                    icon="🏕️" 
                    options={uniqueCamps} 
                    value={newFilters.camp} 
                    onChange={(val) => setNewFilters(f => ({...f, camp: val}))} 
                  />
                  <FilterCard 
                    title="Education" 
                    icon="🎓" 
                    options={uniqueEducations} 
                    value={newFilters.education} 
                    onChange={(val) => setNewFilters(f => ({...f, education: val}))} 
                  />
                  <FilterToggle 
                    title="Toppers" 
                    icon="⭐" 
                    checked={newFilters.toppers} 
                    onChange={(val) => setNewFilters(f => ({...f, toppers: val}))} 
                  />
                  <FilterCard 
                    title="Achievements" 
                    icon="🏆" 
                    options={achievementsFilterOptions} 
                    value={newFilters.achievements} 
                    onChange={(val) => setNewFilters(f => ({...f, achievements: val}))} 
                  />
                  <FilterToggle 
                    title="Single Parent" 
                    icon="👨‍👩‍👧" 
                    checked={newFilters.singleParent} 
                    onChange={(val) => setNewFilters(f => ({...f, singleParent: val}))} 
                  />
                  <FilterToggle 
                    title="Special Remarks" 
                    icon="📝" 
                    checked={newFilters.specialRemarks} 
                    onChange={(val) => setNewFilters(f => ({...f, specialRemarks: val}))} 
                  />
                </div>

                <div className="manage-actions">
                  <button className="btn primary" onClick={exportCSV}>Export CSV</button>
                </div>
              </div>

{/* Search Bar - Above the table, plain colors */}
              <div className="search-bar-top" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem',
                background: '#f5f5f5',
                borderRadius: '8px',
                marginBottom: '1rem',
                border: '1px solid #ddd'
              }}>
                <span style={{ fontSize: '1.2rem' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '6px',
                    border: '1px solid #ccc',
                    fontSize: '0.95rem',
                    outline: 'none'
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      padding: '8px 16px',
                      background: '#666',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      fontWeight: '500',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    Clear
                  </button>
                )}
                <span style={{ color: '#333', fontWeight: 500, fontSize: '0.9rem' }}>
                  {filteredStudents.length} result{filteredStudents.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                      <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Education</th>
                      <th>Contact</th>
                              <th>CampName</th>
                              <th>Percentage</th> {/* Academic performance */}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
{filteredStudents.map(s => (
                      <tr key={s.id}>
                        <td dangerouslySetInnerHTML={{__html: highlightMatch(s.name || s.full_name || '', searchQuery)}}></td>
                        <td dangerouslySetInnerHTML={{__html: highlightMatch(s.email || '', searchQuery)}}></td>
                        <td>{s.course || '—'}</td>
                        <td className="nowrap-cell">{s.contact || '—'}</td>
                            <td>{s.campName || '—'}</td>
                            <td>{getAvgPercentage(s)}</td>
                        <td>
                          <div className="actions-flex" style={{justifyContent: 'center', gap: '6px'}}>
                            <div className="tooltip">
                              <button className="btn small icon-btn" onClick={() => setViewStudent(s)} style={{backgroundColor: '#e3f2fd', color: '#1976d2', borderColor: '#1976d2'}}>👁️</button>
                              <span className="tooltiptext">View</span>
                            </div>
                            <div className="tooltip">
                              <button className="btn small icon-btn" onClick={() => setEditStudent(s)} style={{backgroundColor: '#fff3e0', color: '#ef6c00', borderColor: '#ef6c00'}}>✏️</button>
                              <span className="tooltiptext">Edit</span>
                            </div>
                            <div className="tooltip">
                              <button className="btn small icon-btn" onClick={() => {
                                if (!window.confirm('Are you sure you want to approve this beneficiary?')) return;
                                handleApprove(s);
                              }} style={{backgroundColor: '#e8f5e8', color: '#2e7d32', borderColor: '#2e7d32'}}>✅</button>
                              <span className="tooltiptext">Approve</span>
                            </div>
                            <div className="tooltip">
                              <button className="btn small icon-btn" onClick={() => {
                                if (!window.confirm('Are you sure you want to reject this beneficiary?')) return;
                                handleNotApprove(s);
                              }} style={{backgroundColor: '#ffebee', color: '#c62828', borderColor: '#c62828'}}>❌</button>
                              <span className="tooltiptext">Not Approve</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
{/* Debug panel: show raw fetch when no students present to help diagnose Supabase issues */}
              {students.length === 0 && lastFetch && (
                <div className="debug-panel">
                  <h4>No more forms to Review</h4>
                </div>
              )}
            </section>
          )}

          {activeSection === "noneligible" && (
            <section className="manage-section">
              <div className="manage-controls">
<div className="new-filters-grid">
                  <FilterCard 
                    title="Camp" 
                    icon="🏕️" 
                    options={uniqueCamps} 
                    value={newFilters.camp} 
                    onChange={(val) => setNewFilters(f => ({...f, camp: val}))} 
                  />
                  <FilterCard 
                    title="Education" 
                    icon="🎓" 
                    options={['all', ...new Set([...nonEligibleStudents.map(s => s.education || s.course).filter(Boolean), ...nonEligibleStudents.map(s => s.class || s.year).filter(Boolean)])]} 
                    value={newFilters.education} 
                    onChange={(val) => setNewFilters(f => ({...f, education: val}))} 
                  />
                  <FilterToggle 
                    title="Toppers" 
                    icon="⭐" 
                    checked={newFilters.toppers} 
                    onChange={(val) => setNewFilters(f => ({...f, toppers: val}))} 
                  />
                  <FilterCard 
                    title="Achievements" 
                    icon="🏆" 
                    options={achievementsFilterOptions} 
                    value={newFilters.achievements} 
                    onChange={(val) => setNewFilters(f => ({...f, achievements: val}))} 
                  />
                  <FilterToggle 
                    title="Single Parent" 
                    icon="👨‍👩‍👧" 
                    checked={newFilters.singleParent} 
                    onChange={(val) => setNewFilters(f => ({...f, singleParent: val}))} 
                  />
                  <FilterToggle 
                    title="Special Remarks" 
                    icon="📝" 
                    checked={newFilters.specialRemarks} 
                    onChange={(val) => setNewFilters(f => ({...f, specialRemarks: val}))} 
                  />
                </div>

                <div className="manage-actions">
<button className="btn primary" onClick={() => fetchNonEligibleStudents()}>Refresh</button>
                  <button className="btn primary" onClick={handleDownloadNonEligibleReport}>Export CSV</button>
                </div>
              </div>

              <div className="search-bar-top" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem',
                background: '#f5f5f5',
                borderRadius: '8px',
                marginBottom: '1rem',
                border: '1px solid #ddd'
              }}>
                <span style={{ fontSize: '1.2rem' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search non-eligible students by name or email..."
                  value={nonEligibleSearchQuery}
                  onChange={(e) => setNonEligibleSearchQuery(e.target.value)}
                  className="search-input"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '6px',
                    border: '1px solid #ccc',
                    fontSize: '0.95rem',
                    outline: 'none'
                  }}
                />
                {nonEligibleSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setNonEligibleSearchQuery('')}
                    style={{
                      padding: '8px 16px',
                      background: '#666',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      fontWeight: '500',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    Clear
                  </button>
                )}
                <span style={{ color: '#333', fontWeight: 500, fontSize: '0.9rem' }}>
                  {filteredNonEligibleStudents.length} result{filteredNonEligibleStudents.length !== 1 ? 's' : ''}
                </span>
              </div>

              {loadingNonEligible ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                  Loading non-eligible students...
                </div>
              ) : nonEligibleStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: '#666' }}>
                  <h4>No non-eligible students found</h4>
                  <p>Students marked as not eligible will appear here.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>Email</th>
                        <th>School</th>
                        <th>Special Remarks</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNonEligibleStudents.map((student) => (
                        <tr key={student.student_id || student.id || student.email || Math.random()}>
                          <td dangerouslySetInnerHTML={{ __html: highlightMatch(student.student_name || student.full_name || student.name || '—', nonEligibleSearchQuery) }}></td>
                          <td dangerouslySetInnerHTML={{ __html: highlightMatch(student.email || '—', nonEligibleSearchQuery) }}></td>
                          <td>{student.school || '—'}</td>
                          <td>{student.special_remarks || '—'}</td>
                          <td>
                            <div className="actions-flex" style={{justifyContent: 'center', gap: '6px'}}>
                              <div className="tooltip">
                                <button className="btn small icon-btn" onClick={() => setViewNonEligibleStudent(student)} style={{backgroundColor: '#e3f2fd', color: '#1976d2', borderColor: '#1976d2'}}>👁️</button>
                                <span className="tooltiptext">View</span>
                              </div>
                              <div className="tooltip">
                                <button className="btn small icon-btn primary" onClick={() => {
                                  if (!window.confirm('Move to Eligible?')) return;
                                  handleMoveToEligible(student);
                                }} style={{backgroundColor: '#e8f5e8', color: '#2e7d32', borderColor: '#2e7d32'}}>✅</button>
                                <span className="tooltiptext">Move to Eligible</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Non-Eligible Student Detail Modal */}
              {viewNonEligibleStudent && (
                <div className="modal-overlay" onClick={() => setViewNonEligibleStudent(null)}>
                  <div className="modal" style={{maxWidth: '600px'}} onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                      <h3>Non-Eligible Student Details</h3>
                      <button className="close-btn" onClick={() => setViewNonEligibleStudent(null)}>×</button>
                    </div>
                    <div className="modal-body">
                      <div className="detail-grid">
                        <div className="detail-row">
                          <span className="label">Full Name:</span>
                          <span className="value">{viewNonEligibleStudent.student_name || viewNonEligibleStudent.full_name || '—'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Email:</span>
                          <span className="value">{viewNonEligibleStudent.email || '—'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Contact:</span>
                          <span className="value">{viewNonEligibleStudent.contact || viewNonEligibleStudent.whatsapp || '—'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Age:</span>
                          <span className="value">{viewNonEligibleStudent.age || '—'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Education:</span>
                          <span className="value">{viewNonEligibleStudent.education || viewNonEligibleStudent.class || viewNonEligibleStudent.year || '—'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">School/College:</span>
                          <span className="value">{viewNonEligibleStudent.school || viewNonEligibleStudent.college || '—'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Previous Percentage:</span>
                          <span className="value">{viewNonEligibleStudent.prev_percent || '—'}%</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Present Percentage:</span>
                          <span className="value">{viewNonEligibleStudent.present_percent || '—'}%</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Camp Name:</span>
                          <span className="value">{viewNonEligibleStudent.camp_name || viewNonEligibleStudent.campName || '—'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Camp Date:</span>
                          <span className="value">{viewNonEligibleStudent.camp_date ? new Date(viewNonEligibleStudent.camp_date).toLocaleDateString('en-IN') : '—'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Scholarship Status:</span>
                          <span className="value">{viewNonEligibleStudent.has_scholarship ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Does Work:</span>
                          <span className="value">{viewNonEligibleStudent.does_work ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Earning Members:</span>
                          <span className="value">{viewNonEligibleStudent.earning_members || '—'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Volunteer Name:</span>
                          <span className="value">{viewNonEligibleStudent.volunteer_name || '—'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Marked as Non-Eligible on:</span>
                          <span className="value">{viewNonEligibleStudent.created_at ? new Date(viewNonEligibleStudent.created_at).toLocaleDateString('en-IN') : '—'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Status:</span>
                          <span className="value" style={{color: '#d32f2f', fontWeight: 'bold'}}>Not Eligible</span>
                        </div>
                      </div>
                    </div>
                    <div className="modal-footer">
                        <button 
                          className="btn primary" 
                          onClick={() => {
                            if (!window.confirm('Are you sure you want to approve this beneficiary?')) return;
                            handleMoveToEligible(viewNonEligibleStudent);
                            setViewNonEligibleStudent(null);
                          }}
                        >
                          Approve & Move to Eligible
                        </button>
                      <button className="btn secondary" onClick={() => setViewNonEligibleStudent(null)}>Close</button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeSection === "mapping" && (
            <section className="donor-details-section">
              <div className="section-header">
                <h3>Donor Details</h3>
                <div className="section-actions">
                  <button className="btn primary" onClick={handleOpenAddDonor}>Add Donor</button>
                  <button className="btn primary" onClick={handleExportDonorReport}>Export Report</button>
                </div>
              </div>

              <div className="mapping-stats">
                <div className="stat-box">
                  <div className="value">₹{totalFundsAvailable.toLocaleString()}</div>
                  <div className="label">Total Funds Available</div>
                </div>
                <div className="stat-box">
                  <div className="value">{donors.length}</div>
                  <div className="label">Active Donors</div>
                </div>
                <div className="stat-box">
                  <div className="value">{fundUtilizationPercent}%</div>
                  <div className="label">Fund Utilization</div>
                </div>
              </div>

              {loadingDonors ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                  Loading donors...
                </div>
              ) : donors.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: '#666' }}>
                  <h4>No donors found</h4>
                  <p>Add your first donor using the button above.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Donor Type</th>
                        <th>Amount</th>
                        <th>Payment Method</th>
                        <th>Donation Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {donors.map(d => (
                        <tr key={d.id}>
                          <td>{d.full_name || d.name || '—'}</td>
                          <td>{d.email || '—'}</td>
                          <td>{d.phone || '—'}</td>
                          <td>{d.donor_type || '—'}</td>
                          <td>{d.formattedAmount}</td>
                          <td>{d.payment_method || '—'}</td>
                          <td>{d.formattedDate}</td>
                          <td>
                            <div style={{display: 'flex', gap: '6px'}}>
                              <button className="btn small outline" onClick={() => setViewDonor(d)} style={{minWidth: '36px'}}>View</button>
                              <button className="btn small primary" onClick={() => handleEditDonor(d)}>Edit</button>
                              <button className="btn small danger" onClick={() => handleDeleteDonor(d)}>Delete</button>
                            </div>
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

{showAddDonorModal && (
                <div className="modal-overlay" onClick={handleCancelAddDonor}>
<div className="modal donor-modal-wide" onClick={(e) => e.stopPropagation()}>
                    <h3>Add New Donor</h3>
                    <form className="donor-form-grid" onSubmit={handleSubmitNewDonor}>
                      <label>
                        Full Name *
                        <input 
                          name="full_name" 
                          value={newDonorForm.full_name} 
                          onChange={handleDonorFormChange}
                          required 
                        />
                      </label>

                      <label>
                        Gender
                        <select name="gender" value={newDonorForm.gender} onChange={handleDonorFormChange}>
                          <option value="">Select Gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </label>
                      <label>
                        Phone
                        <input 
                          type="tel" 
                          name="phone" 
                          value={newDonorForm.phone} 
                          onChange={handlePhoneChange} 
                          maxLength={10}
                          placeholder="Enter 10-digit phone number"
                        />
                      </label>
                      <label>
                        Email *
                        <input 
                          type="email" 
                          name="email" 
                          value={newDonorForm.email} 
                          onChange={handleDonorFormChange}
                          required 
                        />
                      </label>

                      <label>
                        Donor Type *
                        <select name="donor_type" value={newDonorForm.donor_type} onChange={handleDonorFormChange} required>
                          <option value="Individual">Individual</option>
                          <option value="Organization">Organization</option>
                        </select>
                      </label>
                      {newDonorForm.donor_type === 'Organization' && (
                        <label>
                          Organization Name
                          <input 
                            name="organization_name" 
                            value={newDonorForm.organization_name} 
                            onChange={handleDonorFormChange} 
                          />
                        </label>
                      )}
                      <label>
                        Donation Amount *
                        <input 
                          type="number" 
                          name="amount" 
                          value={newDonorForm.amount} 
                          onChange={handleDonorFormChange}
                          min="1" 
                          required 
                        />

                      </label>
                      <label>
                        Payment Method *

                        <select name="payment_method" value={newDonorForm.payment_method} onChange={handleDonorFormChange} required>
                          <option value="UPI">UPI</option>
                          <option value="Net Banking">Net Banking</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Cash">Cash</option>
                          <option value="Card">Card</option>
                        </select>

                      </label>
                      <label>
                        Transaction ID
                        <input name="transaction_id" value={newDonorForm.transaction_id} onChange={handleDonorFormChange} />
                      </label>
                      <label>
                        Donation Type *
                        <select name="donation_type" value={newDonorForm.donation_type} onChange={handleDonorFormChange} required>
                          <option value="One-time">One-time</option>
                          <option value="Monthly">Monthly</option>
                          <option value="Yearly">Yearly</option>
                        </select>
                      </label>
                      <label>
                        Donation Date *
                        <input 
                          type="datetime-local" 
                          name="donation_date" 
                          value={newDonorForm.donation_date} 
                          onChange={handleDonorFormChange}
                          required 
                        />
                      </label>
<div style={{display: 'flex', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb'}}>
                        <button type="submit" className="btn primary" disabled={submittingDonor} style={{flex: 1}}>
                          {submittingDonor ? 'Adding...' : 'Add Donor'}
                        </button>
                        <button type="button" className="btn secondary" onClick={handleCancelAddDonor} disabled={submittingDonor}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
              {showEditDonorModal && editingDonor && (
                <div className="modal-overlay" onClick={handleCancelEditDonor}>
                  <div className="modal donor-modal-wide" onClick={(e) => e.stopPropagation()}>
                    <h3>Edit Donor - {editingDonor.full_name}</h3>
                    <form className="donor-form-grid" onSubmit={handleSubmitEditDonor}>
                      <label>
                        Full Name *
                        <input 
                          name="full_name" 
                          value={editDonorForm.full_name || ''} 
                          onChange={handleEditDonorFormChange}
                          required 
                        />
                      </label>

                      <label>
                        Gender
                        <select name="gender" value={editDonorForm.gender || ''} onChange={handleEditDonorFormChange}>
                          <option value="">Select Gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </label>
                      <label>
                        Phone
                        <input 
                          type="tel" 
                          name="phone" 
                          value={editDonorForm.phone || ''} 
                          onChange={handleEditPhoneChange} 
                          maxLength={10}
                          placeholder="Enter 10-digit phone number"
                        />
                      </label>
                      <label>
                        Email *
                        <input 
                          type="email" 
                          name="email" 
                          value={editDonorForm.email || ''} 
                          onChange={handleEditDonorFormChange}
                          required 
                        />
                      </label>

                      <label>
                        Donor Type *
                        <select name="donor_type" value={editDonorForm.donor_type || 'Individual'} onChange={handleEditDonorFormChange} required>
                          <option value="Individual">Individual</option>
                          <option value="Organization">Organization</option>
                        </select>
                      </label>
                      {editDonorForm.donor_type === 'Organization' && (
                        <label>
                          Organization Name
                          <input 
                            name="organization_name" 
                            value={editDonorForm.organization_name || ''} 
                            onChange={handleEditDonorFormChange} 
                          />
                        </label>
                      )}
                      <label>
                        Donation Amount *
                        <input 
                          type="number" 
                          name="amount" 
                          value={editDonorForm.amount || ''} 
                          onChange={handleEditDonorFormChange}
                          min="1" 
                          required 
                        />
                      </label>
                      <label>
                        Payment Method *
                        <select name="payment_method" value={editDonorForm.payment_method || ''} onChange={handleEditDonorFormChange} required>
                          <option value="UPI">UPI</option>
                          <option value="Net Banking">Net Banking</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Cash">Cash</option>
                          <option value="Card">Card</option>
                        </select>
                      </label>
                      <label>
                        Transaction ID *
                        <input 
                          name="transaction_id" 
                          value={editDonorForm.transaction_id || ''} 
                          onChange={handleEditDonorFormChange}
                          required 
                        />
                      </label>
                      <label>
                        Donation Type *
                        <select name="donation_type" value={editDonorForm.donation_type || ''} onChange={handleEditDonorFormChange} required>
                          <option value="One-time">One-time</option>
                          <option value="Monthly">Monthly</option>
                          <option value="Yearly">Yearly</option>
                        </select>
                      </label>
                      <label>
                        Donation Date *
                        <input 
                          type="datetime-local" 
                          name="donation_date" 
                          value={editDonorForm.donation_date || ''} 
                          onChange={handleEditDonorFormChange}
                          required 
                        />
                      </label>
                      <div style={{display: 'flex', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb'}}>
                        <button type="submit" className="btn primary" disabled={submittingDonor} style={{flex: 1}}>
                          {submittingDonor ? 'Updating...' : 'Update Donor'}
                        </button>
                        <button type="button" className="btn secondary" onClick={handleCancelEditDonor} disabled={submittingDonor}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeSection === "verification" && (
            <section className="verification-section">
              <div className="section-header">
                <h3>Document Verification</h3>
                <div className="section-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    className="filter-select"
                    value={documentVerificationCampFilter}
                    onChange={(e) => setDocumentVerificationCampFilter(e.target.value)}
                    style={{ minWidth: '200px' }}
                  >
                    {documentVerificationCampOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={documentVerificationSearchQuery}
                    onChange={(e) => setDocumentVerificationSearchQuery(e.target.value)}
                    className="search-input"
                    style={{ flex: 1, minWidth: '220px', padding: '10px 14px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '0.95rem' }}
                  />
                  {documentVerificationSearchQuery && (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setDocumentVerificationSearchQuery('')}
                    >
                      Clear
                    </button>
                  )}
                  <button className="btn primary" onClick={() => {
                    setLoadingEligible(true);
                    fetchEligibleStudents().then(() => setLoadingEligible(false));
                  }}>Refresh Documents</button>
                </div>
              </div>

              {loadingEligible ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                  Loading documents...
                </div>
              ) : filteredEligibleStudentsForVerification.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: '#666' }}>
                  <h4>No Documents Found</h4>
                  <p>
                    {documentVerificationSearchQuery
                      ? `No eligible students found matching "${documentVerificationSearchQuery}".`
                      : documentVerificationCampFilter === 'all'
                        ? 'No eligible students found.'
                        : 'No eligible students found for the selected camp.'}
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>Email</th>
                        <th>Class</th>
                        <th>Education Documents</th>
                        <th>Personal Documents</th>
                        <th>Achievements Documents</th>
                        <th>Last Fee Paid Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEligibleStudentsForVerification.map((student) => {
                        const feeRecord = getFeeTrackingRecord(student);
                        const lastFeePaidDate = feeRecord?.fee_paid_by_tal > 0
                          ? feeRecord?.updated_at || feeRecord?.created_at
                          : null;

                        return (
                          <tr key={student.id}>
                            <td dangerouslySetInnerHTML={{ __html: highlightMatch(student.student_name || student.full_name || '—', documentVerificationSearchQuery) }}></td>
                            <td dangerouslySetInnerHTML={{ __html: highlightMatch(student.email || '—', documentVerificationSearchQuery) }}></td>
                            <td>{student.class || student.year || student.course || '—'}</td>
                            <td>
                              <span
                                className="doc-badge"
                                style={{ backgroundColor: '#e3f2fd', color: '#1976d2', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', cursor: student.academic_count > 0 ? 'pointer' : 'default', opacity: student.academic_count > 0 ? 1 : 0.6 }}
                                onClick={() => student.academic_count > 0 && handleViewDocuments(student, 'academic')}
                              >
                                {student.academic_count || 0} files
                              </span>
                            </td>
                            <td>
                              <span
                                className="doc-badge"
                                style={{ backgroundColor: '#f3e5f5', color: '#7b1fa2', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', cursor: student.personal_count > 0 ? 'pointer' : 'default', opacity: student.personal_count > 0 ? 1 : 0.6 }}
                                onClick={() => student.personal_count > 0 && handleViewDocuments(student, 'personal')}
                              >
                                {student.personal_count || 0} files
                              </span>
                            </td>
                            <td>
                              <span
                                className="doc-badge"
                                style={{ backgroundColor: '#fff3e0', color: '#e65100', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', cursor: student.extracurricular_count > 0 ? 'pointer' : 'default', opacity: student.extracurricular_count > 0 ? 1 : 0.6 }}
                                onClick={() => student.extracurricular_count > 0 && handleViewDocuments(student, 'extracurricular')}
                              >
                                {student.extracurricular_count || 0} files
                              </span>
                            </td>
                            <td>
                              {lastFeePaidDate ? (
                                <div style={{ fontSize: '12px' }}>
                                  <div style={{ fontWeight: '600', color: '#16a34a' }}>
                                    {new Date(lastFeePaidDate).toLocaleDateString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric'
                                    })}
                                  </div>
                                  <div style={{ color: '#6b7280', fontSize: '11px' }}>
                                    {new Date(lastFeePaidDate).toLocaleTimeString('en-IN', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: '#9ca3af', fontSize: '12px' }}>No fee paid</span>
                              )}
                            </td>
                            <td className="actions-flex">
                              <button
                                className="btn small icon-only view-btn"
                                aria-label="View documents"
                                onClick={() => setViewEligibleStudent(student)}
                              >
                                👁
                              </button>
                              <button
                                className={`btn small icon-only verify-btn ${student.doc_verification_count > 0 ? 'verified' : ''}`}
                                aria-label={student.doc_verification_count > 0 ? 'Approved' : 'Mark Approved'}
                                disabled={student.document_count === 0 || student.doc_verification_count > 0}
                                onClick={() => handleVerifyStudentDocuments(student)}
                              >
                                ✅
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeSection === "fees" && (
            <section className="fees-section">
              <div className="section-header">
                <h3>Fee Tracking</h3>
                <div className="section-actions">
                  <button className="btn" onClick={handleDownloadFeeReport}>Download Report</button>
                </div>
              </div>

              <div className="fee-tabs" style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <button
                  className={`btn ${feeSectionTab === 'tracking' ? 'primary' : ''}`}
                  onClick={() => setFeeSectionTab('tracking')}
                >
                  Fee Tracking
                </button>
                <button
                  className={`btn ${feeSectionTab === 'voucher' ? 'primary' : ''}`}
                  onClick={() => setFeeSectionTab('voucher')}
                >
                  Voucher Uploading
                </button>
                <button
                  className={`btn ${feeSectionTab === 'receipts' ? 'primary' : ''}`}
                  onClick={() => setFeeSectionTab('receipts')}
                >
                  Fee Receipts
                </button>
              </div>

              <div className="fee-summary">
                <div className="fee-card">
                  <div className="amount">{verifiedFeeStudents.length}</div>
                  <div className="label">Students whose Fee is paid</div>
                </div>
                <div className="fee-card">
                  <div className="amount">₹{totalFeeDue.toLocaleString()}</div>
                  <div className="label">Total Fee Due</div>
                </div>
                <div className="fee-card">
                  <div className="amount">{paidFeeRecords.length}</div>
                  <div className="label">Students who uploaded Fee Receipt</div>
                </div>
              </div>

              {loadingFeeTracking && (
                <div style={{ textAlign: 'center', padding: '1rem', color: '#555' }}>
                  Loading fee records...
                </div>
              )}

              {feeSectionTab === 'tracking' ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>Required Fee</th>
                        <th>Paid Amount</th>
                        <th>Balance</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feeTrackingStudents.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '1rem' }}>
                            No students are pending fee tracking.
                          </td>
                        </tr>
                      ) : feeTrackingStudents.map((student) => {
                        const studentFormId = student.student_form_id || student.student_id || student.id;
                        const record = getFeeTrackingRecord(student);
                        const currentPaid = feePaidInput[studentFormId] ?? (record?.fee_paid_by_tal ?? '');
                        const requiredFee = parseMoney(record?.total_educational_expenses ?? student.fee);
                        const paidAmount = parseMoney(record?.fee_paid_by_tal);
                        const balance = Math.max(requiredFee - paidAmount, 0);
                        const status = record?.fee_status || 'Pending';
                        return (
                          <tr key={studentFormId || student.id}>
                            <td>{student.student_name || student.full_name || student.name || '—'}</td>
                            <td>{requiredFee > 0 ? `₹${requiredFee.toLocaleString()}` : '—'}</td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                placeholder="Enter paid amount"
                                value={currentPaid}
                                onChange={(e) => handleFeePaidChange(studentFormId, e.target.value)}
                                style={{ width: '100px', padding: '6px', borderRadius: '6px', border: '1px solid #ccc' }}
                              />
                            </td>
                            <td>₹{balance.toLocaleString()}</td>
                            <td>
                              <span className={`status-badge ${status.toLowerCase()}`}>
                                {status}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  className="btn small"
                                  onClick={() => setViewingFeeStudent(student)}
                                >
                                  View
                                </button>
                                <button
                                  className="btn small primary"
                                  onClick={() => handleSaveFeeRecord(student)}
                                  disabled={savingFeeRecord}
                                >
                                  {savingFeeRecord ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : feeSectionTab === 'voucher' ? (
                <div className="table-wrap">
                  {voucherNoUploadRecords.length === 0 ? (
                    <p style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                      No fee records pending voucher upload. All vouchers are uploaded and visible in Fee Receipts.
                    </p>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Student Name</th>
                          <th>Email</th>
                          <th>Required Fee</th>
                          <th>Paid Amount</th>
                          <th>Status</th>
                          <th>Voucher</th>
                        </tr>
                      </thead>
                      <tbody>
                        {voucherNoUploadRecords.map((record, index) => {
                          const requiredFee = parseMoney(record.total_educational_expenses);
                          const paidAmount = parseMoney(record.fee_paid_by_tal);
                          return (
                            <tr key={record.id || record.student_form_id || index}>
                              <td>{record.student_name || '—'}</td>
                              <td>{record.email || '—'}</td>
                              <td>₹{requiredFee.toLocaleString()}</td>
                              <td>₹{paidAmount.toLocaleString()}</td>
                              <td>
                                <span className={`status-badge ${record.fee_status?.toLowerCase() || 'pending'}`}>
                                  {record.fee_status || 'Pending'}
                                </span>
                              </td>
                              <td>
                                {record.voucher_url ? (
                                  <a href={record.voucher_url} target="_blank" rel="noreferrer">View Voucher</a>
                                ) : (
                                  <label className="btn small" style={{ cursor: 'pointer' }}>
                                    {uploadingVoucherFor === record.student_form_id ? 'Uploading...' : 'Upload'}
                                    <input
                                      type="file"
                                      accept="application/pdf,image/*"
                                      style={{ display: 'none' }}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          handleUploadVoucher(record, file);
                                        }
                                        e.target.value = null;
                                      }}
                                    />
                                  </label>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
             // ) : feeSectionTab === 'receipts' ? (
              ) : feeSectionTab === 'receipts' ? (
                <div className="table-wrap">
                  {/* Fee Receipt Sub-Tabs */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e5e7eb', paddingBottom: '10px', flexWrap: 'wrap' }}>
                    <button
                      className={`btn ${feeReceiptSubTab === 'pending_receipts' ? 'primary' : ''}`}
                      onClick={() => setFeeReceiptSubTab('pending_receipts')}
                      style={{ fontWeight: feeReceiptSubTab === 'pending_receipts' ? 'bold' : 'normal' }}
                    >
                      📤 Pending Fee Receipts ({voucherUploadedNoReceiptRecords.length})
                    </button>
                    <button
                      className={`btn ${feeReceiptSubTab === 'pending' ? 'primary' : ''}`}
                      onClick={() => setFeeReceiptSubTab('pending')}
                      style={{ fontWeight: feeReceiptSubTab === 'pending' ? 'bold' : 'normal' }}
                    >
                      ⏳ Pending Verification ({studentFeeReceipts.length})
                    </button>
                    <button
                      className={`btn ${feeReceiptSubTab === 'verified' ? 'primary' : ''}`}
                      onClick={() => setFeeReceiptSubTab('verified')}
                      style={{ fontWeight: feeReceiptSubTab === 'verified' ? 'bold' : 'normal' }}
                    >
                      ✅ Verified Receipts ({feeReceiptRecords.length})
                    </button>
                  </div>

                  {/* Pending Fee Receipts (Voucher Uploaded, No Receipt) Tab */}
                  {feeReceiptSubTab === 'pending_receipts' && (
                    <div>
                      <h4>Students with Voucher Uploaded - Awaiting Fee Receipt Upload</h4>
                      {voucherUploadedNoReceiptRecords.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>No students with pending fee receipts. All vouchers have receipts or none are uploaded.</p>
                      ) : (
                        <table className="data-table">
                          <thead>
                            <tr>
                              
                              <th>Student Name</th>
                              <th>Email</th>
                              <th>Required Fee</th>
                              <th>Paid by TAL</th>
                              <th>Voucher</th>
                              <th>Voucher Uploaded At</th>
                              <th>Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {voucherUploadedNoReceiptRecords.map((record) => {
                              const requiredFee = parseMoney(record.total_educational_expenses || 0);
                              const paidAmount = parseMoney(record.fee_paid_by_tal || 0);
                              return (
                                <tr key={record.id}>
                                  
                                  <td>{record.student_name || '—'}</td>
                                  <td>{record.email || '—'}</td>
                                  <td>₹{requiredFee.toLocaleString()}</td>
                                  <td>₹{paidAmount.toLocaleString()}</td>
                                  <td>
                                    {record.voucher_url ? (
                                      <a href={record.voucher_url} target="_blank" rel="noreferrer" className="btn small">View Voucher</a>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td>{formatToIST(record.voucher_uploaded_at)}</td>
                                  <td>
                                    <button
                                      className="btn small"
                                      onClick={() => setViewingReceiptRecord(record)}
                                    >
                                    Details
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* Pending Fee Receipts Tab (For Verification) */}
                  {feeReceiptSubTab === 'pending' && (
                    <div>
                      <h4>Student Fee Receipts for Admin Verification</h4>
                      {loadingStudentReceipts ? (
                        <p>Loading student receipts...</p>
                      ) : studentFeeReceipts.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>No unverified student fee receipts.</p>
                      ) : (
                        <table className="data-table">
                          <thead>
                            <tr>
                              
                              <th>Student Name</th>
                              <th>Email</th>
                              <th>Required Fee</th>
                              <th>Paid by TAL</th>
                              <th>Fee Receipt</th>
                              <th>Uploaded At</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentFeeReceipts.map((receipt) => {
                              const requiredFee = parseMoney(receipt.total_educational_expenses || 0);
                              const paidAmount = parseMoney(receipt.fee_paid_by_tal || 0);
                              return (
                                <tr key={receipt.id}>
                                  
                                  <td>{receipt.student_name || '—'}</td>
                                  <td>{receipt.email || '—'}</td>
                                  <td>₹{requiredFee.toLocaleString()}</td>
                                  <td>₹{paidAmount.toLocaleString()}</td>
                                  <td>
                                    {receipt.fee_receipt_url ? (
                                      <a href={receipt.fee_receipt_url} target="_blank" rel="noreferrer" className="btn small">View Receipt</a>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td>{formatToIST(receipt.fee_receipt_url_updated_at)}</td>
                                  <td>
                                    <button 
                                      className="btn small primary" 
                                      onClick={() => handleVerifyFeeReceipt(receipt)}
                                    >
                                      ✅ Verify
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* Verified Fee Receipts Tab */}
                  {feeReceiptSubTab === 'verified' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4>Verified Fee Receipts</h4>
                        <button 
                          className="btn primary" 
                          onClick={handleDownloadFeeReceiptsReport}
                          disabled={feeReceiptRecords.length === 0}
                        >
                          📥 Export CSV
                        </button>
                      </div>
                      {feeReceiptRecords.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
                          No verified fee receipts found.
                        </p>
                      ) : (
                        <table className="data-table">
                          <thead>
                            <tr>
                          
                              <th>Student Name</th>
                              <th>Email</th>
                              <th>Required Fee</th>
                              <th>Paid</th>
                              <th>Status</th>
                              <th>Voucher</th>
                              <th>Fee Receipt</th>
                              <th>Verified At</th>
                            </tr>
                          </thead>
                          <tbody>
                            {feeReceiptRecords.map((record) => {
                              const requiredFee = parseMoney(record.total_educational_expenses || 0);
                              const paidAmount = parseMoney(record.fee_paid_by_tal || 0);
                              return (
                                <tr key={record.id}>
                          
                                  <td>{record.student_name || '—'}</td>
                                  <td>{record.email || '—'}</td>
                                  <td>₹{requiredFee.toLocaleString()}</td>
                                  <td>₹{paidAmount.toLocaleString()}</td>
                                  <td>
                                    <span className={`status-badge ${record.fee_status?.toLowerCase() || 'pending'}`}>
                                      {record.fee_status || 'Pending'}
                                    </span>
                                  </td>
                                  <td>
                                    {record.voucher_url ? (
                                      <a href={record.voucher_url} target="_blank" rel="noreferrer" className="btn small">View</a>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td>
                                    {record.fee_receipt_url ? (
                                      <a href={record.fee_receipt_url} target="_blank" rel="noreferrer" className="btn small">View</a>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td>{formatToIST(record.fee_receipt_url_updated_at)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>Email</th>
                        <th>Required Fee</th>
                        <th>Paid Amount</th>
                        <th>Voucher</th>
                        <th>Uploaded At</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feeReceiptRecords.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '1rem' }}>
                            No completed fee receipts found yet.
                          </td>
                        </tr>
                      ) : feeReceiptRecords.map((record, index) => {
                        const requiredFee = parseMoney(record.total_educational_expenses);
                        const paidAmount = parseMoney(record.fee_paid_by_tal);
                        return (
                          <tr key={record.id || record.student_form_id}>
                            <td>{record.student_name || '—'}</td>
                            <td>{record.email || '—'}</td>
                            <td>₹{requiredFee.toLocaleString()}</td>
                            <td>₹{paidAmount.toLocaleString()}</td>
                            <td>
                              {record.voucher_url ? (
                                <a href={record.voucher_url} target="_blank" rel="noreferrer">View Voucher</a>
                              ) : (
                                'Not uploaded'
                              )}
                            </td>
                            <td>{record.voucher_uploaded_at ? formatToIST(record.voucher_uploaded_at) : '—'}</td>
                            <td>
                              <span className={`status-badge ${record.fee_status?.toLowerCase() || 'pending'}`}>
                                {record.fee_status || 'Pending'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Fee Student Details Modal */}
          {viewingFeeStudent && (
            <div className="modal-overlay" onClick={() => setViewingFeeStudent(null)}>
              <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Student Fee Details</h3>
                  <button className="close-btn" onClick={() => setViewingFeeStudent(null)}>×</button>
                </div>
                <div className="modal-body">
                  {(() => {
                    const student = viewingFeeStudent;
                    const fullData = completeFeeStudentData || {};
                    const record = getFeeTrackingRecord(student);
                    const paidAmount = parseMoney(record?.fee_paid_by_tal);
                    const requiredFee = parseMoney(record?.total_educational_expenses ?? student.fee);
                    const balance = requiredFee - paidAmount;
                    const status = record?.fee_status || 'Pending';

                    // Use fullData (from student_form_submissions) for complete details
                    const displayName = fullData.full_name || student.student_name || student.full_name || student.name || record?.student_name || '—';
                    const displayEmail = fullData.email || student.email || '—';
                    const displayContact = fullData.contact || student.contact || student.student_contact || '—';
                    const displayParentContact = fullData.parent_contact_2 || '—';
                    const displayWhatsapp = fullData.whatsapp || student.whatsapp || '—';
                    const displayStudentContact = fullData.student_contact || '—';
                    const displayAddress = fullData.address || '—';
                    const displayAge = fullData.age || student.age || '—';
                    const displayEducation = fullData.educationcategory || student.educationcategory || student.course || '—';
                    const displayBranch = fullData.branch || student.branch || '—';
                    const displayClass = fullData.class || student.year || student.class || '—';
                    const displaySchool = fullData.school || student.school || '—';
                    const displayPrevPercent = fullData.prev_percent || student.prev_percent || '—';
                    const displayPresentPercent = fullData.present_percent || student.present_percent || '—';

                    return (
                      <div className="student-details-grid">
                        <div className="detail-section">
                          <h4>Personal Information</h4>
                          <div className="detail-row">
                            <span className="label">Student ID:</span>
                            <span className="value">{fullData.student_public_id || student.student_public_id || '—'}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Full Name:</span>
                            <span className="value">{displayName}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Email:</span>
                            <span className="value">{displayEmail}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Contact:</span>
                            <span className="value">{displayContact}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Parent Contact 2:</span>
                            <span className="value">{displayParentContact}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">WhatsApp:</span>
                            <span className="value">{displayWhatsapp}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Student Contact:</span>
                            <span className="value">{displayStudentContact}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Address:</span>
                            <span className="value">{displayAddress}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Age:</span>
                            <span className="value">{displayAge}</span>
                          </div>
                        </div>

                        <div className="detail-section">
                          <h4>Educational Information</h4>
                          <div className="detail-row">
                            <span className="label">Education:</span>
                            <span className="value">{displayEducation}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Branch:</span>
                            <span className="value">{displayBranch}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Year/Class:</span>
                            <span className="value">{displayClass}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">School:</span>
                            <span className="value">{displaySchool}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Previous Year %:</span>
                            <span className="value">{displayPrevPercent !== '—' ? `${displayPrevPercent}%` : '—'}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Current Year %:</span>
                            <span className="value">{displayPresentPercent !== '—' ? `${displayPresentPercent}%` : '—'}</span>
                          </div>
                        </div>

                        <div className="detail-section">
                          <h4>Financial Information</h4>
                          <div className="detail-row">
                            <span className="label">Required Fee:</span>
                            <span className="value">{requiredFee > 0 ? `₹${requiredFee.toLocaleString()}` : '—'}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Paid by TAL:</span>
                            <span className="value">₹{paidAmount.toLocaleString()}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Balance:</span>
                            <span className="value">₹{Math.max(balance, 0).toLocaleString()}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Fee Status:</span>
                            <span className={`value status-badge ${status.toLowerCase()}`}>{status}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Voucher:</span>
                            <span className="value">
                              {record?.voucher_url ? (
                                <a href={record.voucher_url} target="_blank" rel="noreferrer">View Voucher</a>
                              ) : (
                                'Not uploaded'
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="detail-section">
                          <h4>Family & Scholarship Information</h4>
                          <div className="detail-row">
                            <span className="label">Scholarship:</span>
                            <span className="value">{student.scholarship || '—'}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Has Scholarship:</span>
                            <span className="value">{student.has_scholarship ? 'Yes' : 'No'}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Does Work:</span>
                            <span className="value">{student.does_work ? 'Yes' : 'No'}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Earning Members:</span>
                            <span className="value">{student.earning_members || '—'}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Academic Achievements:</span>
                            <span className="value">{student.academic_achievements_choice || student.academic_achievements || '—'}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Non-Academic Achievements:</span>
                            <span className="value">{student.non_academic_achievements_choice || student.non_academic_achievements || '—'}</span>
                          </div>
                        </div>

                        <div className="detail-section">
                          <h4>Camp Information</h4>
                          <div className="detail-row">
                            <span className="label">Camp Name:</span>
                            <span className="value">{student.camp_name || '—'}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Camp Date:</span>
                            <span className="value">{student.camp_date ? new Date(student.camp_date).toLocaleDateString() : '—'}</span>
                          </div>
                        </div>

                        <div className="detail-section">
                          <h4>Timestamps</h4>
                          <div className="detail-row">
                            <span className="label">Created:</span>
                            <span className="value">{student.created_at ? formatToIST(student.created_at) : '—'}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Fee Record Updated:</span>
                            <span className="value">{record?.updated_at ? formatToIST(record.updated_at) : '—'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="modal-footer">
                  <button className="btn" onClick={() => setViewingFeeStudent(null)}>Close</button>
                </div>
              </div>
            </div>
          )}

          {/* Broadcast */} 
          {activeSection === "broadcast" && (
            <section className="broadcast-section">
              <div className="section-header">
                <h3>Create Notification</h3>
                <div className="section-actions">
                  <button className="btn primary" onClick={handleToggleNotificationsList}>
                    {showNotificationsList ? 'Hide List' : 'View All Notifications'}
                  </button>
                </div>
              </div>

              {showNotificationsList && (
                <div className="notifications-list" style={{marginBottom: '2rem', background: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 12px rgba(20,24,40,0.06)'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                    <h4 style={{margin: 0}}>All Notifications ({adminNotifications.length})</h4>
                    <button className="btn" onClick={() => setShowNotificationsList(false)}>Close</button>
                  </div>
                  {loadingNotifications ? (
                    <p>Loading notifications...</p>
                  ) : adminNotifications.length === 0 ? (
                    <p>No notifications created yet.</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Title</th>
                            <th>Message</th>
                            <th>Audience</th>
                            <th>Expires</th>
                            <th>Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminNotifications
                              .filter((notif) => {
                                const expires = notif.expires_at ? new Date(notif.expires_at ) : null;
                                const now = new Date();
                                const isActive = !expires || expires > now;
                                console.groupCollapsed(`[NOTIF FILTER ${notif.id}] Active: ${isActive}`);
                                console.log('expires_at raw:', notif.expires_at);
                                console.log('parsed expires:', expires?.toISOString());
                                console.log('current time:', now.toISOString());
                                console.groupEnd();
                                return isActive;
                              })
                              .map((notif) => 
                            <tr key={notif.id}>
                              <td style={{fontWeight: 500}}>{notif.title}</td>
                              <td style={{fontWeight: 500}}>{notif.message}</td>
                              <td>{notif.audience}</td>
                              <td>{notif.expires_at ? formatToIST(notif.expires_at) : 'Never'}</td>

          
                              
                              <td>{formatToIST(notif.created_at)}</td>
                              <td>
                                <button 
                                  className="btn small danger" 
                                  onClick={() => handleDeleteNotification(notif.id)}
                                  disabled={deletingId === notif.id}
                                >
                                  {deletingId === notif.id ? 'Deleting...' : 'Delete'}
                                </button>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

<form onSubmit={handleCreateNotification} className="notification-form" noValidate>
                <div className="form-group">

                  <label>
                    <span className="field-label">Notification Title <span style={{color: 'red'}}>*</span></span>
                    <input
                      type="text"
                      value={notificationTitle}
                      onChange={(e) => setNotificationTitle(e.target.value)}
                      required
                      placeholder="Enter notification title"
                    />
                  </label>
                  <label>
                    <span className="field-label">Target Audience</span>
                    <select
                      value={notificationAudience}
                      onChange={(e) => setNotificationAudience(e.target.value)}
                    >
                      <option value="all">All Students & Volunteers</option>
                      <option value="eligible">Eligible Students Only</option>
                      <option value="volunteers">Volunteers Only</option>
                    </select>
                  </label>
                </div>

                <div className="form-group">
                  <label className="full-width">
                    <span className="field-label">Message <span style={{color: 'red'}}>*</span></span>
                    <textarea
                      value={notificationMessage}
                      onChange={(e) => setNotificationMessage(e.target.value)}
                      required
                      rows={4}
                      placeholder="Enter notification message"
                    />
                  </label>
                </div>


<div className="notification-form-group">
                  <div className="checkbox-container">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={isAllTimeNotification}
                        onChange={(e) => {
                          setIsAllTimeNotification(e.target.checked);
                          if (e.target.checked) setNotificationExpiresAt("");
                        }}
                      /> All time notification (no expiry)
                    </label>
                  </div>
                  <div className="expiry-container">
                    <label>
                      <span className="field-label">Expires At <span style={{color: 'red'}}>*</span> (Mandatory unless checked above)</span>
                      <input
                        type="datetime-local"
                        value={notificationExpiresAt}
                        onChange={(e) => setNotificationExpiresAt(e.target.value)}
                        required={!isAllTimeNotification}
                        disabled={isAllTimeNotification}
                      />
                    </label>
                  </div>
                </div>


                <button
                  type="submit"
                  className="btn form-submit-btn primary"
                  disabled={creatingNotification}
                >
                  {creatingNotification ? "Creating..." : "Create Notification"}
                </button>
              </form>
            </section>
          )}

          {/* Reports */}
          {activeSection === "reports" && (
            <section className="reports-section">
              <div className="section-header">
                <h3>Reports & Analytics </h3>
                <div className="section-actions">
                  <button className="btn" onClick={handleGenerateReport}>Generate Custom Report</button>
                </div>
              </div>

              <div className="report-scope-panel">
                <div className="report-scope-copy">
                  <div className="report-scope-title">Camp & Date Scope</div>
                  <p>Select a camp master entry. Eligible, non-eligible, and fee receipt reports will export only rows for that camp/date pair.</p>
                </div>
                <div className="report-scope-controls">
                  <label>
                    <span className="field-label">Camp / Date</span>
                    <select
                      className="report-scope-select"
                      value={reportCampScopeKey}
                      onChange={(e) => setReportCampScopeKey(e.target.value)}
                      disabled={reportCampOptions.length === 0}
                    >
                      {reportCampOptions.length === 0 ? (
                        <option value="">No camp dates available</option>
                      ) : (
                        reportCampOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <div className="report-scope-summary">
                    {selectedReportCampScope ? (
                      <>
                        {selectedReportCampScope.key === 'all' ? (
                          <>
                            <strong>Active scope:</strong> ALL - Entire Reports
                          </>
                        ) : (
                          <>
                            <strong>Active scope:</strong> {selectedReportCampScope.campName} on {new Date(selectedReportCampScope.campDate).toLocaleDateString('en-IN')}
                          </>
                        )}
                      </>
                    ) : (
                      'No camp date pair selected yet.'
                    )}
                  </div>
                </div>
              </div>

              <div className="reports-grid">
                <div className="report-card">
                  <h4>Financial Overview</h4>
                  <div className="report-meta">
                    <p>Total Funds Available: <strong>₹{totalFundsAvailable.toLocaleString()}</strong></p>
                    <p>Total Funds Raised: <strong>₹{donors.reduce((s,d) => s + (d.amount || 0), 0).toLocaleString()}</strong></p>
                    <p>Total Used: <strong>₹{feeTrackingRecords.reduce((s,r) => s + parseMoney(r.fee_paid_by_tal), 0).toLocaleString()}</strong></p>
                  </div>
                  <div className="chart-container">
                    <div className="chart-placeholder">Chart Coming Soon</div>
                  </div>
                  <div className="report-actions">
                    <button className="btn small" onClick={() => handleDownloadSpecificReport('financial')}>Download Report</button>
                  </div>
                </div>

                <div className="report-card">
                  <h4>Fee Receipts</h4>
                  <div className="report-meta">
                    <p>Completed Receipts: <strong>{scopedFeeReceiptRecords.length}</strong></p>
                  </div>
                  <div className="chart-container">
                    <div className="chart-placeholder">
                      {selectedReportCampScope
                        ? `${scopedFeeReceiptRecords.length} fee receipts available`
                        : 'Select a camp/date pair to scope this report.'}
                    </div>
                  </div>
                  <div className="report-actions">
                    <button 
                      className="btn small view-btn" 
                      onClick={() => {
                        setShowNonEligibleTable(false);
                        setShowFeeReceiptsReportTable(true);
                        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                      }}
                      disabled={!selectedReportCampScope}
                    >
                      View Data
                    </button>
                    <button className="btn small" onClick={handleDownloadFeeReceiptsReport} disabled={!selectedReportCampScope || scopedFeeReceiptRecords.length === 0}>
                      Download Report
                    </button>
                  </div>
                </div>

                <div className="report-card">
                  <h4>Donor Contributions</h4>
                  <div className="report-meta">
                    <p>Total Donors: <strong>{donors.length}</strong></p>
                    <p>Total Amount: <strong>₹{donors.reduce((sum, d) => sum + (d.amount || 0), 0).toLocaleString()}</strong></p>
                  </div>
                  <div className="chart-container">
                    <div className="chart-placeholder">
                      {selectedReportCampScope
                        ? `Donor contributions report is ready for export.`
                        : 'Select a camp/date pair to scope this report.'}
                    </div>
                  </div>
                  <div className="report-actions">
                    <button 
                      className="btn small view-btn" 
                      onClick={() => {
                        setShowFeeReceiptsReportTable(false);
                        setShowDonorContributionsReportTable(true);
                        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                      }}
                      disabled={!selectedReportCampScope}
                    >
                      View Data
                    </button>
                    <button className="btn small" onClick={() => handleDownloadDonorContributionsReport()}>
                      Download Report
                    </button>
                  </div>
                </div>
                {/* Eligible Students Report */}
                <div className="report-card">
                  <h4>Eligible Students</h4>
                  <div className="report-meta">
                    <p>Total Eligible: <strong>{scopedEligibleStudents.length}</strong></p>
                  </div>
                  <div className="chart-container">
                    <div className="chart-placeholder">
                      {selectedReportCampScope
                        ? `Eligible students for ${selectedReportCampScope.campName} on ${new Date(selectedReportCampScope.campDate).toLocaleDateString('en-IN')}.`
                        : 'Select a camp/date pair to scope this report.'}
                    </div>
                  </div>
                  <div className="report-actions">
                    <button
                      className="btn small view-btn"
                      onClick={async () => {
                        setShowNonEligibleTable(false);
                        if (!showEligibleTable || eligibleStudents.length === 0) {
                          await fetchEligibleStudents();
                          window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                        }
                        setShowEligibleTable(true);
                      }}
                      disabled={loadingEligible || !selectedReportCampScope}
                    >
                      {loadingEligible ? 'Loading...' : 'View Data'}
                    </button>
                    <button className="btn small" onClick={handleDownloadEligibleReport} disabled={!selectedReportCampScope || scopedEligibleStudents.length === 0}>
                      Download Report
                    </button>
                  </div>
                </div>
                
                {/* Non-Eligible Students Report */}
                <div className="report-card">
                  <h4>Non-Eligible Students</h4>
                  <div className="report-meta">
                    <p>Total Non-Eligible: <strong>{scopedNonEligibleStudents.length}</strong></p>
                  </div>
                  <div className="chart-container">
                    <div className="chart-placeholder">
                      {selectedReportCampScope
                        ? `Non-eligible students for ${selectedReportCampScope.campName} on ${new Date(selectedReportCampScope.campDate).toLocaleDateString('en-IN')}.`
                        : 'Select a camp/date pair to scope this report.'}
                    </div>
                  </div>
                  <div className="report-actions">
                    <button
                      className="btn small view-btn"
                      onClick={async () => {
                        setShowEligibleTable(false);
                        if (!showNonEligibleTable || nonEligibleStudents.length === 0) {
                          await fetchNonEligibleStudents();
                          window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                        }
                        setShowNonEligibleTable(true);
                      }}
                      disabled={loadingNonEligible || !selectedReportCampScope}
                    >
                      {loadingNonEligible ? 'Loading...' : 'View Data'}
                    </button>
                    <button className="btn small" onClick={handleDownloadNonEligibleReport} disabled={!selectedReportCampScope || scopedNonEligibleStudents.length === 0}>
                      Download Report
                    </button>
                  </div>
                </div>
              </div>

              {/* Eligible Students Table */}
              {showEligibleTable && (
<div className="table-wrap" style={{marginTop: '24px'}}>
                  <h3>
                    Eligible Students List ({selectedReportCampScope ? scopedEligibleStudents.length : eligibleStudents.length})
                  </h3>
                  {selectedReportCampScope && scopedEligibleStudents.length === 0 ? (
                    <div style={{padding: '1.25rem', color: '#666'}}>
                      No eligible students found for {selectedReportCampScope.campName} on {new Date(selectedReportCampScope.campDate).toLocaleDateString('en-IN')}.
                    </div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Student ID</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Contact</th>
                          <th>Education</th>
                          <th>School/College</th>
                          <th>Date Added</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedReportCampScope ? scopedEligibleStudents : eligibleStudents).map(s => (
                          <tr key={s.id}>
                            <td>{s.student_public_id || '-'}</td>
                            <td>{s.student_name || s.full_name}</td>
                            <td>{s.email}</td>
                            <td className="nowrap-cell">{s.contact || '-'}</td>
                            <td>{s.education || s.class}</td>
                            <td>{s.school || s.college || '-'}</td>
                            <td>
                              {s.created_at 
                                ? new Date(s.created_at).toLocaleDateString('en-IN') 
                                : '-'
                              }
                            </td>
                            <td>
                              <button 
                                className="btn small outline view-btn" 
                                style={{minWidth: '44px'}}
                                onClick={() => setViewEligibleStudent(s)}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Non-Eligible Students Table */}
              {showNonEligibleTable && (
<div className="table-wrap" style={{marginTop: '24px'}}>
                  <h3>
                    Non-Eligible Students List ({selectedReportCampScope ? scopedNonEligibleStudents.length : nonEligibleStudents.length})
                  </h3>
                  {selectedReportCampScope && scopedNonEligibleStudents.length === 0 ? (
                    <div style={{padding: '1.25rem', color: '#666'}}>
                      No non-eligible students found for {selectedReportCampScope.campName} on {new Date(selectedReportCampScope.campDate).toLocaleDateString('en-IN')}.
                    </div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Student ID</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Contact</th>
                          <th>Education</th>
                          <th>School/College</th>
                          <th>Date Added</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedReportCampScope ? scopedNonEligibleStudents : nonEligibleStudents).map(s => (
                          <tr key={s.id}>
                            <td>{s.student_public_id || '-'}</td>
                            <td>{s.student_name || s.full_name}</td>
                            <td>{s.email}</td>
                            <td className="nowrap-cell">{s.contact || '-'}</td>
                            <td>{s.education || s.class}</td>
                            <td>{s.school || s.college || '-'}</td>
                            <td>
                              {s.created_at 
                                ? new Date(s.created_at).toLocaleDateString('en-IN') 
                                : '-'
                              }
                            </td>
                            <td>
                              <button 
                                className="btn small view-btn" 
                                onClick={() => setViewNonEligibleStudent(s)}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Fee Receipts Report Table */}
              {showFeeReceiptsReportTable && (
                <div className="table-wrap" style={{marginTop: '24px'}}>
                  <h3>
                    Fee Receipts Report Data ({scopedFeeReceiptRecords.length} records)
                  </h3>
                  {scopedFeeReceiptRecords.length === 0 ? (
                    <div style={{padding: '1.25rem', color: '#666'}}>
                      No fee receipts found for {selectedReportCampScope.campName} on {new Date(selectedReportCampScope.campDate).toLocaleDateString('en-IN')}.
                    </div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Student Public ID</th>
                          <th>Student Name</th>
                          <th>Email</th>
                          <th>Total Expenses</th>
                          <th>Paid by TAL</th>
                          <th>Balance</th>
                          <th>Status</th>
                          <th>Voucher Uploaded At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scopedFeeReceiptRecords.map((record) => {
                          const requiredFee = parseMoney(record.total_educational_expenses);
                          const paidAmount = parseMoney(record.fee_paid_by_tal);
                          const balance = Math.max(requiredFee - paidAmount, 0);
                          return (
                            <tr key={record.id}>
                              <td>{record.student_public_id || '—'}</td>
                              <td>{record.student_name || '—'}</td>
                              <td>{record.email || '—'}</td>
                              <td>₹{requiredFee.toLocaleString()}</td>
                              <td>₹{paidAmount.toLocaleString()}</td>
                              <td>₹{balance.toLocaleString()}</td>
                              <td>{record.fee_status || 'Pending'}</td>
                              <td>
                                {record.voucher_uploaded_at 
                                  ? new Date(record.voucher_uploaded_at).toLocaleDateString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric'
                                    })
                                  : '—'
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  <div style={{marginTop: '1rem', display: 'flex', gap: '12px'}}>
                    <button className="btn primary" onClick={handleDownloadFeeReceiptsReport}>📥 Download CSV</button>
                    <button className="btn" onClick={() => setShowFeeReceiptsReportTable(false)}>✕ Close</button>
                  </div>
                </div>
              )}

              {/* Donor Contributions Report Table */}
              {showDonorContributionsReportTable && (
                <div className="table-wrap" style={{marginTop: '24px'}}>
                  <h3>
                    Donor Contributions Report Data ({donors.length} donors)
                  </h3>
                  {donors.length === 0 ? (
                    <div style={{padding: '1.25rem', color: '#666'}}>
                      No donor contributions available for reporting.
                    </div>
                  ) : (
                    <>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Donor Name</th>
                            <th>Amount</th>
                            <th>Donation Date</th>
                            <th>Payment Method</th>
                            <th>Transaction ID</th>
                            <th>Email</th>
                            <th>Contact</th>
                          </tr>
                        </thead>
                        <tbody>
                          {donors.map((donor) => (
                            <tr key={donor.id}>
                              <td>{donor.full_name || donor.name || '—'}</td>
                              <td>₹{(donor.amount || 0).toLocaleString()}</td>
                              <td>
                                {donor.donation_date 
                                  ? new Date(donor.donation_date).toLocaleDateString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric'
                                    })
                                : '—'
                                }
                              </td>
                              <td>{donor.payment_method || '—'}</td>
                              <td>{donor.transaction_id || '—'}</td>
                              <td>{donor.email || '—'}</td>
                              <td>{donor.phone || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
                        <strong>Summary:</strong> Total {donors.length} donor(s) contributed ₹{donors.reduce((sum, d) => sum + (d.amount || 0), 0).toLocaleString()}
                      </div>
                    </>
                  )}
                  <div style={{marginTop: '1rem', display: 'flex', gap: '12px'}}>
                    <button className="btn primary" onClick={() => handleDownloadDonorContributionsReport()}>📥 Download CSV</button>
                    <button className="btn" onClick={() => setShowDonorContributionsReportTable(false)}>✕ Close</button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Settings — commented out
          {activeSection === "settings" && (
            <section className="settings-section">
              <div className="section-header">
                <h3>System Settings</h3>
                <div className="section-actions">
                  <button className="btn primary" onClick={handleSaveSettings}>Save Changes</button>
                </div>
              </div>

              <div className="settings-grid">
                <div className="settings-card">
                  <h4>👤 Profile Settings</h4>
                  <div className="settings-form">
                    <label>
                      Admin Name
                      <input 
                        type="text" 
                        className="form-input" 
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        placeholder="Enter admin name" 
                      />
                    </label>
                    <label>
                      Email Address
                      <input 
                        type="email" 
                        className="form-input" 
                        value={currentUser?.email || ""} 
                        readOnly 
                        placeholder="Email cannot be changed" 
                      />
                    </label>
                    <label>
                      Contact Number
                      <input 
                        type="tel" 
                        className="form-input" 
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                        placeholder="Enter contact number" 
                      />
                    </label>
                  </div>
                </div>
                
                <div className="settings-card">
                  <h4>🔔 Notification Preferences</h4> 
                  <div className="settings-form">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={emailNotifications}
                        onChange={(e) => setEmailNotifications(e.target.checked)} 
                      /> Email Notifications
                    </label>
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={smsAlerts}
                        onChange={(e) => setSmsAlerts(e.target.checked)} 
                      /> SMS Alerts
                    </label>
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={systemNotifications}
                        onChange={(e) => setSystemNotifications(e.target.checked)} 
                      /> System Notifications
                    </label>
                  </div>
                </div>


              </div>
            </section>
          )}
          */}
        </main>
      </div>

      {/* View / Edit modals */}
{viewStudent && (
  <div className="modal-overlay">
    <div className="modal">
      <h3>Student Details</h3>

      <div className="view-grid">
        {/* Basic Info */}
        <p style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}><strong>Full Name:</strong> {viewStudent.full_name || '—'}</p>
        <p><strong>Age:</strong> {viewStudent.age || '—'}</p>
        <p style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}><strong>Email:</strong> {viewStudent.email || '—'}</p>
        
        {/* Contact Info */}
        <p className="nowrap-cell" style={{ whiteSpace: 'normal' }}><strong>Contact:</strong> {viewStudent.contact || '—'}</p>
        <p className="nowrap-cell" style={{ whiteSpace: 'normal' }}><strong>Parent Contact 2:</strong> {viewStudent.parent_contact_2 || '—'}</p>
        <p className="nowrap-cell" style={{ whiteSpace: 'normal' }}><strong>WhatsApp:</strong> {viewStudent.whatsapp || '—'}</p>
        <p className="nowrap-cell" style={{ whiteSpace: 'normal' }}><strong>Student Contact:</strong> {viewStudent.student_contact || '—'}</p>
        
        {/* Address */}
        <p style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}><strong>Address:</strong> {viewStudent.address || '—'}</p>
        
        {/* Camp Info */}
        <p><strong>Camp Name:</strong> {viewStudent.camp_name || viewStudent.campName || '—'}</p>
        <p><strong>Camp Date:</strong> {viewStudent.camp_date || viewStudent.campDate || '—'}</p>
        
        {/* Education */}
        <p><strong>School:</strong> {viewStudent.school || '—'}</p>
        <p><strong>Class:</strong> {viewStudent.class || '—'}</p>
        <p><strong>Previous %:</strong> {viewStudent.prev_percent || '—'}</p>
        <p><strong>Present %:</strong> {viewStudent.present_percent || '—'}</p>
        
        {/* Family & Financial */}
        <p><strong>Has Scholarship:</strong> {viewStudent.has_scholarship ? "Yes" : "No"}</p>
        <p><strong>Scholarship:</strong> {viewStudent.scholarship || '—'}</p>
        <p><strong>Does Work:</strong> {viewStudent.does_work ? "Yes" : "No"}</p>
        <p><strong>Earning Members:</strong> {viewStudent.earning_members || '—'}</p>
        
        {/* Achievements */}
        <p><strong>Academic Achievements:</strong> {viewStudent.academic_achievements || '—'}</p>
        <p><strong>Non-Academic Achievements:</strong> {viewStudent.non_academic_achievements || '—'}</p>
        
        {/* Special Info */}
        <p><strong>Is Single Parent:</strong> {viewStudent.is_single_parent ? "Yes" : "No"}</p>
        <p><strong>Special Remarks:</strong> {viewStudent.special_remarks || '—'}</p>
        
        {/* Volunteer */}
        <p><strong>Volunteer Name:</strong> {viewStudent.volunteer_name || '—'}</p>
        <p className="nowrap-cell"><strong>Volunteer Contact:</strong> {viewStudent.volunteer_contact || '—'}</p>
        
        {/* Public ID & Timestamps */}
        <p><strong>Student Public ID:</strong> {viewStudent.student_public_id || '—'}</p>
        <p><strong>Record Created:</strong> {formatToIST(viewStudent.created_at)}</p>
        
        {/* Status */}
        <p><strong>Status:</strong> {viewStudent.status || '—'}</p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button 
          className="btn secondary" 
          onClick={() => {
            setEditStudent(viewStudent);
            setViewStudent(null);
          }}
        >
          Edit
        </button>
        <button 
          className="btn primary" 
          onClick={() => setViewStudent(null)}
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}




      {viewDonor && (
        <div className="modal-overlay" onClick={() => setViewDonor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Donor Details</h3>
            <div className="view-grid" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              {/* Personal Information */}
              <p><strong>Full Name:</strong> {viewDonor.full_name || viewDonor.name || '—'}</p>
              <p><strong>Email:</strong> {viewDonor.email || '—'}</p>
              <p><strong>Phone:</strong> {viewDonor.phone || viewDonor.contact || '—'}</p>
              
              {/* Donation Information */}
              <p><strong>Amount:</strong> ₹{viewDonor.amount?.toLocaleString() || '0'}</p>
              <p><strong>Duration:</strong> {viewDonor.years || viewDonor.duration || '—'}</p>
              <p><strong>Donation Date:</strong> {viewDonor.donation_date ? new Date(viewDonor.donation_date).toLocaleDateString('en-IN') : '—'}</p>
              <p><strong>Payment Method:</strong> {viewDonor.payment_method || viewDonor.mode_of_payment || '—'}</p>
              <p><strong>Transaction ID:</strong> {viewDonor.transaction_id || '—'}</p>
              
              {/* Timestamps */}
              <p><strong>Created At:</strong> {viewDonor.created_at ? formatToIST(viewDonor.created_at) : '—'}</p>
              <p><strong>Updated At:</strong> {viewDonor.updated_at ? formatToIST(viewDonor.updated_at) : '—'}</p>
            </div>
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button
                className="btn secondary"
                onClick={() => {
                  handleEditDonor(viewDonor);
                  setViewDonor(null);
                }}
              >
                Edit
              </button>
              <button className="btn primary" onClick={() => setViewDonor(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {editStudent && (
        <div className="modal-overlay" onClick={() => setEditStudent(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Student</h3>
            {/* Edit form includes new fields: course, campName, campDate, paidDate */}
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              const updated = {
                id: editStudent.id,
                name: fd.get('name'),
                email: fd.get('email'),
                contact: fd.get('contact'),
                parent_contact_2: fd.get('parent_contact_2'),
                whatsapp: fd.get('whatsapp'),
                student_contact: fd.get('student_contact'),
                address: fd.get('address'),
                school: fd.get('school'),
                college: fd.get('college'),
                year: fd.get('year'),
                course: fd.get('course'),
                feeStatus: fd.get('feeStatus'),
                campName: fd.get('campName'),
                campDate: fd.get('campDate'),
                prev_percent: fd.get('prev_percent'),
                present_percent: fd.get('present_percent'),
                has_scholarship: fd.get('has_scholarship'),
                scholarship: fd.get('scholarship'),
                does_work: fd.get('does_work'),
                earning_members: fd.get('earning_members'),
                academic_achievements: fd.get('academic_achievements'),
                non_academic_achievements: fd.get('non_academic_achievements'),
                is_single_parent: fd.get('is_single_parent'),
                special_remarks: fd.get('special_remarks'),
                volunteer_name: fd.get('volunteer_name'),
                volunteer_contact: fd.get('volunteer_contact')
              };
              handleEditSave(updated);
            }}>
              <label>Name<input name="name" defaultValue={editStudent.name} /></label>
              <label>Email<input name="email" defaultValue={editStudent.email || ''} /></label>
              <label>Contact<input name="contact" defaultValue={editStudent.contact || ''} /></label>
              <label>Parent Contact 2<input name="parent_contact_2" defaultValue={editStudent.parent_contact_2 || ''} /></label>
              <label>WhatsApp<input name="whatsapp" defaultValue={editStudent.whatsapp || ''} /></label>
              <label>Student Contact<input name="student_contact" defaultValue={editStudent.student_contact || ''} /></label>
              <label>Address<input name="address" defaultValue={editStudent.address || ''} /></label>
              <label>School<input name="school" defaultValue={editStudent.school || ''} /></label>
              <label>College<input name="college" defaultValue={editStudent.college || ''} /></label>
              <label>Class / Year<input name="year" defaultValue={editStudent.year || editStudent.class || ''} /></label>
              <label>Course<input name="course" defaultValue={editStudent.course || ''} placeholder="e.g. Science, Commerce" /></label>
              <label>Camp Name<input name="campName" defaultValue={editStudent.campName || editStudent.camp_name || ''} /></label>
              <label>Camp Date<input name="campDate" type="date" defaultValue={editStudent.campDate || editStudent.camp_date || ''} /></label>
              <label>Previous %<input name="prev_percent" defaultValue={editStudent.prev_percent || ''} /></label>
              <label>Present %<input name="present_percent" defaultValue={editStudent.present_percent || ''} /></label>
              <label>Has Scholarship
                <select name="has_scholarship" defaultValue={editStudent.has_scholarship ? 'Yes' : 'No'}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </label>
              <label>Scholarship<input name="scholarship" defaultValue={editStudent.scholarship || ''} /></label>
              <label>Does Work
                <select name="does_work" defaultValue={editStudent.does_work ? 'Yes' : 'No'}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </label>
              <label>Earning Members<input name="earning_members" defaultValue={editStudent.earning_members || ''} /></label>
              <label>Academic Achievements<input name="academic_achievements" defaultValue={editStudent.academic_achievements || ''} /></label>
              <label>Non-Academic Achievements<input name="non_academic_achievements" defaultValue={editStudent.non_academic_achievements || ''} /></label>
              <label>Single Parent
                <select name="is_single_parent" defaultValue={editStudent.is_single_parent ? 'Yes' : 'No'}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </label>
              <label>Special Remarks<textarea name="special_remarks" defaultValue={editStudent.special_remarks || ''} rows={3} /></label>
              <label>Volunteer Name<input name="volunteer_name" defaultValue={editStudent.volunteer_name || ''} /></label>
              <label>Volunteer Contact<input name="volunteer_contact" defaultValue={editStudent.volunteer_contact || ''} /></label>
              <label>Fee Status
                <select name="feeStatus" defaultValue={editStudent.feeStatus || editStudent.fee || ''}>
                  <option>Paid</option>
                  <option>Partial</option>
                  <option>Pending</option>
                </select>
              </label>

              <div style={{display:'flex',gap:8,marginTop:12, flexWrap: 'wrap'}}>
                <button className="btn" type="submit">Save</button>
                <button className="btn" type="button" onClick={() => setEditStudent(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {broadcastOpen && (
        <div className="modal-overlay" onClick={() => setBroadcastOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create Broadcast</h3>
            <form onSubmit={(e) => { e.preventDefault(); alert('Broadcast sent (dummy)'); setBroadcastOpen(false); }}>
              <label>Message<textarea name="msg" rows={4} /></label>
              <label>Recipients<select name="rec">
                <option value="all">All Students</option>
                <option value="filtered">Filtered Students</option>
              </select></label>
              <div style={{display:'flex',gap:8,marginTop:12}}>
                <button className="btn primary" type="submit">Send</button>
                <button className="btn" type="button" onClick={() => setBroadcastOpen(false)}>Close</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewDocumentsStudent && (
        <div className="modal-overlay" onClick={() => setViewDocumentsStudent(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth: '900px', maxHeight: '85vh', overflowY: 'auto'}}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>
                {viewDocumentsStudent.student_name || viewDocumentsStudent.full_name}
              </h3>
              <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
                Document Verification - Grouped by Academic Year
              </p>
            </div>

            {loadingDocs ? (
              <p style={{textAlign: 'center', padding: '2rem'}}>Loading documents...</p>
            ) : studentDocuments.length === 0 ? (
              <p style={{textAlign: 'center', padding: '2rem', color: '#666'}}>No documents found</p>
            ) : (
              <div style={{padding: '1rem 0'}}>
                {sortedYears.map((year) => {
                  const yearDocs = groupedDocuments[year];
                  const allVerified = yearDocs.every(d => d.is_checked);
                  const anyVerified = yearDocs.some(d => d.is_checked);
                  
                  return (
                    <div key={year} style={{ marginBottom: '24px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      {/* Year Header */}
                      <div style={{
                        padding: '12px 16px',
                        backgroundColor: allVerified ? '#e8f5e8' : anyVerified ? '#fff3e0' : '#ffebee',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                         
                        </h4>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '4px 12px',
                          borderRadius: '12px',
                          backgroundColor: allVerified ? '#2e7d32' : anyVerified ? '#e65100' : '#c62828',
                          color: 'white'
                        }}>
                          {yearDocs.filter(d => d.is_checked).length}/{yearDocs.length} Verified
                        </span>
                      </div>

                      {/* Documents List */}
                      {yearDocs.map((doc) => (
                        <div key={doc.id} style={{
                          padding: '16px',
                          borderBottom: '1px solid #f0f0f0',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '16px',
                          flexWrap: 'wrap',
                          backgroundColor: doc.is_checked ? '#f9f9f9' : 'white'
                        }}>
                          <div style={{minWidth: '220px', flex: '1 1 300px'}}>
                            <p style={{margin: '0 0 4px 0', fontWeight: 600, fontSize: '14px'}}>
                              {doc.document_name || doc.file_name || 'Unnamed document'}
                            </p>
                            <p style={{margin: '0', fontSize: '13px', color: '#444'}}>
                              <strong>File:</strong> {doc.file_name || 'N/A'}
                            </p>
                            <p style={{margin: '4px 0 0 0', fontSize: '12px', color: '#666'}}>
                              <strong>Uploaded:</strong> {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'N/A'}
                            </p>
                          </div>
                          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px'}}>
                            {doc.file_url ? (
                              <a 
                                href={doc.file_url} 
                                target="_blank" 
                                rel="noreferrer"
                                style={{
                                  backgroundColor: doc.is_checked ? '#2e7d32' : '#1976d2',
                                  color: 'white', 
                                  padding: '8px 16px', 
                                  borderRadius: '4px', 
                                  textDecoration: 'none', 
                                  fontSize: '12px', 
                                  whiteSpace: 'nowrap',
                                  fontWeight: 600
                                }}
                              >
                                {doc.is_checked ? '✓ View Verified' : '👁 View & Verify'}
                              </a>
                            ) : (
                              <span style={{fontSize: '12px', color: '#999'}}>No file URL</span>
                            )}
                            {!doc.is_checked && (
                              <button 
                                onClick={() => handleVerifySingleDocument(doc.id)}
                                style={{
                                  backgroundColor: '#2e7d32',
                                  color: 'white',
                                  border: 'none',
                                  padding: '6px 12px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 600
                                }}
                              >
                                ✅ Mark as Verified
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteSingleDocument(doc)}
                              disabled={deletingDocumentId === doc.id}
                              style={{
                                backgroundColor: deletingDocumentId === doc.id ? '#ef9a9a' : '#d32f2f',
                                color: 'white',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '4px',
                                cursor: deletingDocumentId === doc.id ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                fontWeight: 600,
                                opacity: deletingDocumentId === doc.id ? 0.8 : 1
                              }}
                            >
                              {deletingDocumentId === doc.id ? 'Deleting...' : '🗑 Delete'}
                            </button>
                            <span style={{
                              fontSize: '12px', 
                              color: doc.is_checked ? '#2e7d32' : '#e65100', 
                              fontWeight: 600,
                              padding: '4px 8px',
                              borderRadius: '4px',
                              backgroundColor: doc.is_checked ? '#e8f5e8' : '#fff3e0'
                            }}>
                              {doc.is_checked ? '✅ Verified' : '⏳ Pending Verification'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            
            <button 
              className="btn primary" 
              onClick={() => setViewDocumentsStudent(null)}
              style={{marginTop: '1rem', width: '100%'}}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {viewEligibleStudent && (
        <div className="modal-overlay" onClick={() => setViewEligibleStudent(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Eligible Student Details</h3>
            <div className="view-grid">
              <p><strong>Full Name:</strong> {viewEligibleStudent.full_name || '-'}</p>
              <p><strong>Email:</strong> {viewEligibleStudent.email || '-'}</p>
              <p><strong>Contact:</strong> {viewEligibleStudent.contact || '-'}</p>
              <p><strong>Education Level:</strong> {viewEligibleStudent.class || '-'}</p>
              {/* <p><strong>Camp name:</strong> {viewEligibleStudent.year || '-'}</p> */}
              <p><strong>School:</strong> {viewEligibleStudent.school || '-'}</p>
              {/* <p><strong>College:</strong> {viewEligibleStudent.college || '-'}</p> */}
              <p><strong>Date Added:</strong> {formatToIST(viewEligibleStudent.created_at)}</p>
              <p><strong>Student ID:</strong> {viewEligibleStudent.student_public_id || '-'}</p>
              {viewEligibleStudent.reason && (
                <p><strong>Eligibility Reason:</strong> {viewEligibleStudent.reason}</p>
              )}
            </div>
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="btn primary" onClick={() => setViewEligibleStudent(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {viewNonEligibleStudent && (
        <div className="modal-overlay" onClick={() => setViewNonEligibleStudent(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Non-Eligible Student Details</h3>
            <div className="view-grid">
              <p><strong>Full Name:</strong> {viewNonEligibleStudent.full_name || '-'}</p>
              <p><strong>Email:</strong> {viewNonEligibleStudent.email || '-'}</p>
              <p><strong>Contact:</strong> {viewNonEligibleStudent.contact || '-'}</p>
              <p><strong>Education Level:</strong> {viewNonEligibleStudent.class || '-'}</p>
              <p><strong>Camp Name:</strong> {viewNonEligibleStudent.camp_name || '-'}</p>
              <p><strong>School:</strong> {viewNonEligibleStudent.school || '-'}</p>
              
              <p><strong>Date Added:</strong> {formatToIST(viewNonEligibleStudent.created_at)}</p>
              <p><strong>Student ID:</strong> {viewNonEligibleStudent.student_public_id || '-'}</p>
            </div>
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="btn primary" onClick={() => setViewNonEligibleStudent(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Completed Fee Receipt Details Modal */}
      {viewingReceiptRecord && (
        <div className="modal-overlay" onClick={() => setViewingReceiptRecord(null)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Fee Receipt Details - ID #{viewingReceiptRecord.id}</h3>
              <button className="close-btn" onClick={() => setViewingReceiptRecord(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="student-details-grid">
                <div className="detail-section">
                  <h4>📄 Receipt Information</h4>
                  <div className="detail-row">
                    <span className="label">Fee Tracking ID:</span>
                    <span className="value"><strong>#{viewingReceiptRecord.id}</strong></span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Student Form ID:</span>
                    <span className="value">{viewingReceiptRecord.student_form_id || '—'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Student Public ID:</span>
                    <span className="value">{viewingReceiptRecord.student_public_id || '—'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Voucher URL:</span>
                    <span className="value">
                      {viewingReceiptRecord.voucher_url ? (
                        <a href={viewingReceiptRecord.voucher_url} target="_blank" rel="noreferrer">🔗 Open Voucher</a>
                      ) : 'No voucher'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Uploaded At:</span>
                    <span className="value">{viewingReceiptRecord.voucher_uploaded_at ? formatToIST(viewingReceiptRecord.voucher_uploaded_at) : '—'}</span>
                  </div>
                </div>

                <div className="detail-section">
                  <h4>👤 Student Details</h4>
                  <div className="detail-row">
                    <span className="label">Name:</span>
                    <span className="value">{viewingReceiptRecord.student_name || '—'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Email:</span>
                    <span className="value">{viewingReceiptRecord.email || '—'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">WhatsApp:</span>
                    <span className="value">{viewingReceiptRecord.whatsapp_number || '—'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Camp:</span>
                    <span className="value">{viewingReceiptRecord.camp_name || '—'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Education:</span>
                    <span className="value">{viewingReceiptRecord.education || '—'}</span>
                  </div>
                </div>

                <div className="detail-section">
                  <h4>💰 Fee Details</h4>
                  <div className="detail-row">
                    <span className="label">Total Educational Expenses:</span>
                    <span className="value">₹{parseMoney(viewingReceiptRecord.total_educational_expenses || 0).toLocaleString()}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Paid by TAL:</span>
                    <span className="value">₹{parseMoney(viewingReceiptRecord.fee_paid_by_tal || 0).toLocaleString()}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Status:</span>
                    <span className={`value status-badge ${viewingReceiptRecord.fee_status?.toLowerCase() || 'pending'}`}>
                      {viewingReceiptRecord.fee_status || 'Pending'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Record Created:</span>
                    <span className="value">{viewingReceiptRecord.created_at ? formatToIST(viewingReceiptRecord.created_at) : '—'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Last Updated:</span>
                    <span className="value">{viewingReceiptRecord.updated_at ? formatToIST(viewingReceiptRecord.updated_at) : '—'}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn primary" onClick={() => setViewingReceiptRecord(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}







