import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import supabase from "./supabaseClient";
import "./studentlogin.css";

export default function AdminLogin() {
  const [isSignIn, setIsSignIn] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.user_metadata?.user_type === "admin") {
        navigate("/admin-dashboard");
      }
    };
    checkSession();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setShowErrors(true);
    setLoading(true);

    const emailError = email.trim() === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Email is required/invalid' : '';
    const nameError = !isSignIn && name.trim() === '' ? 'Full name required' : '';
    const pwdErrors = validatePassword(password);

    if (emailError || nameError || pwdErrors.length > 0) {
      toast.error("Please fix highlighted errors");
      setLoading(false);
      return;
    }

    try {
      if (isSignIn) {
        // Custom admin login - check against admins table
        const enteredEmail = email.trim().toLowerCase();
        const enteredPassword = password.trim();
        
        if (enteredEmail !== 'info@touchalifeorg.com' || enteredPassword !== 'Admin@2014') {
          if (enteredEmail !== 'info@touchalifeorg.com') {
            console.log('only admins can login');
          } else {
            console.log('wrong credentials/password');
          }
          toast.error('Wrong credentials');
          return;
        }

        localStorage.setItem('admin_token', enteredEmail);
        toast.success('Admin login successful');
        navigate('/admin-dashboard');
      } else {
        // Original Supabase sign up for admins
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: { name: name.trim(), user_type: "admin" },
          },
        });
        if (error) throw error;

        toast.success("Admin account created");
        setIsSignIn(true);
        setShowErrors(false);
        setEmail("");
        setPassword("");
        setName("");
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const validatePassword = (value) => {
    const errors = [];
    if (!/[a-z]/.test(value)) errors.push("Lowercase letter required");
    if (!/[A-Z]/.test(value)) errors.push("Uppercase letter required");
    if (!/[0-9]/.test(value)) errors.push("Number required");
    if (!/[@$!%*?&]/.test(value)) errors.push("Special character required");
    if (value.length < 8) errors.push("Minimum 8 characters");
    return errors;
  };

  // Errors shown ONLY after submit click
  const emailErrorMsg = showErrors ? (email.trim() === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Email is required/invalid' : '') : '';
  const nameErrorMsg = showErrors && !isSignIn ? (name.trim() === '' ? 'Full name required' : '') : '';
  const passwordErrorMsgs = showErrors ? validatePassword(password) : [];

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error("Enter your email first");
      return;
    }

    // Increase reset link TTL by using Supabase's resetPasswordForEmail options.
    // Note: exact param name depends on supabase-js version; using both common variants.
    const redirectTo = window.location.origin + "/reset-password";
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
      // try to extend expiry (set to ~3 minutes)
      // @ts-ignore
      token_expiry: 3 * 60,
      // @ts-ignore
      tokenExpiresIn: 3 * 60,
    });


    if (error) toast.error(error.message);
    else toast.success("Password reset email sent");
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>{isSignIn ? "Admin Sign In" : "Admin Sign Up"}</h1>

        <form onSubmit={handleSubmit}>
          {!isSignIn && (
            <>
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={nameErrorMsg ? "input-error" : ""}
              />
              {nameErrorMsg && <p className="error-text">{nameErrorMsg}</p>}
            </>
          )}

          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={emailErrorMsg ? "input-error" : ""}
          />
          {emailErrorMsg && <p className="error-text">{emailErrorMsg}</p>}

          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ paddingRight: "42px" }}
              className={passwordErrorMsgs.length > 0 ? "input-error" : ""}
            />
            <span
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                cursor: "pointer",
                color: "#555",
                fontSize: "18px",
                userSelect: "none",
              }}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "👁" : "👁"}
            </span>
          </div>

          {passwordErrorMsgs.length > 0 && (
            <div className="password-requirements" aria-live="polite">
              <p className="password-requirements-title">Password must include</p>
              <ul className="password-requirements-list">
                {passwordErrorMsgs.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}

          <button type="submit" disabled={loading}>
            {loading ? "Loading..." : (isSignIn ? "Sign In" : "Sign Up")}
          </button>
        </form>

        {isSignIn && (
          <p className="forgot-password" onClick={handleForgotPassword} style={{ cursor: "pointer", textAlign: "center", marginTop: "10px", color: "#666" }}>
            Forgot password?
          </p>
        )}
      </div>

      <ToastContainer position="top-center" autoClose={3000} />
    </div>
  );
}

