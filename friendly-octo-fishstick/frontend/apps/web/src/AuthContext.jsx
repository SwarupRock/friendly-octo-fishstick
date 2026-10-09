import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const DEFAULT_DEMO_USER = {
  id: 'usr_flow_9821',
  name: 'Alex Rivera',
  email: 'alex.rivera@wisprflow.ai',
  avatar: 'AR',
  plan: 'Pro Plan',
  status: 'Active',
  memberSince: 'March 2025',
  stats: {
    wordsDictated: 84920,
    wpmAverage: 218,
    timeSavedHours: 38.5,
    accuracyRate: '99.4%',
    sessionsCount: 342,
  },
  settings: {
    primaryLanguage: 'English (US)',
    secondaryLanguage: 'Hindi',
    shortcut: 'Command + D',
    micInput: 'Default - MacBook Pro Built-in Mic',
    removeFillerWords: true,
    smartPunctuation: true,
    autoCapitalize: true,
    formatCodeSnippets: true,
    aiTone: 'Polished & Concise',
    theme: 'dark',
  },
  vocabulary: [
    { id: 'v1', word: 'Kubernetes', category: 'Engineering' },
    { id: 'v2', word: 'Wispr Flow', category: 'Product' },
    { id: 'v3', word: 'PyTorch', category: 'AI / ML' },
    { id: 'v4', word: 'Supabase', category: 'Database' },
    { id: 'v5', word: 'Next.js 15', category: 'Engineering' },
    { id: 'v6', word: 'Kannada NLP', category: 'Languages' },
    { id: 'v7', word: 'Figma Token Studio', category: 'Design' },
    { id: 'v8', word: 'OAuth 2.1 PKCE', category: 'Security' },
  ],
  recentDictations: [
    {
      id: 'd1',
      title: 'Email: Sprint Launch Update',
      tag: 'Email',
      timestamp: '10 minutes ago',
      wordCount: 84,
      duration: '0:24',
      language: 'English (US)',
      cleanText: 'Can you let the engineering team know that the launch is slipping to Monday? We are still waiting on legal to sign off on the new terms. We will have a firm timeline by end of day Thursday.',
      rawText: 'Hey so um can you actually wait can you tell the team that the launch is gonna slip I think to like not Friday, the following Monday because we are still waiting on legal to sign off...',
    },
    {
      id: 'd2',
      title: 'Slack update to Maya (Product Design)',
      tag: 'Slack',
      timestamp: '1 hour ago',
      wordCount: 42,
      duration: '0:14',
      language: 'English (US)',
      cleanText: 'Hey Maya, I reviewed the updated figma components for the settings modal. Everything looks super crisp, especially the dark theme accents. Ready to merge whenever you are!',
      rawText: 'Hey Maya uh I looked at the figma components like for the settings modal and everything looks great like really crisp especially dark theme so ready to merge whenever.',
    },
    {
      id: 'd3',
      title: 'ಹೊಸ ವೈಶಿಷ್ಟ್ಯಗಳ ವಿವರಣೆ (Kannada)',
      tag: 'Notes',
      timestamp: '3 hours ago',
      wordCount: 38,
      duration: '0:19',
      language: 'Kannada (ಕನ್ನಡ)',
      cleanText: 'ನಾಳೆ ಬೆಳಗ್ಗೆ 10 ಗಂಟೆಗೆ ಹೊಸ ಪ್ರಾಜೆಕ್ಟ್ ಮೀಟಿಂಗ್ ಇದೆ. ಎಲ್ಲರೂ ತಯಾರಾಗಿ ಬನ್ನಿ.',
      rawText: 'ನಾಳೆ ಬೆಳಗ್ಗೆ 10 ಗಂಟೆಗೆ ಹೊಸ ಪ್ರಾಜೆಕ್ಟ್ ಮೀಟಿಂಗ್ ಇದೆ ಎಲ್ಲರೂ ತಯಾರಾಗಿ ಬನ್ನಿ',
    },
    {
      id: 'd4',
      title: 'React Custom Hook & Performance Optimization',
      tag: 'Code',
      timestamp: 'Yesterday at 4:15 PM',
      wordCount: 65,
      duration: '0:22',
      language: 'English (US)',
      cleanText: 'Refactor useDebounce to cancel trailing timers on component unmount and memoize the handler using useCallback with dependency array.',
      rawText: 'So refactor the use debounce hook to cancel the trailing timer if component unmounts and memoize handler with use callback with dependency array.',
    }
  ],
  meetings: [
    {
      id: 'm1',
      title: 'Weekly Product & Engineering Sync',
      date: 'Today, 10:00 AM',
      duration: '42 min',
      attendees: ['Alex Rivera', 'Nathalie Chen', 'Stephen Miller', 'Mikel S.'],
      summary: 'The team reviewed sprint progress, aligned on reducing approval bottlenecks, and confirmed final QA for the Indic language rollout.',
      actionItems: [
        { id: 'a1', text: 'Streamline design review approvals in Figma', assignee: 'Stephen', done: true },
        { id: 'a2', text: 'Benchmark Kannada & Hindi transcription accuracy', assignee: 'Alex', done: false },
        { id: 'a3', text: 'Prepare analytics dashboard for Monday demo', assignee: 'Mikel', done: false },
      ]
    },
    {
      id: 'm2',
      title: 'Design Critique: Multilingual Flow UI',
      date: 'Yesterday, 2:30 PM',
      duration: '28 min',
      attendees: ['Alex Rivera', 'Maya Lin', 'Dave G.'],
      summary: 'Discussed FormulaStream background integration and high-contrast settings modal with 10 Indic regional scripts.',
      actionItems: [
        { id: 'a4', text: 'Ensure dark theme glow effects match Wispr Lime #d8f878', assignee: 'Alex', done: true },
        { id: 'a5', text: 'Check mobile responsiveness for language tabs', assignee: 'Maya', done: true },
      ]
    }
  ],
  apiKeys: [
    { id: 'k1', name: 'Production Desktop Client', key: 'wf_live_894f29a0c71e892d4b819f7', created: 'Oct 02, 2026' },
    { id: 'k2', name: 'CLI Development Key', key: 'wf_test_231c90a1b64e098d1a490e1', created: 'Oct 07, 2026' },
  ]
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('wispr_auth_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved user', e);
      }
    }
    return null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('wispr_auth_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('wispr_auth_user');
    }
  }, [user]);

  const login = (email, password) => {
    // Generate initials
    const name = email.split('@')[0].replace('.', ' ');
    const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
    const initials = formattedName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'WF';

    const loggedUser = {
      ...DEFAULT_DEMO_USER,
      email: email || DEFAULT_DEMO_USER.email,
      name: email ? formattedName : DEFAULT_DEMO_USER.name,
      avatar: initials,
    };
    setUser(loggedUser);
    return loggedUser;
  };

  const loginWithDemo = () => {
    setUser(DEFAULT_DEMO_USER);
    return DEFAULT_DEMO_USER;
  };

  const signup = (name, email, password, language = 'English (US)') => {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'WF';
    const newUser = {
      ...DEFAULT_DEMO_USER,
      id: `usr_flow_${Math.floor(1000 + Math.random() * 9000)}`,
      name: name || 'Wispr User',
      email: email || 'user@example.com',
      avatar: initials,
      plan: 'Free Plan',
      memberSince: 'Just now',
      settings: {
        ...DEFAULT_DEMO_USER.settings,
        primaryLanguage: language,
      }
    };
    setUser(newUser);
    return newUser;
  };

  const logout = () => {
    setUser(null);
  };

  const updateUser = (updates) => {
    setUser(prev => prev ? { ...prev, ...updates } : null);
  };

  const addDictation = (dictation) => {
    setUser(prev => {
      if (!prev) return null;
      const newD = {
        id: `d_${Date.now()}`,
        timestamp: 'Just now',
        ...dictation
      };
      const updatedWords = (prev.stats?.wordsDictated || 0) + (dictation.wordCount || 10);
      return {
        ...prev,
        stats: {
          ...prev.stats,
          wordsDictated: updatedWords,
          sessionsCount: (prev.stats?.sessionsCount || 0) + 1,
        },
        recentDictations: [newD, ...(prev.recentDictations || [])]
      };
    });
  };

  const deleteDictation = (id) => {
    setUser(prev => {
      if (!prev) return null;
      return {
        ...prev,
        recentDictations: prev.recentDictations.filter(d => d.id !== id)
      };
    });
  };

  const addVocabulary = (word, category = 'Custom') => {
    if (!word.trim()) return;
    setUser(prev => {
      if (!prev) return null;
      const exists = prev.vocabulary.some(v => v.word.toLowerCase() === word.toLowerCase());
      if (exists) return prev;
      return {
        ...prev,
        vocabulary: [...prev.vocabulary, { id: `v_${Date.now()}`, word, category }]
      };
    });
  };

  const removeVocabulary = (id) => {
    setUser(prev => {
      if (!prev) return null;
      return {
        ...prev,
        vocabulary: prev.vocabulary.filter(v => v.id !== id)
      };
    });
  };

  const toggleActionItem = (meetingId, itemId) => {
    setUser(prev => {
      if (!prev) return null;
      return {
        ...prev,
        meetings: prev.meetings.map(m => {
          if (m.id !== meetingId) return m;
          return {
            ...m,
            actionItems: m.actionItems.map(item => item.id === itemId ? { ...item, done: !item.done } : item)
          };
        })
      };
    });
  };

  const addApiKey = (name) => {
    setUser(prev => {
      if (!prev) return null;
      const newKey = {
        id: `k_${Date.now()}`,
        name: name || 'API Key',
        key: `wf_live_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
        created: 'Just now'
      };
      return {
        ...prev,
        apiKeys: [...(prev.apiKeys || []), newKey]
      };
    });
  };

  const deleteApiKey = (id) => {
    setUser(prev => {
      if (!prev) return null;
      return {
        ...prev,
        apiKeys: (prev.apiKeys || []).filter(k => k.id !== id)
      };
    });
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      loginWithDemo,
      signup,
      logout,
      updateUser,
      addDictation,
      deleteDictation,
      addVocabulary,
      removeVocabulary,
      toggleActionItem,
      addApiKey,
      deleteApiKey
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
