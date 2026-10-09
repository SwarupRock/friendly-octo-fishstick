import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AudioLines, ArrowRight, Sparkles, Lock, Mail, User, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext';
import { errorMessage } from './lib/api';
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

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setToast('Please fill in all required fields.');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    if (password.length < 8) {
      setToast('Choose a password of at least 8 characters.');
      setTimeout(() => setToast(''), 3500);
      return;
    }
    setLoading(true);
    setToast('');
    try {
      await signup(name, email, password);
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
              <span>Start Free • No credit card</span>
            </div>
            <h1>Create your Svarah.AI account</h1>
            <p>Join thousands of writers, developers, and founders speaking 4× faster than typing.</p>
          </div>

          {toast && (
            <div className="auth-toast">
              <span>{toast}</span>
            </div>
          )}

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
