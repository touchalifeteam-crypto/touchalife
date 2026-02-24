// src/StudentForm.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./StudentForm.css";
import supabase from "./supabaseClient";
import EducationDropdown from "./EducationDropdown";
import { useParams } from "react-router-dom";

/*
  NOTE: This file preserves your UI exactly and only adds Supabase integration:
  - Uploads files to storage bucket: "student_documents"
  - Inserts a record into table: "student_details"
  - Attaches volunteer's logged-in email as volunteer_email
*/

export default function StudentForm() {
  const navigate = useNavigate();
  const { id } = useParams();   // student id
  const isEditMode = !!id;
  const [volunteerEmail, setVolunteerEmail] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errors, setErrors] = useState({}); // <-- validation errors

  useEffect(() => {
    // fetch logged-in user email (volunteer)
    const getUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          console.warn("supabase.auth.getUser error:", error);
          return;
        }
        if (data?.user) {
          setVolunteerEmail(data.user.email);
        }
      } catch (err) {
        console.error("getUser error:", err);
      }
    };
    getUser();
  }, []);

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    middle_name: "",
    dob: "",
    age: "",
    pob: "",
    camp_name: "",
    nationality: "",
    address: "",
    class: "",
    educationcategory: "",
    educationsubcategory: "",
    educationyear: "",
    educationcategory_custom: "",
    educationsubcategory_custom: "",
    educationyear_custom: "",
    email: "",
    contact: "",
    whatsapp: "",
    student_contact: "",
    school: "",
    branch: "",
    prev_percent: "",
    present_percent: "",
    fee: "",
    fee_structure: "",
    job: "",
    aspiration: "",
    scholarship: "",
    certificates: "",
    years_area: "",
    num_family_members: "",  // New field for number of family members
    family_members_details: [],  // New field to store family members details
    num_earning_members: "",  // New field for number of earning members
    earning_members_details: [],  // New field to store earning members details
    account_no: "",
    bank_name: "",
    bank_branch: "",
    ifsc_code: "",
    special_remarks: "",
    volunteer_name: "",
    volunteer_contact: "",
    academic_achievements: "",
    non_academic_achievements: "",
    is_single_parent: "",
does_work: "",
has_scholarship: "",

  });

  const [files, setFiles] = useState({
    school_id: null,
    aadhaar: null,
    income_proof: null,
    marksheet: null,
    passport_photo: null,
    fees_receipt: null,
    volunteer_signature: null,
    student_signature: null,
  });

  // Helper: validate a single field and return error message (or empty string)
  const validateField = (name, value) => {
    // Name fields: only alphabets and spaces allowed
    if (name === "first_name" || name === "last_name") {
      if (!value) return `${name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} is required`;
      if (!/^[a-zA-Z\s]+$/.test(value)) {
        return "Only alphabets and spaces are allowed";
      }
      return "";
    }

    // Middle name: optional, but if present only alphabets and spaces allowed
    if (name === "middle_name") {
      if (value && !/^[a-zA-Z\s]+$/.test(value)) {
        return "Only alphabets and spaces are allowed";
      }
      return "";
    }

    // Phone fields (exactly 10 digits)
    if (name === "contact" || name === "whatsapp" || name === "volunteer_contact") {
      if (!value || !/^\d{10}$/.test(value)) {
        return "Must be exactly 10 digits";
      }
      return "";
    }

    // Student number (optional, but if present must be 10 digits)
    if (name === "student_contact") {
      if (!value) return "";
      if (!/^\d{10}$/.test(value)) return "Must be exactly 10 digits (if entered)";
      return "";
    }

    // Account number: digits only, 10-18 digits
    if (name === "account_no") {
  if (!value) return "";   // ✅ optional
  if (!/^\d{10,18}$/.test(value)) {
    return "Account number must be 10 to 18 digits";
  }
  return "";
}


    // IFSC: 4 letters + 0 + 6 numbers (common pattern)
    if (name === "ifsc_code") {
  if (!value) return "";   // ✅ optional
  if (!/^[A-Z]{4}0[0-9]{6}$/.test(value)) {
    return "Enter a valid IFSC code";
  }
  return "";
}


    // Email proper validation
    if (name === "email") {
      if (!value) return "Email is required";
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(value)) return "Enter a valid email address";
      return "";
    }

    // Age check (already handled at submit) - but live ensure age >= 6 if present
    if (name === "age") {
      if (value !== "" && (Number.isNaN(Number(value)) || Number(value) < 6)) {
        return "Age must be at least 6";
      }
      return "";
    }

    // Percentage fields: only numbers and decimal points
    if (name === "prev_percent" || name === "present_percent") {
      if (!value) return `${name === "prev_percent" ? "Previous Year" : "Present Year"} Percentage is required`;
      if (!/^\d+(\.\d+)?$/.test(value)) {
        return "Only numbers and decimal points are allowed";
      }
      const numValue = parseFloat(value);
      if (numValue < 0 || numValue > 100) {
        return "Percentage must be between 0 and 100";
      }
      return "";
    }

    // Fee structure: only numbers, decimal points, and currency symbols
    if (name === "fee_structure") {
      if (!value) return "Tuition Fee is required";
      if (!/^[\d\s.,₹$£€¥\-\s]+$/.test(value)) {
        return "Only numbers, currency symbols, and punctuation are allowed";
      }
      return "";
    }

    // Volunteer name: only alphabets and spaces
    if (name === "volunteer_name") {
      if (!value) return "Volunteer name is required";
      if (!/^[a-zA-Z\s]+$/.test(value)) {
        return "Only alphabets and spaces are allowed";
      }
      return "";
    }

    return "";
  };

  // handleInputChange: extended to enforce digit-only and other live rules for specific fields
  const handleInputChange = (e) => {
    const { name } = e.target;
    let { value } = e.target;

    // PHONE FIELDS: block non-digits and limit to 10
    if (["contact", "whatsapp", "student_contact", "volunteer_contact"].includes(name)) {
      // remove non-digits
      value = value.replace(/\D/g, "");
      // limit length to 10 digits
      if (value.length > 10) value = value.slice(0, 10);
    }

    // ACCOUNT NUMBER: digits only, limit to 18
    if (name === "account_no") {
      value = value.replace(/\D/g, "");
      if (value.length > 18) value = value.slice(0, 18);
    }

    // IFSC: auto uppercase, allow letters/digits, limit to 11 (standard length)
    if (name === "ifsc_code") {
      value = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (value.length > 11) value = value.slice(0, 11);
    }

    // Percentage fields: only allow numbers and decimal points
    if (name === "prev_percent" || name === "present_percent") {
      value = value.replace(/[^\d.]/g, ""); // Remove any non-digit and non-decimal characters
      // Prevent multiple decimal points
      const parts = value.split('.');
      if (parts.length > 2) {
        value = parts[0] + '.' + parts.slice(1).join('');
      }
    }

    // Fee structure: only allow numbers, currency symbols, and punctuation
    if (name === "fee_structure") {
      value = value.replace(/[^\d.,₹$£€¥\-\s]/g, ""); // Allow digits, currency symbols, punctuation, and spaces
    }

    // Handle number of family members
    if (name === "num_family_members") {
      value = value.replace(/\D/g, ""); // Only allow digits
      if (value > 15) value = "15"; // Limit to 15 family members max
      
      // Initialize family_members_details array based on the number
      const num = parseInt(value) || 0;
      const newDetails = [...formData.family_members_details];
      
      // Add new entries if increasing
      while (newDetails.length < num) {
        newDetails.push({ name: "", relation: "" });
      }
      
      // Remove extra entries if decreasing
      while (newDetails.length > num) {
        newDetails.pop();
      }
      
      setFormData(prev => ({ ...prev, num_family_members: value, family_members_details: newDetails }));
      return;
    }

    // Handle family member details changes
    if (name.startsWith("family_member_name_") || name.startsWith("family_member_relation_")) {
      const index = parseInt(name.split('_')[3]); // Extract index from "family_member_name_0" or "family_member_relation_0"
      const field = name.includes("_name_") ? "name" : "relation";
      
      const updatedDetails = [...formData.family_members_details];
      if (updatedDetails[index]) {
        updatedDetails[index][field] = value;
      }
      
      setFormData(prev => ({ ...prev, family_members_details: updatedDetails }));
      return;
    }

    // Handle number of earning members
    if (name === "num_earning_members") {
      value = value.replace(/\D/g, ""); // Only allow digits
      if (value > 10) value = "10"; // Limit to 10 earning members max
      
      // Initialize earning_members_details array based on the number
      const num = parseInt(value) || 0;
      const newDetails = [...formData.earning_members_details];
      
      // Add new entries if increasing
      while (newDetails.length < num) {
        newDetails.push({ name: "", occupation: "" });
      }
      
      // Remove extra entries if decreasing
      while (newDetails.length > num) {
        newDetails.pop();
      }
      
      setFormData(prev => ({ ...prev, num_earning_members: value, earning_members_details: newDetails }));
      return;
    }

    // Handle earning member details changes
    if (name.startsWith("earning_member_name_") || name.startsWith("earning_member_occ_")) {
      const index = parseInt(name.split('_')[3]); // Extract index from "earning_member_name_0" or "earning_member_occ_0"
      const field = name.includes("_name_") ? "name" : "occupation";
      
      const updatedDetails = [...formData.earning_members_details];
      if (updatedDetails[index]) {
        updatedDetails[index][field] = value;
      }
      
      setFormData(prev => ({ ...prev, earning_members_details: updatedDetails }));
      return;
    }

    // DOB handling (existing logic preserved)
    if (name === "dob") {
      let computedAge = "";
      if (value) {
        const dobDate = new Date(value);
        const today = new Date();
        let ageYears = today.getFullYear() - dobDate.getFullYear();
        const m = today.getMonth() - dobDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
          ageYears--;
        }
        computedAge = ageYears >= 0 ? String(ageYears) : "";
      }
      setFormData(prev => ({ ...prev, dob: value, age: computedAge }));
      // validate dob/age live
      setErrors(prev => ({ ...prev, age: validateField("age", computedAge) }));
      return;
    }

    // Education category/subcategory/year handling
    if (name === "educationcategory") {
      if (value === "Other") {
        // When "Other" is selected, clear subcategory and year, and set custom fields
        setFormData(prev => ({
          ...prev,
          educationcategory: value,
          educationsubcategory: "",
          educationyear: "",
          educationsubcategory_custom: "",
          educationyear_custom: "",
          class: ""
        }));
      } else {
        // For other categories, reset everything
        setFormData(prev => ({
          ...prev,
          educationcategory: value,
          educationsubcategory: "",
          educationyear: "",
          educationcategory_custom: "",
          educationsubcategory_custom: "",
          educationyear_custom: "",
          class: ""
        }));
      }
      return;
    }

    if (name === "educationsubcategory") {
      setFormData(prev => ({
        ...prev,
        educationsubcategory: value,
        educationyear: "",
        educationsubcategory_custom: value === "Other" ? prev.educationsubcategory_custom : "",
        educationyear_custom: ""
      }));
      return;
    }

    if (name === "educationyear") {
      const subcategoryValue = formData.educationsubcategory === "Other" ? formData.educationsubcategory_custom : formData.educationsubcategory;
      const categoryValue = formData.educationcategory === "Other" ? formData.educationcategory_custom : formData.educationcategory;
      const yearValue = value === "Other" ? formData.educationyear_custom : value;
      const subcategoryPart = subcategoryValue ? ` - ${subcategoryValue}` : "";
      const combinedClass = yearValue ? `${categoryValue}${subcategoryPart} - ${yearValue}` : "";
      setFormData(prev => ({
        ...prev,
        educationyear: value,
        educationyear_custom: value === "Other" ? prev.educationyear_custom : "",
        class: combinedClass
      }));
      return;
    }

    // Handle custom inputs
    if (name === "educationcategory_custom" || name === "educationsubcategory_custom" || name === "educationyear_custom") {
      const categoryValue = formData.educationcategory_custom;
      const subcategoryValue = formData.educationsubcategory_custom;
      const yearValue = formData.educationyear_custom;
      const subcategoryPart = subcategoryValue ? ` - ${subcategoryValue}` : "";
      const combinedClass = yearValue ? `${categoryValue}${subcategoryPart} - ${yearValue}` : "";
      setFormData(prev => ({ ...prev, [name]: value, class: combinedClass }));
      return;
    }

    // Update formData
    setFormData(prev => ({ ...prev, [name]: value }));

    // Live-validate this field and update errors
    const fieldError = validateField(name, value);
    setErrors(prev => ({ ...prev, [name]: fieldError }));
  };

  const handleFileChange = (e, field) => {
    const file = e.target.files[0];
    if (file) {
      setFiles({ ...files, [field]: file });
    }
  };

  // Upload single file to Supabase storage bucket "student_documents"
  const uploadFileToStorage = async (file, folder) => {
    if (!file) return null;
    const fileName = `${Date.now()}_${file.name}`.replace(/\s+/g, "_");
    const filePath = `${folder}/${fileName}`;

    // Upload
    const { error: uploadError } = await supabase.storage
      .from("student_documents")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw uploadError;
    }

    // Get public URL (if your bucket is public). If private bucket, you'll need signed URLs.
    const { data: publicData } = supabase.storage
      .from("student_documents")
      .getPublicUrl(filePath);

    return publicData?.publicUrl ?? null;
  };

  // Full form validation (runs on submit)
  const runFullValidation = () => {
    const newErrors = {};

    // Required basics (original list)
    const mandatoryFields = [
      { key: 'age', label: 'Age' },
      { key: 'address', label: 'Address' },
      { key: 'whatsapp', label: 'Whatsapp Number' },
      { key: 'school', label: 'Name of School/College' },
      { key: 'class', label: 'Class' },
      { key: 'prev_percent', label: 'Previous Year Percentage' },
      { key: 'present_percent', label: 'Present Year Percentage' },
      { key: 'fee_structure', label: 'Fee Structure' },
      { key: 'num_earning_members', label: 'Number of Earning Members' },
      { key: 'first_name', label: 'First Name' },
      { key: 'last_name', label: 'Last Name' },
      { key: 'email', label: 'Email' },
      { key: 'contact', label: 'Parent Number' },
      { key: 'volunteer_name', label: 'Volunteer Name' },
      { key: 'volunteer_contact', label: 'Volunteer Contact Number' },
      { key: 'camp_date', label: 'Date of Camp' }
    ];

    const missing = mandatoryFields.filter(f => {
      const v = (formData[f.key] || '').toString().trim();
      return v === '';
    });

    if (missing.length > 0) {
      newErrors._missing = 'Please fill in all mandatory fields: ' + missing.map(m => m.label).join(', ');
    }

    // Validate family members details if number is specified
    if (formData.num_family_members) {
      const num = parseInt(formData.num_family_members);
      if (num > 0) {
        for (let i = 0; i < num; i++) {
          if (!formData.family_members_details[i] || 
              !formData.family_members_details[i].name.trim() || 
              !formData.family_members_details[i].relation.trim()) {
            newErrors.family_members = `Please provide name and relation for family member ${i + 1}`;
            break;
          }
        }
      }
    }

    // Validate earning members details if number is specified
    if (formData.num_earning_members) {
      const num = parseInt(formData.num_earning_members);
      if (num > 0) {
        for (let i = 0; i < num; i++) {
          if (!formData.earning_members_details[i] || 
              !formData.earning_members_details[i].name.trim() || 
              !formData.earning_members_details[i].occupation.trim()) {
            newErrors.earning_members = `Please provide name and occupation for earning member ${i + 1}`;
            break;
          }
        }
      }
    }

    // Age check (existing)
    const ageVal = formData.age !== "" && formData.age !== null ? Number(formData.age) : null;
    if (ageVal === null || Number.isNaN(ageVal) || ageVal < 6) {
      newErrors.age = "Age must be at least 6 years";
    }

    // Phone validations
    const contactErr = validateField("contact", formData.contact);
    if (contactErr) newErrors.contact = contactErr;

    const whatsappErr = validateField("whatsapp", formData.whatsapp);
    if (whatsappErr) newErrors.whatsapp = whatsappErr;

    const studentErr = validateField("student_contact", formData.student_contact);
    if (studentErr) newErrors.student_contact = studentErr;

    // Account number
   

    // Email
    const emailErr = validateField("email", formData.email);
    if (emailErr) newErrors.email = emailErr;

    // Single parent validation
    if (!formData.is_single_parent) {
      newErrors.is_single_parent = "Please select Yes or No for single parent question.";
    }

    // Does work validation
    if (!formData.does_work) {
      newErrors.does_work = "Please select Yes or No for work question.";
    }

    // Custom education field validations
    if (formData.educationcategory === "Other" && !formData.educationcategory_custom.trim()) {
      newErrors.educationcategory_custom = "Please specify your education level.";
    }

    if (formData.educationsubcategory === "Other" && !formData.educationsubcategory_custom.trim()) {
      newErrors.educationsubcategory_custom = "Please specify your stream/branch/course.";
    }

    if (formData.educationyear === "Other" && !formData.educationyear_custom.trim()) {
      newErrors.educationyear_custom = "Please specify your academic year.";
    }

    return newErrors;
  };

  useEffect(() => {
    if (!isEditMode) return;

    const fetchStudent = async () => {
      const { data, error } = await supabase
        .from("student_form_submissions")
        .select("*")
        .eq("id", parseInt(id))
        .single();

      if (error) {
        alert("Error loading student data");
        return;
      }

      // Parse family members details if it exists
      let updatedData = { ...data };
      if (data.family_members_details) {
        try {
         updatedData.family_members_details = data.family_members_details || [];
updatedData.num_family_members = (data.family_members_details || []).length.toString();

updatedData.earning_members_details = data.earning_members_details || [];
updatedData.num_earning_members = (data.earning_members_details || []).length.toString();
          updatedData.num_family_members = updatedData.family_members_details.length.toString();
        } catch (e) {
          console.error("Error parsing family members details:", e);
          updatedData.family_members_details = [];
          updatedData.num_family_members = "0";
        }
      } else {
        updatedData.family_members_details = [];
        updatedData.num_family_members = data.num_family_members || "0";
      }

      // Parse earning members details if it exists
      if (data.earning_members_details) {
        try {
      updatedData.earning_members_details = data.earning_members_details || [];
updatedData.num_earning_members =
  (data.earning_members_details || []).length.toString();

          updatedData.num_earning_members = updatedData.earning_members_details.length.toString();
        } catch (e) {
          console.error("Error parsing earning members details:", e);
          updatedData.earning_members_details = [];
          updatedData.num_earning_members = "0";
        }
      } else {
        updatedData.earning_members_details = [];
        updatedData.num_earning_members = data.earning_members || "0";
      }
updatedData.is_single_parent = data.is_single_parent ? "YES" : "NO";
updatedData.does_work = data.does_work ? "YES" : "NO";
updatedData.has_scholarship = data.has_scholarship ? "YES" : "NO";

      setFormData(prev => ({
        ...prev,
        ...updatedData
      }));

    };

    fetchStudent();
  }, [id, isEditMode]);
  const yesNoToBool = (val) => {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val.toUpperCase() === "YES";
  return false;
};


  const handleSubmit = async (e) => {
    e.preventDefault();

    // run current full validation
    const newErrors = runFullValidation();
    setErrors(prev => ({ ...prev, ...newErrors }));

    // if any errors present, alert and block submission
    if (Object.keys(newErrors).length > 0) {
      // popup alert summarizing
      const inlineMsg = newErrors._missing ? newErrors._missing : "Please correct the highlighted fields.";
      alert("Please correct the errors before submitting.\n\n" + inlineMsg);
      // scroll to first error field if possible
      const firstField = Object.keys(newErrors).find(k => k !== "_missing");
      if (firstField) {
        const el = document.querySelector(`[name="${firstField}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    // Ensure volunteer is logged in (we attach email)
    if (!volunteerEmail) {
      alert("⚠️ Volunteer not logged in — student will still be saved locally if needed. Please sign in.");
      // but proceed to save? We'll stop to avoid orphan records.
      return;
    }

    try {
      // Upload files to Supabase storage and get URLs
      const uploadedFiles = {};
      for (const [key, file] of Object.entries(files)) {
        if (file) {
          const url = await uploadFileToStorage(file, key);
          uploadedFiles[key] = url;
        }
      }
const doesWork = yesNoToBool(formData.does_work);
const hasScholarship = yesNoToBool(formData.has_scholarship);
const isSingleParent = yesNoToBool(formData.is_single_parent);
      // Prepare payload for Supabase. Map form fields to table columns.
     const payload = {
  volunteer_email: volunteerEmail,
  volunteer_name: formData.volunteer_name,
  volunteer_contact: formData.volunteer_contact,

  first_name: formData.first_name,
  middle_name: formData.middle_name || null,
  last_name: formData.last_name,

  dob: formData.dob || null,
  age: parseInt(formData.age),
  pob: formData.pob || null,

  camp_name: formData.camp_name || null,
  camp_date: formData.camp_date || null,

  nationality: formData.nationality || null,
  address: formData.address,

  class: formData.class,

  educationcategory:
    formData.educationcategory === "Other"
      ? formData.educationcategory_custom
      : formData.educationcategory || null,

  educationsubcategory:
    formData.educationsubcategory === "Other"
      ? formData.educationsubcategory_custom
      : formData.educationsubcategory || null,

  educationyear:
    formData.educationyear === "Other"
      ? formData.educationyear_custom
      : formData.educationyear || null,

  school: formData.school,
  branch: formData.branch || null,

  prev_percent: parseFloat(formData.prev_percent) || null,
  present_percent: parseFloat(formData.present_percent) || null,

  email: formData.email,
  contact: formData.contact,
  whatsapp: formData.whatsapp,
  student_contact: formData.student_contact || null,

  num_family_members: parseInt(formData.num_family_members) || 0,
  family_members_details: formData.family_members_details,

earning_members: parseInt(formData.num_earning_members) || 0,

  earning_members_details: formData.earning_members_details,

  fee: formData.fee || null,
  fee_structure: formData.fee_structure,

is_single_parent: isSingleParent,

does_work: doesWork,
job: doesWork ? formData.job : null,

has_scholarship: hasScholarship,
scholarship: hasScholarship ? formData.scholarship : null,


  aspiration: formData.aspiration || null,
  academic_achievements: formData.academic_achievements || null,
  non_academic_achievements: formData.non_academic_achievements || null,

  years_area: formData.years_area || null,

  account_no: formData.account_no || null,
  bank_name: formData.bank_name || null,
  bank_branch: formData.bank_branch || null,
  ifsc_code: formData.ifsc_code || null,

  special_remarks: formData.special_remarks || null,

  school_id_url: uploadedFiles.school_id || null,
  aadhaar_url: uploadedFiles.aadhaar || null,
  income_proof_url: uploadedFiles.income_proof || null,
  marksheet_url: uploadedFiles.marksheet || null,
  passport_photo_url: uploadedFiles.passport_photo || null,
  fees_receipt_url: uploadedFiles.fees_receipt || null,
  volunteer_signature_url: uploadedFiles.volunteer_signature || null,
  student_signature_url: uploadedFiles.student_signature || null,
};

      // Insert into Supabase
      let result;

      if (isEditMode && id) {
        // ✅ UPDATE existing record
        result = await supabase
          .from("student_form_submissions")
          .update(payload)
          .eq("id", parseInt(id));
      } else {
        // ✅ INSERT new record
        result = await supabase
          .from("student_form_submissions")
          .insert([payload]);
      }

      if (result.error) {
        console.error("Supabase save error:", result.error);
        alert("❌ Error saving student: " + result.error.message);
        return;
      }

      // Success
      alert("🎉 Form submitted successfully!");
      setSuccessMessage("Form submitted successfully!");
      // Navigate back to dashboard and force refresh to show new form
      navigate('/volunteer-dashboard');

      // optionally reset form
      setFormData({
        first_name: "",
        last_name: "",
        middle_name: "",
        dob: "",
        age: "",
        pob: "",
        camp_name: "",
        nationality: "",
        address: "",
        class: "",
        educationcategory: "",
        educationsubcategory: "",
        educationyear: "",
        email: "",
        contact: "",
        whatsapp: "",
        student_contact: "",
        school: "",
        branch: "",
        prev_percent: "",
        present_percent: "",
        fee: "",
        fee_structure: "",
        job: "",
        aspiration: "",
        scholarship: "",
        certificates: "",
        years_area: "",
        num_family_members: "",
        family_members_details: [],
        num_earning_members: "",
        earning_members_details: [],
        account_no: "",
        bank_name: "",
        bank_branch: "",
        ifsc_code: "",
        special_remarks: "",
        is_single_parent: "",
does_work: "",
has_scholarship: "",

      });
      setFiles({
        school_id: null,
        aadhaar: null,
        income_proof: null,
        marksheet: null,
        passport_photo: null,
        fees_receipt: null,
        volunteer_signature: null,
        student_signature: null,
      });
      setErrors({});
    } catch (err) {
      console.error("Unexpected error on submit:", err);
      alert("❌ Unexpected error occurred. Check console.");
    }
  };

  const renderUploadField = (label, field) => (
    <div className="upload-field">
      <span className="label">{label}</span>
      <div className="upload-controls">
        <label className="upload-btn">
          <span className="plus-icon">+</span>
          <input type="file" style={{ display: "none" }} onChange={(e) => handleFileChange(e, field)} />
        </label>
        {files[field] && (
          <span className="file-info">
            <span className="tick">✓</span> {files[field].name}
          </span>
        )}
      </div>
    </div>
  );

  // Render family members details dynamically
  const renderFamilyMembers = () => {
    const num = parseInt(formData.num_family_members) || 0;
    
    if (num <= 0) return null;
    
    return (
      <div className="family-members-section">
        <h3>Family Details</h3>
        {Array.from({ length: num }, (_, index) => (
          <div key={index} className="family-member-card">
            <div className="form-group">
              <label>
                <span className="field-label"> Name<span className="required">*</span></span>
                <input
                  type="text"
                  name={`family_member_name_${index}`}
                  value={formData.family_members_details[index]?.name || ""}
                  onChange={handleInputChange}
                  placeholder="Enter Name"
                />
              </label>
              <label>
                <span className="field-label">Relationship with Applicant<span className="required">*</span></span>
                <input
                  type="text"
                  name={`family_member_relation_${index}`}
                  value={formData.family_members_details[index]?.relation || ""}
                  onChange={handleInputChange}
                  placeholder="Enter relationship"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render earning members details dynamically
  const renderEarningMembers = () => {
    const num = parseInt(formData.num_earning_members) || 0;
    
    if (num <= 0) return null;
    
    return (
      <div className="earning-members-section">
        <h3>Details of Earning Family Members</h3>
        {Array.from({ length: num }, (_, index) => (
          <div key={index} className="earning-member-group">
            <div className="form-group">
              <label>
                <span className="field-label">Relation<span className="required">*</span></span>
                <input
                  type="text"
                  name={`earning_member_name_${index}`}
                  value={formData.earning_members_details[index]?.name || ""}
                  onChange={handleInputChange}
                />
              </label>
              <label>
                <span className="field-label"> Occupation<span className="required">*</span></span>
                <input
                  type="text"
                  name={`earning_member_occ_${index}`}
                  value={formData.earning_members_details[index]?.occupation || ""}
                  onChange={handleInputChange}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <button className="back-btn" onClick={() => navigate('/volunteer-dashboard')}>Back to Volunteer Dashboard</button>
       
      <div className="form-container">
        <h1 className="form-title">STUDENT APPLICATION FORM</h1>

      {successMessage && (
        <div className="success-message" style={{ color: "green", marginBottom: "1rem", fontWeight: "bold" }}>
          {successMessage}
        </div>
      )}

        {/* Volunteer Details */}
        <div className="section">
          <h2>1. Volunteer Details</h2>
          <div className="form-group">
            <label>
              <span className="field-label">Name<span className="required">*</span></span>
              <input
                type="text"
                name="volunteer_name"
                value={formData.volunteer_name}
                onChange={handleInputChange}
                className={errors.volunteer_name ? "input-error" : ""}
                placeholder="Enter Name"
                required
              />
              {errors.volunteer_name && <p className="error-text">{errors.volunteer_name}</p>}
            </label>
            <label>
              <span className="field-label">Contact Number<span className="required">*</span></span>
              <input
                type="text"
                name="volunteer_contact"
                value={formData.volunteer_contact || ""}
                onChange={handleInputChange}
                placeholder="Enter Contact Number"
                maxLength={10}
                className={errors.volunteer_contact ? "input-error" : ""}
                required
              />
              {errors.volunteer_contact && <p className="error-text">{errors.volunteer_contact}</p>}
            </label>
          </div>
        </div>
        



      <form onSubmit={handleSubmit}>
        {/* Personal Data */}
        <div className="section">
          <h2>2. Student Data</h2>
          <div className="form-group">
            <label>
              <span className="field-label">First Name<span className="required">*</span></span>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
                className={errors.first_name ? "input-error" : ""}
                required
              />
              {errors.first_name && <p className="error-text">{errors.first_name}</p>}
            </label>
            <label>
              <span className="field-label">Middle Name</span>
              <input
                type="text"
                name="middle_name"
                value={formData.middle_name}
                onChange={handleInputChange}
                className={errors.middle_name ? "input-error" : ""}
              />
              {errors.middle_name && <p className="error-text">{errors.middle_name}</p>}
            </label>
            <label>
              <span className="field-label">Last Name<span className="required">*</span></span>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                className={errors.last_name ? "input-error" : ""}
                required
              />
              {errors.last_name && <p className="error-text">{errors.last_name}</p>}
            </label>
          </div>

          <div className="form-group">
            <label>
              <span className="field-label">Date of Birth</span>
              <input
                type="date"
                name="dob"
                value={formData.dob}
                onChange={handleInputChange}
                min="1980-01-01"
                max="2024-12-31"
                required
              />
            </label>
            <label>
              <span className="field-label">Age<span className="required">*</span></span>
              <input type="number" name="age" value={formData.age} min={6} readOnly className="readonly-age" onChange={handleInputChange} />
              {errors.age && <p className="error-text">{errors.age}</p>}
            </label>
            <label>
              <span className="field-label">Name of Camp<span className="required">*</span></span>
              <input type="text" name="camp_name" value={formData.camp_name} onChange={handleInputChange} />
            </label>
            <label>
              <span className="field-label">Date of Camp<span className="required">*</span></span>
              <input type="date" name="camp_date" value={formData.camp_date} onChange={handleInputChange} required />
            </label>
            <label>
              <span className="field-label">Student's Address<span className="required">*</span></span>
              <input type="text" name="address" value={formData.address} onChange={handleInputChange} required />
            </label>
          </div>

          <div className="form-group">
            <label>
              <span className="field-label">Parent's Contact Number<span className="required">*</span></span>
              <input
                type="text"
                name="contact"
                value={formData.contact}
                onChange={handleInputChange}
                maxLength={10}
                className={errors.contact ? "input-error" : ""}
                required
              />
              {errors.contact && <p className="error-text">{errors.contact}</p>}
            </label>
            <label>
              <span className="field-label">Whatsapp Number(For Communication)<span className="required">*</span></span>
              <input
                type="text"
                name="whatsapp"
                value={formData.whatsapp}
                onChange={handleInputChange}
                maxLength={10}
                className={errors.whatsapp ? "input-error" : ""}
                required
              />
              {errors.whatsapp && <p className="error-text">{errors.whatsapp}</p>}
            </label>
            <label>
              <span className="field-label">Student's Contact Number</span>
              <input
                type="text"
                name="student_contact"
                value={formData.student_contact || ""}
                onChange={handleInputChange}
                maxLength={10}
                className={errors.student_contact ? "input-error" : ""}
              />
              {errors.student_contact && <p className="error-text">{errors.student_contact}</p>}
            </label>
            <label>
              <span className="field-label">Email(For Further Communication)<span className="required">*</span></span>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={errors.email ? "input-error" : ""}
                required
              />
              {errors.email && <p className="error-text">{errors.email}</p>}
            </label>
          </div>

          {/* --- Single Parent Question --- */}
          <div className="form-group">
            <label>
              <span className="field-label">Is she currently being raised by a single parent or guardian?<span className="required">*</span></span>
            </label>

            <div className="radio-inline">
              <label>
                <input
                  type="radio"
                  name="is_single_parent"
                  value="YES"
                  checked={formData.is_single_parent === "YES"}
                  onChange={handleInputChange}
                />
                Yes
              </label>

              <label>
                <input
                  type="radio"
                  name="is_single_parent"
                  value="NO"
                  checked={formData.is_single_parent === "NO"}
                  onChange={handleInputChange}
                />
                No
              </label>
            </div>
            {errors.is_single_parent && <p className="error-text">{errors.is_single_parent}</p>}
          </div>

          <div className="form-group">
            <label className="full-width">
              <span className="field-label">Total number of family members?<span className="required">*</span></span>
              <input
                type="number"
                name="num_family_members"
                value={formData.num_family_members}
                onChange={handleInputChange}
                min="1"
                max="15"
                placeholder="Enter total number of family members"
                required
              />
            </label>
            
            {renderFamilyMembers()}
            
            {errors.family_members && <p className="error-text">{errors.family_members}</p>}
            
            <label className="full-width">
              <span className="field-label">Number of earning members in the family?<span className="required">*</span></span>
              <input 
                type="number" 
                name="num_earning_members" 
                value={formData.num_earning_members} 
                onChange={handleInputChange} 
                min="0" 
                max="10" 
                placeholder="Enter number of earning members" 
                required 
              />
            </label>
            
            {renderEarningMembers()}
            
            {errors.earning_members && <p className="error-text">{errors.earning_members}</p>}
          </div>
        </div>

        {/* Academic Data */}
        <div className="section">
          <h2>3. Academic Data</h2>
          <div className="form-group">
            <label>
              <span className="field-label">Name of School/College/University(with Branch Name)<span className="required">*</span></span>
              <input type="text" name="school" value={formData.school} onChange={handleInputChange} required />
            </label>
          </div>

          <EducationDropdown
            educationcategory={formData.educationcategory}
            educationsubcategory={formData.educationsubcategory}
            educationyear={formData.educationyear}
            educationcategory_custom={formData.educationcategory_custom}
            educationsubcategory_custom={formData.educationsubcategory_custom}
            educationyear_custom={formData.educationyear_custom}
            onChange={handleInputChange}
          />

          <div className="form-group">
            <label>
              <span className="field-label">Percentage scored in previous academic year (Not CGPA)<span className="required">*</span></span>
              <input 
                type="text" 
                name="prev_percent" 
                value={formData.prev_percent} 
                onChange={handleInputChange} 
                className={errors.prev_percent ? "input-error" : ""}
                required 
              />
              {errors.prev_percent && <p className="error-text">{errors.prev_percent}</p>}
            </label>
            <label>
              <span className="field-label">Percentage scored in present academic year (Not CGPA)<span className="required">*</span></span>
              <input 
                type="text" 
                name="present_percent" 
                value={formData.present_percent} 
                onChange={handleInputChange} 
                className={errors.present_percent ? "input-error" : ""}
                required 
              />
              {errors.present_percent && <p className="error-text">{errors.present_percent}</p>}
            </label>
          </div>

          <div className="form-group">
            <label className="full-width">
              <span className="field-label">Tuition Fee<span className="required">*</span></span>
              <input 
                type="text" 
                name="fee_structure" 
                value={formData.fee_structure || ""} 
                onChange={handleInputChange} 
                className={errors.fee_structure ? 'input-error' : ''} 
                required 
                placeholder="Enter tuition fee amount"
              />
              {errors.fee_structure && <p className="error-text">{errors.fee_structure}</p>}
            </label>
          </div>
        </div>

        {/* Other Details */}
        <h2>4. Other Details</h2>

        {/* --- Does she work to support her family? --- */}
        <div className="form-group">
          <label>
            <span className="field-label">Does she work to support her family?<span className="required">*</span></span>
          </label>

          <div className="radio-inline">
            <label>
              <input
                type="radio"
                name="does_work"
                value="YES"
                checked={formData.does_work === "YES"}
                onChange={handleInputChange}
              />
              Yes
            </label>

            <label>
              <input
                type="radio"
                name="does_work"
                value="NO"
                checked={formData.does_work === "NO"}
                onChange={handleInputChange}
              />
              No
            </label>
          </div>
          {errors.does_work && <p className="error-text">{errors.does_work}</p>}

          {formData.does_work === "YES" && (
            <label className="full-width">
              <span className="field-label">What kind of job does she do?<span className="required">*</span></span>
              <input
                type="text"
                name="job"
                value={formData.job}
                onChange={handleInputChange}
                placeholder="Describe her occupation"
              />
            </label>
          )}
        </div>

        {/* --- Career Aspiration --- */}
        <div className="form-group">
          <label className="full-width">
            <span className="field-label">What are her career aspirations and planned courses for the next two years?</span>
            <input
              type="text"
              name="aspiration"
              value={formData.aspiration}
              onChange={handleInputChange}
            />
          </label>
        </div>

        {/* --- Scholarship Question --- */}
        <div className="form-group">
          <label>
            <span className="field-label">Is she getting any scholarship / Govt help / financial assistance?<span className="required">*</span></span>
          </label>

          <div className="radio-inline">
            <label>
              <input
                type="radio"
                name="has_scholarship"
                value="YES"
                checked={formData.has_scholarship === "YES"}
                onChange={handleInputChange}
              />
              Yes
            </label>

            <label>
              <input
                type="radio"
                name="has_scholarship"
                value="NO"
                checked={formData.has_scholarship === "NO"}
                onChange={handleInputChange}
              />
              No
            </label>
          </div>
          {errors.has_scholarship && <p className="error-text">{errors.has_scholarship}</p>}

          {formData.has_scholarship === "YES" && (
            <label className="full-width">
              <span className="field-label">Scholarship / Assistance Details<span className="required">*</span></span>
              <input
                type="text"
                name="scholarship"
                value={formData.scholarship}
                onChange={handleInputChange}
                placeholder="Enter Scholarship Details"
                className={errors.scholarship ? "input-error" : ""}
              />
              {errors.scholarship && <p className="error-text">{errors.scholarship}</p>}
            </label>
          )}
        </div>

        {/* --- Other Questions --- */}
        <div className="form-group">
          <label className="full-width">
            Academic Achievements
            <input
              type="text"
              name="academic_achievements"
              value={formData.academic_achievements}
              onChange={handleInputChange}
            />
          </label>

          <label className="full-width">
            Non-Academic Achievements
            <input
              type="text"
              name="non_academic_achievements"
              value={formData.non_academic_achievements}
              onChange={handleInputChange}
            />
          </label>

          <label className="full-width">
            From how long are they living in this area? (Is she a migrant worker?)
            <input
              type="text"
              name="years_area"
              value={formData.years_area}
              onChange={handleInputChange}
            />
          </label>
        </div>

        {/* Document Upload */}
        <div className="section">
          <h2>5. Document Upload (Size Limit: 50 MB)</h2>

          {renderUploadField("School / College ID", "school_id")}
          {renderUploadField("Aadhaar Card", "aadhaar")}
          {renderUploadField("Income Proof", "income_proof")}
          {renderUploadField("Marks Sheet (Last & Present Year)", "marksheet")}
          {renderUploadField("Passport Size Photo", "passport_photo")}

          <div className="upload-field">
            <span className="bank-details-title">Bank Account Details</span>
            <div className="form-group">
              <label>
                <span className="field-label">Account No.<span className="form-group"></span></span>
                <input
                  type="text"
                  name="account_no"
                  value={formData.account_no || ""}
                  onChange={handleInputChange}
                  className={errors.account_no ? "input-error" : ""}
                  
                />
                {errors.account_no && <p className="error-text">{errors.account_no}</p>}
              </label>
              <label>
                <span className="field-label">Bank Name<span className="form-group"></span></span>
                <input type="text" name="bank_name" value={formData.bank_name || ""} onChange={handleInputChange}  />
              </label>
              <label>
                <span className="field-label">Branch<span className="form-group"></span></span>
                <input type="text" name="bank_branch" value={formData.bank_branch || ""} onChange={handleInputChange}  />
              </label>
              <label>
                <span className="field-label">Enter valid IFSC Code<span className="form-group"></span></span>
                <input
                  type="text"
                  name="ifsc_code"
                  value={formData.ifsc_code || ""}
                  onChange={handleInputChange}
                  className={errors.ifsc_code ? "input-error" : ""}
                  
                />
                {errors.ifsc_code && <p className="error-text">{errors.ifsc_code}</p>}
              </label>
            </div>
          </div>

          {renderUploadField("Fees Receipt (Upload / Text)", "fees_receipt")}
        </div>

        {/* Special Remarks */}
        <div className="section">
          <h2>6. Special Remarks</h2>
          <textarea name="special_remarks" value={formData.special_remarks} onChange={handleInputChange} placeholder="Any additional notes or comments" rows={4} style={{ width: "100%" }}></textarea>
        </div>

        <div className="submit-container">
          <button type="submit">{isEditMode ? "Save" : "Submit Application"}</button>
        </div>
      </form>
      </div>
    </div>
  );
}