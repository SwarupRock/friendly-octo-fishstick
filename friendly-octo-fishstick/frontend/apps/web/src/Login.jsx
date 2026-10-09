import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AudioLines, ArrowRight, Sparkles, Lock, Mail, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from './AuthContext';
import { errorMessage } from './lib/api';
import ThemeToggle from './ThemeToggle';
import './auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const { login, loginWithDemo } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setToast('Please enter your email and password.');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    setLoading(true);
    setToast('');
    try {
      await login(email, password);
      navigate('/workspace');
    } catch (error) {
      setToast(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    setToast('');
    try {
      await loginWithDemo();
      navigate('/workspace');
    } catch (error) {
      setToast(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <ThemeToggle />
      <div className="auth-ambient-glow" />
      
      <div className="auth-card-wrap">
        <div className="auth-card">
          <div className="auth-header">
            <Link to="/" className="auth-logo">
              <span className="logo-mark"><AudioLines size={20} strokeWidth={2.5}/></span>
              <span className="logo-word">Svarah<span>.AI</span></span>
            </Link>
            <div className="auth-badge">
              <Sparkles size={13}/>
              <span>AI Voice Workspace</span>
            </div>
            <h1>Welcome back</h1>
            <p>Log in to access your speech workspace, meeting notes, and dictionary.</p>
          </div>

          {toast && (
            <div className="auth-toast">
              <span>{toast}</span>
            </div>
          )}

          {/* Quick 1-Click Demo Login */}
          <div className="demo-login-box">
            <div className="demo-login-info">
              <Zap size={18} className="zap-icon"/>
              <div>
                <b>Instant Demo Access</b>
                <small>Sign in without a password — available while the backend runs in mock mode</small>
              </div>
            </div>
            <button
              type="button"
              className="btn-demo-quick"
              onClick={handleDemoLogin}
              disabled={loading}
            >
              {loading ? 'Logging in...' : <><span>Demo Login</span> <ArrowRight size={14}/></>}
            </button>
          </div>

          <div className="auth-divider">
            <span>OR CONTINUE WITH EMAIL</span>
          </div>

          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label htmlFor="login-email">Email Address</label>
              <div className="input-wrap">
                <Mail size={16} className="input-icon"/>
                <input 
                  id="login-email"
                  type="email" 
                  placeholder="alex.rivera@svarah.ai"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <div className="label-row">
                <label htmlFor="login-password">Password</label>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setToast('Password reset is not available yet — use Demo Login, or create a new account.');
                    setTimeout(() => setToast(''), 4500);
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <div className="input-wrap">
                <Lock size={16} className="input-icon"/>
                <input 
                  id="login-password"
                  type="password" 
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row-between">
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>Remember me for 30 days</span>
              </label>
            </div>

            <button type="submit" className="button button-auth-primary" disabled={loading}>
              {loading ? 'Signing in...' : <>Sign in to Svarah.AI <ArrowRight size={16}/></>}
            </button>
          </form>

          <div className="auth-footer">
            <p>Don't have an account yet? <Link to="/signup">Sign up for free</Link></p>
            <div className="auth-security-note">
              <ShieldCheck size={14}/>
              <span>Sessions are signed server-side — your facts stay locked to your account</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
