import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  AudioLines, Mic, MicOff, Sparkles, Copy, Check, Trash2, Plus, 
  Settings, Key, History, Users, BookOpen, Volume2, Globe, Shield, 
  Zap, LogOut, ArrowRight, Search, Play, Pause, ChevronRight,
  Sliders, Laptop, ExternalLink, CheckCircle2, MessageSquare, Terminal, Mail, FileText
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { getHealth } from './lib/api';
import VideoCarousel from './VideoCarousel';
import ThemeToggle from './ThemeToggle';
import DraggableWidgetGrid from './DraggableWidgetGrid.jsx';
import './auth.css';

export default function Dashboard() {
  const { 
    user, 
    logout, 
    updateUser, 
    addDictation, 
    deleteDictation, 
    addVocabulary, 
    removeVocabulary,
    toggleActionItem,
    addApiKey,
    deleteApiKey
  } = useAuth();
  
  const navigate = useNavigate();

  // If not logged in, redirect to login
  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  const [activeTab, setActiveTab] = useState('studio'); // 'studio' | 'history' | 'meetings' | 'vocabulary' | 'settings'
  const [toast, setToast] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Live Studio State
  const [isRecording, setIsRecording] = useState(false);
  const [recordTimer, setRecordTimer] = useState(0);
  const [studioLanguage, setStudioLanguage] = useState(user?.settings?.primaryLanguage || 'English (US)');
  const [studioTone, setStudioTone] = useState('Polished & Clean');
  const [transcriptText, setTranscriptText] = useState(
    'Flow transforms spoken thoughts into clean, publication-ready text in real time. Try dictating or selecting different rewrite styles!'
  );
  const [rawSpeechText, setRawSpeechText] = useState(
    'So um Flow basically transforms spoken thoughts into like clean publication ready text in real time you know.'
  );
  const [copied, setCopied] = useState(false);
  
  // Vocabulary input
  const [newWord, setNewWord] = useState('');
  const [newWordCategory, setNewWordCategory] = useState('Engineering');
  
  // New API Key input
  const [newKeyName, setNewKeyName] = useState('');

  // Draggable Stats Grid
  const [statItems, setStatItems] = useState([
    { id: 'words', size: 'sm', label: 'Words Spoken' },
    { id: 'speed', size: 'sm', label: 'Average Speed' },
    { id: 'time', size: 'sm', label: 'Time Saved' },
    { id: 'accuracy', size: 'sm', label: 'AI Accuracy' }
  ]);

  // Recording Timer
  const timerRef = useRef(null);
  useEffect(() => {
    if (isRecording) {
      setRecordTimer(0);
      timerRef.current = setInterval(() => {
        setRecordTimer(t => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // Backend connection status (Titan API)
  const [backendStatus, setBackendStatus] = useState({ state: 'checking', label: 'Checking backend' });
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const health = await getHealth();
        if (cancelled) return;
        setBackendStatus({
          state: 'online',
          label: `Backend ${health.mode} · v${health.version}`,
        });
      } catch {
        if (cancelled) return;
        setBackendStatus({ state: 'offline', label: 'Backend offline' });
      }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!user) return null;

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('Copied text to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Simulated Voice Dictation Generator
  const handleToggleRecord = () => {
    if (!isRecording) {
      setIsRecording(true);
      showToast('Listening... Speak naturally in ' + studioLanguage);
      
      // Simulate live incoming words
      const sampleInputs = {
        'Kannada (ಕನ್ನಡ)': {
          raw: 'ನಾಳೆ ಬೆಳಗ್ಗೆ ಹತ್ತು ಗಂಟೆಗೆ ಪ್ರಾಜೆಕ್ಟ್ ಮೀಟಿಂಗ್ ಇದೆ ದಯವಿಟ್ಟು ಎಲ್ಲರೂ ಭಾಗವಹಿಸಿ',
          clean: 'ನಾಳೆ ಬೆಳಗ್ಗೆ 10:00 ಗಂಟೆಗೆ ಪ್ರಾಜೆಕ್ಟ್ ಮೀಟಿಂಗ್ ಇದೆ. ದಯವಿಟ್ಟು ಎಲ್ಲರೂ ಭಾಗವಹಿಸಿ.'
        },
        'Hindi (हिन्दी)': {
          raw: 'अरे सुनो कल सुबह दस बजे प्रोजेक्ट की मीटिंग है सब लोग टाइम पर आ जाना',
          clean: 'कल सुबह 10:00 बजे प्रोजेक्ट की मीटिंग निर्धारित है। कृपया सभी समय पर उपस्थित रहें।'
        },
        'Tamil (தமிழ்)': {
          raw: 'நாளை காலை பத்து மணிக்கு புதிய திட்ட கூட்டம் உள்ளது அனைவரும் கலந்து கொள்ளுங்கள்',
          clean: 'நாளை காலை 10:00 மணிக்கு புதிய திட்ட கூட்டம் நடைபெற உள்ளது. அனைவரும் தவறாமல் கலந்து கொள்ளவும்.'
        },
        'Telugu (తెలుగు)': {
          raw: 'రేపు ఉదయం పది గంటలకు ప్రాజెక్ట్ మీటింగ్ ఉంది అందరూ హాజరు కావాలి',
          clean: 'రేపు ఉదయం 10:00 గంటలకు ప్రాజెక్ట్ మీటింగ్ కలదు. దయచేసి అందరూ హాజరు కావాల్సిందిగా కోరుతున్నాము.'
        },
        'English (US)': {
          raw: 'Hey so um can you make sure that the updated billing checkout page gets pushed before the investor demo on Friday because we really need the live conversion tracking working...',
          clean: 'Could you ensure the updated billing checkout page is deployed ahead of Friday’s investor demo? We need live conversion tracking fully active.'
        }
      };

      const selected = sampleInputs[studioLanguage] || sampleInputs['English (US)'];

      setTimeout(() => {
        setRawSpeechText(selected.raw);
        setTranscriptText(selected.clean);
      }, 3500);

    } else {
      setIsRecording(false);
      showToast('Transcription polished & saved!');
      
      // Auto-save to recent dictations
      addDictation({
        title: `Dictation in ${studioLanguage}`,
        tag: 'Studio',
        wordCount: transcriptText.split(' ').length,
        duration: `0:${recordTimer < 10 ? '0' + recordTimer : recordTimer}`,
        language: studioLanguage,
        cleanText: transcriptText,
        rawText: rawSpeechText,
      });
    }
  };

  const handleToneChange = (tone) => {
    setStudioTone(tone);
    if (tone === 'Bullet Points') {
      setTranscriptText('• Updated billing checkout page deployment\n• Complete ahead of Friday investor demo\n• Ensure live conversion tracking is verified');
    } else if (tone === 'Executive Summary') {
      setTranscriptText('Action required: Deploy updated checkout page prior to Friday investor presentation to enable real-time conversion metrics.');
    } else if (tone === 'Code Prompt') {
      setTranscriptText('Implement and verify live conversion tracking events inside the Stripe billing checkout webhook handler.');
    } else {
      setTranscriptText('Could you ensure the updated billing checkout page is deployed ahead of Friday’s investor demo? We need live conversion tracking fully active.');
    }
    showToast(`Transformed tone to: ${tone}`);
  };

  const handleAddWord = (e) => {
    e.preventDefault();
    if (newWord.trim()) {
      addVocabulary(newWord.trim(), newWordCategory);
      setNewWord('');
      showToast(`Added "${newWord}" to vocabulary!`);
    }
  };

  const handleAddApiKey = (e) => {
    e.preventDefault();
    if (newKeyName.trim()) {
      addApiKey(newKeyName.trim());
      setNewKeyName('');
      showToast('Created new API Secret Key!');
    }
  };

  const filteredDictations = (user.recentDictations || []).filter(d => 
    d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.cleanText.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="dash-root">
      {/* Top Notification Toast */}
      {toast && (
        <div className="dash-toast">
          <Sparkles size={14} />
          <span>{toast}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="dash-nav">
        <div className="dash-nav-left">
          <Link to="/" className="dash-logo">
            <span className="logo-mark"><AudioLines size={18} strokeWidth={2.5}/></span>
            <span className="logo-word">wispr<span>flow</span></span>
          </Link>
          <div className={`dash-status-pill ${backendStatus.state}`}>
            <span className="status-live-dot"/>
            <span>{backendStatus.label}</span>
          </div>
        </div>

        <div className="dash-nav-center">
          <div className="dash-shortcut-badge">
            <Laptop size={13}/>
            <span>Global Shortcut:</span>
            <code>{user.settings?.shortcut || '⌘ + D'}</code>
          </div>
        </div>

        <div className="dash-nav-right">
          <ThemeToggle />
          <div className="user-profile-menu">
            <div className="user-avatar-pill">
              <span className="avatar-circle">{user.avatar || 'AR'}</span>
              <div className="user-meta hide-mobile">
                <b>{user.name}</b>
                <span className="badge-pro">{user.plan}</span>
              </div>
            </div>
            <button 
              className="btn-logout" 
              onClick={() => {
                logout();
                navigate('/');
              }} 
              title="Log out"
            >
              <LogOut size={16}/>
              <span className="hide-mobile">Log out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Layout */}
      <div className="dash-container">
        
        {/* Sidebar Tabs */}
        <aside className="dash-sidebar">
          <div className="sidebar-group">
            <span className="sidebar-label">WORKSPACE</span>
            <button 
              className={`sidebar-tab ${activeTab === 'studio' ? 'active' : ''}`}
              onClick={() => setActiveTab('studio')}
            >
              <Mic size={17} />
              <span>Voice Studio</span>
              {isRecording && <span className="rec-pulse-mini" />}
            </button>
            <button 
              className={`sidebar-tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <History size={17} />
              <span>Dictations & Notes</span>
              <span className="tab-count">{user.recentDictations?.length || 0}</span>
            </button>
            <button 
              className={`sidebar-tab ${activeTab === 'meetings' ? 'active' : ''}`}
              onClick={() => setActiveTab('meetings')}
            >
              <Users size={17} />
              <span>Notetaker Meetings</span>
              <span className="tab-count">{user.meetings?.length || 0}</span>
            </button>
            <button 
              className={`sidebar-tab ${activeTab === 'vocabulary' ? 'active' : ''}`}
              onClick={() => setActiveTab('vocabulary')}
            >
              <BookOpen size={17} />
              <span>Custom Vocabulary</span>
              <span className="tab-count">{user.vocabulary?.length || 0}</span>
            </button>
            <button 
              className={`sidebar-tab ${activeTab === 'videos' ? 'active' : ''}`}
              onClick={() => setActiveTab('videos')}
            >
              <Play size={17} />
              <span>Generated Videos</span>
            </button>
          </div>

          <div className="sidebar-group">
            <span className="sidebar-label">SYSTEM</span>
            <button 
              className={`sidebar-tab ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={17} />
              <span>Settings & API</span>
            </button>
          </div>

          <div className="sidebar-footer-card">
            <div className="card-top">
              <Zap size={16} className="lime-text"/>
              <b>{user.plan}</b>
            </div>
            <p>Unlimited high-speed dictation & Indic model inference active.</p>
            <Link to="/pricing" className="btn-manage-sub">Manage Subscription</Link>
          </div>
        </aside>

        {/* Dashboard Main Workspace */}
        <main className="dash-main">
          
          {/* Quick Stats Bar (Draggable Widget Grid) */}
          <DraggableWidgetGrid 
            items={statItems}
            onChange={setStatItems}
            maxColumns={4}
            cellSize={200}
            gap={14}
            radius={16}
            className="dash-stats-draggable-grid"
            renderItem={(item) => {
              if (item.id === 'words') {
                return (
                  <div className="stat-card" style={{ border: 'none', background: 'transparent', height: '100%' }}>
                    <span className="stat-label">WORDS SPOKEN</span>
                    <div className="stat-val">{(user.stats?.wordsDictated || 84920).toLocaleString()}</div>
                    <span className="stat-sub">↑ 4,200 words this week</span>
                  </div>
                );
              }
              if (item.id === 'speed') {
                return (
                  <div className="stat-card" style={{ border: 'none', background: 'transparent', height: '100%' }}>
                    <span className="stat-label">AVERAGE SPEED</span>
                    <div className="stat-val">{user.stats?.wpmAverage || 218} <small>WPM</small></div>
                    <span className="stat-sub highlight">4.8× faster than typing</span>
                  </div>
                );
              }
              if (item.id === 'time') {
                return (
                  <div className="stat-card" style={{ border: 'none', background: 'transparent', height: '100%' }}>
                    <span className="stat-label">TIME SAVED</span>
                    <div className="stat-val">{user.stats?.timeSavedHours || 38.5} <small>Hours</small></div>
                    <span className="stat-sub">Based on 45 WPM keyboard baseline</span>
                  </div>
                );
              }
              if (item.id === 'accuracy') {
                return (
                  <div className="stat-card" style={{ border: 'none', background: 'transparent', height: '100%' }}>
                    <span className="stat-label">AI RECOGNITION ACCURACY</span>
                    <div className="stat-val">{user.stats?.accuracyRate || '99.4%'}</div>
                    <span className="stat-sub">Across 10+ regional dialects</span>
                  </div>
                );
              }
              return null;
            }}
          />

          {/* TAB 1: LIVE VOICE STUDIO */}
          {activeTab === 'studio' && (
            <div className="tab-pane">
              <div className="pane-header">
                <div>
                  <h2>Live Dictation Studio</h2>
                  <p>Speak naturally in any language. Flow refines your words into crisp, professional text.</p>
                </div>
                <div className="pane-actions">
                  <div className="lang-select-wrap">
                    <Globe size={14}/>
                    <select 
                      value={studioLanguage} 
                      onChange={(e) => setStudioLanguage(e.target.value)}
                      className="studio-lang-select"
                    >
                      <option value="English (US)">English (US)</option>
                      <option value="Kannada (ಕನ್ನಡ)">Kannada (ಕನ್ನಡ)</option>
                      <option value="Hindi (हिन्दी)">Hindi (हिन्दी)</option>
                      <option value="Tamil (தமிழ்)">Tamil (தமிழ்)</option>
                      <option value="Telugu (తెలుగు)">Telugu (తెలుగు)</option>
                      <option value="Malayalam (മലയാളം)">Malayalam (മലയാളം)</option>
                      <option value="Marathi (मराठी)">Marathi (मराठी)</option>
                      <option value="Bengali (বাংলা)">Bengali (বাংলা)</option>
                      <option value="Gujarati (ગુજરાતી)">Gujarati (ગુજરાતી)</option>
                      <option value="Punjabi (ਪੰਜਾਬੀ)">Punjabi (ਪੰਜਾਬੀ)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Interactive Voice Studio Console */}
              <div className="studio-console">
                {/* Voice Control Bar */}
                <div className="studio-mic-bar">
                  <button 
                    className={`btn-record-main ${isRecording ? 'recording' : ''}`}
                    onClick={handleToggleRecord}
                  >
                    {isRecording ? <MicOff size={22}/> : <Mic size={22}/>}
                    <span>{isRecording ? `Stop Recording (0:${recordTimer < 10 ? '0' + recordTimer : recordTimer})` : 'Start Dictation'}</span>
                  </button>

                  <div className="waveform-bar">
                    {Array.from({ length: 32 }, (_, i) => (
                      <span 
                        key={i} 
                        className={`wave-stick ${isRecording ? 'active' : ''}`} 
                        style={{
                          height: isRecording 
                            ? `${8 + Math.abs(Math.sin(i * 0.4 + recordTimer)) * 26}px`
                            : '6px'
                        }}
                      />
                    ))}
                  </div>

                  <div className="mic-device-indicator">
                    <Volume2 size={15}/>
                    <span>{user.settings?.micInput || 'MacBook Built-in Mic'}</span>
                  </div>
                </div>

                {/* Tone Rewriter Chips */}
                <div className="tone-selector-row">
                  <span className="tone-label"><Sparkles size={13}/> REWRITE STYLE:</span>
                  {['Polished & Clean', 'Bullet Points', 'Executive Summary', 'Code Prompt'].map(tone => (
                    <button 
                      key={tone}
                      className={`btn-tone ${studioTone === tone ? 'selected' : ''}`}
                      onClick={() => handleToneChange(tone)}
                    >
                      {tone}
                    </button>
                  ))}
                </div>

                {/* Text Output Grid */}
                <div className="studio-editor-grid">
                  <div className="editor-card polished">
                    <div className="card-header">
                      <span className="card-badge"><CheckCircle2 size={13}/> FLOW POLISHED TEXT</span>
                      <button className="btn-copy" onClick={() => handleCopy(transcriptText)}>
                        {copied ? <Check size={14}/> : <Copy size={14}/>}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <textarea 
                      className="studio-textarea"
                      value={transcriptText}
                      onChange={(e) => setTranscriptText(e.target.value)}
                      placeholder="Start speaking or type here..."
                    />
                    <div className="card-footer">
                      <span>{transcriptText.split(/\s+/).filter(Boolean).length} words</span>
                      <span className="pill-filler-cleaned">✓ Filler words removed</span>
                    </div>
                  </div>

                  <div className="editor-card raw">
                    <div className="card-header">
                      <span className="card-badge raw-badge">RAW SPOKEN AUDIO INPUT</span>
                      <span className="raw-lang">{studioLanguage}</span>
                    </div>
                    <div className="raw-content">
                      <p>{rawSpeechText}</p>
                    </div>
                    <div className="card-footer">
                      <small>Automatic contextual correction active</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TRANSCRIPTION HISTORY */}
          {activeTab === 'history' && (
            <div className="tab-pane">
              <div className="pane-header">
                <div>
                  <h2>Dictations & Notes</h2>
                  <p>Search and manage all past voice recordings, emails, and drafts.</p>
                </div>
                <div className="search-box">
                  <Search size={15} />
                  <input 
                    type="text" 
                    placeholder="Search dictations by tag or text..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="dictations-list">
                {filteredDictations.length === 0 ? (
                  <div className="empty-state">
                    <AudioLines size={36} />
                    <h3>No dictations found</h3>
                    <p>Try recording in the Voice Studio or adjusting your search.</p>
                  </div>
                ) : (
                  filteredDictations.map(d => (
                    <div className="dictation-row-card" key={d.id}>
                      <div className="dictation-top">
                        <div className="dictation-tag-group">
                          <span className={`tag-pill tag-${d.tag.toLowerCase()}`}>{d.tag}</span>
                          <span className="dictation-lang">{d.language}</span>
                          <span className="dictation-time">{d.timestamp}</span>
                        </div>
                        <div className="dictation-actions">
                          <button className="btn-icon-action" onClick={() => handleCopy(d.cleanText)} title="Copy">
                            <Copy size={14}/>
                          </button>
                          <button className="btn-icon-action delete" onClick={() => {
                            deleteDictation(d.id);
                            showToast('Deleted dictation.');
                          }} title="Delete">
                            <Trash2 size={14}/>
                          </button>
                        </div>
                      </div>
                      <h3 className="dictation-title">{d.title}</h3>
                      <p className="dictation-clean-text">{d.cleanText}</p>
                      {d.rawText && (
                        <div className="dictation-raw-accordion">
                          <small>Raw: “{d.rawText}”</small>
                        </div>
                      )}
                      <div className="dictation-footer">
                        <span>{d.wordCount} words</span>
                        <span>Duration: {d.duration}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: NOTETAKER MEETINGS */}
          {activeTab === 'meetings' && (
            <div className="tab-pane">
              <div className="pane-header">
                <div>
                  <h2>AI Notetaker & Meeting Recaps</h2>
                  <p>Automated meeting summaries, speaker attributions, and actionable next steps.</p>
                </div>
              </div>

              <div className="meetings-grid">
                {(user.meetings || []).map(m => (
                  <div className="meeting-card" key={m.id}>
                    <div className="meeting-card-head">
                      <div>
                        <h3>{m.title}</h3>
                        <span className="meeting-meta">{m.date} · {m.duration}</span>
                      </div>
                      <span className="badge-recorded"><CheckCircle2 size={13}/> Processed</span>
                    </div>

                    <div className="attendees-row">
                      <span className="label">Attendees:</span>
                      {m.attendees.map(a => (
                        <span key={a} className="attendee-chip">{a}</span>
                      ))}
                    </div>

                    <div className="meeting-section">
                      <h4><Sparkles size={14} className="lime-text"/> Executive Summary</h4>
                      <p>{m.summary}</p>
                    </div>

                    <div className="meeting-section">
                      <h4><Check size={14}/> Action Items</h4>
                      <div className="action-items-list">
                        {m.actionItems.map(item => (
                          <label key={item.id} className={`action-item-check ${item.done ? 'completed' : ''}`}>
                            <input 
                              type="checkbox" 
                              checked={item.done} 
                              onChange={() => toggleActionItem(m.id, item.id)}
                            />
                            <span>{item.text}</span>
                            <small className="assignee-tag">@{item.assignee}</small>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: CUSTOM VOCABULARY */}
          {activeTab === 'vocabulary' && (
            <div className="tab-pane">
              <div className="pane-header">
                <div>
                  <h2>Custom Vocabulary & Jargon</h2>
                  <p>Teach Flow your technical stack, company terms, and team names for 100% spelling accuracy.</p>
                </div>
              </div>

              {/* Add Word Form */}
              <form onSubmit={handleAddWord} className="add-vocab-form">
                <input 
                  type="text" 
                  placeholder="Enter word, phrase, or name (e.g., PyTorch, Nathalie, Kubernetes)"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                />
                <select 
                  value={newWordCategory} 
                  onChange={(e) => setNewWordCategory(e.target.value)}
                >
                  <option value="Engineering">Engineering</option>
                  <option value="Product">Product</option>
                  <option value="Design">Design</option>
                  <option value="Names">Names</option>
                  <option value="AI / ML">AI / ML</option>
                  <option value="Custom">Custom</option>
                </select>
                <button type="submit" className="button btn-lime">
                  <Plus size={16}/>
                  <span>Add Word</span>
                </button>
              </form>

              <div className="vocab-tags-wrap">
                {(user.vocabulary || []).map(v => (
                  <div className="vocab-chip" key={v.id}>
                    <span className="vocab-word">{v.word}</span>
                    <span className="vocab-cat">{v.category}</span>
                    <button 
                      className="btn-remove-vocab" 
                      onClick={() => {
                        removeVocabulary(v.id);
                        showToast(`Removed "${v.word}"`);
                      }}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: SETTINGS & API */}
          {activeTab === 'settings' && (
            <div className="tab-pane">
              <div className="pane-header">
                <div>
                  <h2>Settings & Developer API</h2>
                  <p>Configure shortcuts, audio inputs, AI clean-up sensitivity, and API keys.</p>
                </div>
              </div>

              <div className="settings-cards-grid">
                {/* Voice & Shortcut Settings */}
                <div className="settings-card">
                  <h3>Dictation Preferences</h3>
                  
                  <div className="setting-row">
                    <div>
                      <b>Global Push-to-Talk Shortcut</b>
                      <small>Trigger Flow dictation over any native app</small>
                    </div>
                    <input 
                      type="text" 
                      className="setting-input-short"
                      value={user.settings?.shortcut || 'Command + D'}
                      onChange={(e) => updateUser({ settings: { ...user.settings, shortcut: e.target.value } })}
                    />
                  </div>

                  <div className="setting-row">
                    <div>
                      <b>Primary Audio Input</b>
                      <small>Select active microphone for audio capture</small>
                    </div>
                    <select 
                      className="setting-select"
                      value={user.settings?.micInput || 'Default Built-in Mic'}
                      onChange={(e) => updateUser({ settings: { ...user.settings, micInput: e.target.value } })}
                    >
                      <option value="MacBook Pro Built-in Mic">MacBook Pro Built-in Mic</option>
                      <option value="AirPods Pro (Spatial Audio)">AirPods Pro (Spatial Audio)</option>
                      <option value="Shure SM7B (USB Audio Interface)">Shure SM7B (USB Interface)</option>
                      <option value="External USB Microphone">External USB Microphone</option>
                    </select>
                  </div>

                  <div className="setting-toggle-row">
                    <label className="toggle-label">
                      <input 
                        type="checkbox" 
                        checked={user.settings?.removeFillerWords ?? true}
                        onChange={(e) => updateUser({ settings: { ...user.settings, removeFillerWords: e.target.checked } })}
                      />
                      <span>Remove filler words (um, uh, like, you know)</span>
                    </label>
                    <label className="toggle-label">
                      <input 
                        type="checkbox" 
                        checked={user.settings?.smartPunctuation ?? true}
                        onChange={(e) => updateUser({ settings: { ...user.settings, smartPunctuation: e.target.checked } })}
                      />
                      <span>Smart auto-punctuation and paragraph formatting</span>
                    </label>
                  </div>
                </div>

                {/* API Keys */}
                <div className="settings-card">
                  <h3>Developer API Keys</h3>
                  <p className="card-sub">Integrate Wispr Flow voice inference directly into your CLI, Electron apps, or agents.</p>

                  <form onSubmit={handleAddApiKey} className="add-key-row">
                    <input 
                      type="text" 
                      placeholder="Key name (e.g. VSCode Extension)" 
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                    <button type="submit" className="button btn-lime">Generate Key</button>
                  </form>

                  <div className="keys-list">
                    {(user.apiKeys || []).map(k => (
                      <div className="api-key-item" key={k.id}>
                        <div>
                          <b>{k.name}</b>
                          <code>{k.key}</code>
                          <small>Created: {k.created}</small>
                        </div>
                        <div className="key-actions">
                          <button className="btn-icon-action" onClick={() => handleCopy(k.key)} title="Copy Key">
                            <Copy size={14}/>
                          </button>
                          <button className="btn-icon-action delete" onClick={() => deleteApiKey(k.id)} title="Delete">
                            <Trash2 size={14}/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: GENERATED VIDEOS */}
          {activeTab === 'videos' && (
            <div className="tab-pane">
              <div className="pane-header">
                <div>
                  <h2>Generated Videos</h2>
                  <p>View your AI-generated marketing videos automatically populated from your backend.</p>
                </div>
              </div>
              <div className="studio-console" style={{ padding: 0, overflow: 'hidden' }}>
                 <VideoCarousel />
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
