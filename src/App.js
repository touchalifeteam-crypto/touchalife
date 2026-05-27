import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import { VolunteerProvider } from "./VolunteerContext";

import CoverPage from "./CoverPage";
import StudentLogin from "./studentlogin";
import LoginProfiles from "./loginProfiles";
import VolunteerLogin from "./volunteerlogin";
import DonorLogin from "./donorlogin";
import Register from "./register";
import StudentForm from "./studentform";
import StudentDashboard from "./studentdashboard";
import DonorDashboard from "./DonorDashboard";
import AdminDashboard from "./AdminDashboard";
import Adminlogin from "./adminlogin";
import VolunteerDashboard from "./VolunteerDashboard";
import ResetPassword from "./ResetPassword";
import SetPassword from "./SetPassword";
import { StudentProvider } from "./StudentContext";
import TestNotifications from "./test-notifications";

function App() {
  return (
    <Router>
      <VolunteerProvider>
        <Routes>
          {/* ✅ Only public page */}
          <Route path="/" element={<CoverPage />} />

          {/* 🔒 Protected Routes (cannot open by URL) */}
          {/* Public: role selection + login pages must be accessible without auth */}
          <Route path="/login" element={<LoginProfiles />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/volunteerlogin" element={<VolunteerLogin />} />


          {/* Protected dashboards */}
          <Route
            path="/volunteer-dashboard"
            element={
              <ProtectedRoute>
                <VolunteerDashboard />
              </ProtectedRoute>
            }
          />

          <Route path="/student-login" element={<StudentLogin />} />


          <Route
            path="/student-dashboard"
            element={
              <ProtectedRoute>
                <StudentProvider>
                  <StudentDashboard />
                </StudentProvider>
              </ProtectedRoute>
            }
          />
          <Route path="/test-notifications" element={<TestNotifications />} />


          <Route path="/donorlogin" element={<DonorLogin />} />


          <Route
            path="/donor-dashboard"
            element={
              <ProtectedRoute>
                <DonorDashboard />
              </ProtectedRoute>
            }
          />

          <Route path="/adminlogin" element={<Adminlogin />} />

          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />


          <Route
            path="/studentform"
            element={
              <ProtectedRoute>
                <StudentForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="/studentform/:id"
            element={
              <ProtectedRoute>
                <StudentForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="/register"
            element={
              <ProtectedRoute>
                <Register />
              </ProtectedRoute>
            }
          />

          <Route path="/reset-password" element={<ResetPassword />} />

          {/* ⭐ Catch all → always CoverPage */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </VolunteerProvider>
    </Router>
  );
}

export default App;

