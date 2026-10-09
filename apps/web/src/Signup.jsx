import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AudioLines, ArrowRight, Sparkles, Lock, Mail, User, ShieldCheck, Github } from 'lucide-react';
import { useAuth } from './AuthContext';
import ThemeToggle from './ThemeToggle';
import './auth.css';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [useCase, setUseCase] = useState('Dictation');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSignup = (e) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setToast('Please fill in all required fields.');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    setLoading(true);
    setTimeout(() => {
      signup(name, email, password, 'English (US)');
      setLoading(false);
      navigate('/dashboard');
    }, 600);
  };

  const handleSocial = (provider) => {
    setLoading(true);
    setTimeout(() => {
      signup(`${provider} User`, `user_${Date.now()}@wisprflow.ai`, 'oauth-token', 'English (US)');
      setLoading(false);
      navigate('/dashboard');
    }, 500);
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
              <span className="logo-word">wispr<span>flow</span></span>
            </Link>
            <div className="auth-badge">
              <Sparkles size={13}/>
              <span>Start Free • No credit card</span>
            </div>
            <h1>Create your Flow account</h1>
            <p>Join thousands of writers, developers, and founders speaking 4× faster than typing.</p>
          </div>

          {toast && (
            <div className="auth-toast">
              <span>{toast}</span>
            </div>
          )}

          <div className="social-login-grid">
            <button type="button" className="btn-social" onClick={() => handleSocial('Google')}>
              <svg width="17" height="17" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5c1.7 0 3 .6 4 1.5l3-3C17.1 1.7 14.7 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"/>
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
                <path fill="#FBBC05" d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8s.2-2 .4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"/>
                <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"/>
              </svg>
              <span>Google</span>
            </button>
            <button type="button" className="btn-social" onClick={() => handleSocial('Apple')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.36c.64-.78 1.08-1.86.96-2.95-1 .04-2.13.66-2.79 1.44-.57.66-1.07 1.76-.94 2.82 1.11.09 2.18-.56 2.77-1.31"/>
              </svg>
              <span>Apple</span>
            </button>
            <button type="button" className="btn-social" onClick={() => handleSocial('GitHub')}>
              <Github size={17}/>
              <span>GitHub</span>
            </button>
          </div>

          <div className="auth-divider">
            <span>OR SIGN UP WITH EMAIL</span>
          </div>

          <form onSubmit={handleSignup} className="auth-form">
            <div className="form-group">
              <label htmlFor="signup-name">Full Name</label>
              <div className="input-wrap">
                <User size={16} className="input-icon"/>
                <input 
                  id="signup-name"
                  type="text" 
                  placeholder="Alex Rivera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="signup-email">Email Address</label>
              <div className="input-wrap">
                <Mail size={16} className="input-icon"/>
                <input 
                  id="signup-email"
                  type="email" 
                  placeholder="alex.rivera@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="signup-password">Password</label>
              <div className="input-wrap">
                <Lock size={16} className="input-icon"/>
                <input 
                  id="signup-password"
                  type="password" 
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>

            <button type="submit" className="button button-auth-primary" disabled={loading}>
              {loading ? 'Creating account...' : <>Create Free Account <ArrowRight size={16}/></>}
            </button>
          </form>

          <div className="auth-footer">
            <p>Already have an account? <Link to="/login">Sign in here</Link></p>
            <div className="auth-security-note">
              <ShieldCheck size={14}/>
              <span>Privacy first • Your audio is encrypted & never sold</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
