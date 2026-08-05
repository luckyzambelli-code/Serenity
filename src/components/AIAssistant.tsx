import React, { useState, useRef, useEffect } from 'react';
import { pick5 } from '../i18n5';
import { Brain, ChevronRight, Send, Loader2, X, Settings } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { GlassCollapseToggle } from './GlassCollapseToggle';
import { LAYER } from '../ui/layers';
import { TOKEN } from '../ui/tokens';

interface SessionContext {
  pcName: string;
  auditorName: string;
  sessionTime: number;
  totalTa: number;
  qL: number;
  eta: number;
  needleReaction: string;
  recentLogs: Array<{ time: number; speaker: string; text: string }>;
}

interface AIAssistantProps {
  // PHASE-B: isLightTheme prop removed — read from uiStore.
  lang: string;
  sessionContext: SessionContext;
}

type ChatMessage = { role: 'user' | 'assistant'; content: string; timestamp: number };

const STORAGE_KEY = 'nest_gemini_api_key';

const PLACEHOLDERS: Record<string, string> = {
  fr: 'Que puis-je faire pour vous ?',
  it: 'Cosa posso fare per te?',
  es: '¿Qué puedo hacer por ti?',
  sv: 'Vad kan jag göra för dig?',
  en: 'What can I do for you?',
};

const LABELS: Record<string, { hello: string; thinking: string; error: string; configKey: string; getKey: string; save: string; configureFirst: string; placeholder: string; storedLocally: string; }> = {
  en: { hello: 'Hello! I am your AI assistant.', thinking: 'Thinking...', error: 'Sorry, an error occurred.', configKey: 'Configure Gemini API key', getKey: '↗ Get an API key from Google AI Studio', save: 'Save', configureFirst: 'Please configure your Gemini API key first.', placeholder: 'AIzaSy...', storedLocally: '🔒 Stored in your browser only (localStorage). Never sent to NEST/Anthropic.' },
  fr: { hello: 'Bonjour! Je suis votre assistant IA.', thinking: 'Réflexion...', error: 'Désolé, une erreur est survenue.', configKey: 'Configurer la clé API Gemini', getKey: '↗ Obtenir une clé sur Google AI Studio', save: 'Enregistrer', configureFirst: 'Veuillez d\'abord configurer votre clé API Gemini.', placeholder: 'AIzaSy...', storedLocally: '🔒 Stockée uniquement dans votre navigateur (localStorage). Jamais envoyée à NEST/Anthropic.' },
  it: { hello: 'Ciao! Sono il tuo assistente IA.', thinking: 'Sto pensando...', error: 'Mi dispiace, si è verificato un errore.', configKey: 'Configura la chiave API Gemini', getKey: '↗ Ottieni una chiave da Google AI Studio', save: 'Salva', configureFirst: 'Configura prima la tua chiave API Gemini.', placeholder: 'AIzaSy...', storedLocally: '🔒 Memorizzata solo nel tuo browser (localStorage). Mai inviata a NEST/Anthropic.' },
  es: { hello: '¡Hola! Soy tu asistente IA.', thinking: 'Pensando...', error: 'Lo siento, ocurrió un error.', configKey: 'Configurar clave API Gemini', getKey: '↗ Obtener una clave en Google AI Studio', save: 'Guardar', configureFirst: 'Por favor, configura primero tu clave API Gemini.', placeholder: 'AIzaSy...', storedLocally: '🔒 Almacenada solo en tu navegador (localStorage). Nunca enviada a NEST/Anthropic.' },
  sv: { hello: 'Hej! Jag är din AI-assistent.', thinking: 'Tänker...', error: 'Tyvärr uppstod ett fel.', configKey: 'Konfigurera Gemini API-nyckel', getKey: '↗ Hämta en nyckel från Google AI Studio', save: 'Spara', configureFirst: 'Konfigurera först din Gemini API-nyckel.', placeholder: 'AIzaSy...', storedLocally: '🔒 Lagras endast i din webbläsare (localStorage). Skickas aldrig till NEST/Anthropic.' },
};

export const AIAssistant: React.FC<AIAssistantProps> = ({ lang, sessionContext }) => {
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const labels = LABELS[lang] || LABELS.en;
  const placeholder = PLACEHOLDERS[lang] || PLACEHOLDERS.en;
  const accentColor = isLightTheme ? '#0284c7' : 'rgba(240,246,255,0.92)';

  // Charger la clé depuis localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setApiKey(stored);
    } catch {}
  }, []);

  // Auto-scroll vers le bas dans le chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveKey = () => {
    try { localStorage.setItem(STORAGE_KEY, apiKey.trim()); } catch {}
    setShowKeyConfig(false);
  };

  const buildContextSummary = (): string => {
    const c = sessionContext;
    const parts: string[] = [];
    if (c.pcName) parts.push(`PC: ${c.pcName}`);
    if (c.auditorName) parts.push(`Auditor: ${c.auditorName}`);
    if (c.sessionTime !== undefined) parts.push(`Session time: ${c.sessionTime.toFixed(1)}s`);
    if (c.totalTa !== undefined) parts.push(`Total TA: ${c.totalTa.toFixed(2)}`);
    if (c.qL !== undefined) parts.push(`qL (lock quality): ${c.qL.toFixed(2)}`);
    if (c.eta !== undefined) parts.push(`eta: ${c.eta.toFixed(2)}`);
    if (c.needleReaction) parts.push(`Current needle reaction: ${c.needleReaction}`);
    if (c.recentLogs && c.recentLogs.length > 0) {
      const recent = c.recentLogs.slice(-10).map(l => `[${l.time.toFixed(1)}s] ${l.speaker}: ${l.text}`).join('\n');
      parts.push(`Recent transcript:\n${recent}`);
    }
    return parts.length > 0 ? `Current session context:\n${parts.join('\n')}\n\n` : '';
  };

  const callGemini = async (userMessage: string): Promise<string> => {
    const langName = ({ en: 'English', fr: 'French', it: 'Italian', es: 'Spanish', sv: 'Swedish' } as any)[lang] || 'English';
    const systemPrompt = `You are an AI assistant integrated into EQUILIBRIUM (NEST V3) — a quantum-analysis tool that monitors a Preclear's brainwave activity (MUSE 2 EEG) during auditing sessions. Respond concisely in ${langName}. Keep responses under 200 words unless the user explicitly asks for detail.`;

    // Construire l'historique de messages pour Gemini
    const conversationHistory = messages.slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    const finalUserText = `${buildContextSummary()}User question: ${userMessage}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            ...conversationHistory,
            { role: 'user', parts: [{ text: finalUserText }] },
          ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 600 },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response received from Gemini');
    return text;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    if (!apiKey) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: labels.configureFirst,
        timestamp: Date.now(),
      }]);
      setShowKeyConfig(true);
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: Date.now() }]);

    try {
      const response = await callGemini(userMessage);
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }]);
    } catch (error: any) {
      console.error('Gemini API error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `${labels.error} (${error?.message || 'unknown'})`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div className="relative">
      {/* Compact Input Bar */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors"
          style={{
            background: isLightTheme ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.06)',
            borderColor: isLightTheme ? 'rgba(60,64,72,0.20)' : 'rgba(255,255,255,0.16)',
            boxShadow: 'none',
            minWidth: 'min(380px, 45vw)',
          }}>
          <Brain size={16} style={{ color: accentColor, flexShrink: 0, cursor: 'pointer' }}
            onClick={() => setIsOpen(!isOpen)} />
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            onFocus={() => setIsOpen(true)}
            className="flex-1 bg-transparent border-none outline-none text-sm"
            style={{
              color: isLightTheme ? '#1e293b' : 'rgba(240,246,255,0.90)',
              fontSize: '12px',
              fontFamily: 'monospace',
              minWidth: 0,
            }}
          />
          {/* Bouton API Key — bien visible */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowKeyConfig(v => !v); }}
            title={apiKey
              ? pick5(lang, 'Chiave API Gemini configurata', 'Clé API Gemini configurée',
                      'Gemini API key configured', 'Clave API Gemini configurada',
                      'Gemini API-nyckel konfigurerad')
              : labels.configKey}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-all"
            style={{
              color: apiKey ? (isLightTheme ? '#059669' : '#4ade80') : (TOKEN.warn),
              background: apiKey
                ? (isLightTheme ? 'rgba(5,150,105,0.10)' : 'rgba(74,222,128,0.12)')
                : (TOKEN.warnBg),
              border: `1px solid ${apiKey
                ? (isLightTheme ? 'rgba(5,150,105,0.40)' : 'rgba(74,222,128,0.40)')
                : (TOKEN.warnEdge)}`,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
            <span style={{ fontSize: 11 }}>{apiKey ? '🔑' : '⚙'}</span>
            <span>{apiKey ? 'API ✓' : 'API'}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleSend(); }}
            disabled={!input.trim() || isLoading}
            className="p-1 rounded transition-colors disabled:opacity-50"
            style={{
              background: isLightTheme ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.14)',
              color: accentColor,
              flexShrink: 0,
            }}>
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* Panneau de configuration de la clé API — fixed pour ne pas être clipé */}
      {showKeyConfig && (
        <div
          className="fixed rounded-lg p-4 flex flex-col gap-3 shadow-2xl"
          style={{
            zIndex: LAYER.modal,
            background: isLightTheme ? 'rgba(255,255,255,0.98)' : 'rgba(26,26,30,0.98)',
            backdropFilter: 'blur(20px)',
            border: `2px solid ${accentColor}`,
            width: 460,
            top: inputRef.current ? inputRef.current.getBoundingClientRect().bottom + 8 : 60,
            right: inputRef.current ? Math.max(8, window.innerWidth - inputRef.current.getBoundingClientRect().right) : 16,
            boxShadow: `0 12px 36px rgba(0,0,0,0.5), 0 0 24px ${accentColor}66`,
          }}>
          <div className="flex items-center justify-between border-b pb-2"
            style={{ borderColor: isLightTheme ? 'rgba(100,180,255,0.30)' : 'rgba(34,211,238,0.30)' }}>
            <span className="text-xs font-mono uppercase tracking-widest font-bold flex items-center gap-2"
              style={{ color: accentColor }}>
              🔑 Gemini API Key
            </span>
            <button onClick={() => setShowKeyConfig(false)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <X size={16} style={{ color: isLightTheme ? '#64748b' : 'rgba(255,255,255,0.6)' }} />
            </button>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider block mb-1"
              style={{ color: isLightTheme ? '#475569' : 'rgba(220,240,255,0.7)' }}>
              {labels.configKey}
            </label>
            <input type="password"
              autoFocus
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveKey(); }}
              placeholder={labels.placeholder}
              className="w-full px-3 py-2 rounded outline-none border text-sm"
              style={{
                background: isLightTheme ? '#fff' : 'rgba(255,255,255,0.06)',
                color: isLightTheme ? '#0f172a' : 'rgba(220,240,255,0.95)',
                borderColor: isLightTheme ? 'rgba(100,180,255,0.5)' : 'rgba(34,211,238,0.4)',
                fontFamily: 'monospace',
              }}
            />
          </div>
          <div className="flex gap-2 justify-between items-center">
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener"
              className="text-[10px] font-mono underline"
              style={{ color: accentColor }}>
              {labels.getKey}
            </a>
            <button onClick={saveKey}
              disabled={!apiKey.trim()}
              className="px-4 py-1.5 rounded text-xs font-mono uppercase tracking-wider font-bold transition-all disabled:opacity-40"
              style={{ background: accentColor, color: isLightTheme ? '#fff' : '#1a1a1f', border: 'none', cursor: apiKey.trim() ? 'pointer' : 'not-allowed' }}>
              {labels.save}
            </button>
          </div>
          <div className="text-[9px] font-mono italic"
            style={{ color: isLightTheme ? '#64748b' : 'rgba(255,255,255,0.45)' }}>
            {labels.storedLocally}
          </div>
        </div>
      )}

      {/* Expanded Chat Panel — fixed pour ne pas être clipé */}
      {isOpen && !showKeyConfig && (
        <div
          className="fixed rounded-lg border shadow-2xl"
          style={{
            zIndex: LAYER.floating,
            background: isLightTheme ? 'rgba(255,255,255,0.97)' : 'rgba(26,26,30,0.97)',
            borderColor: isLightTheme ? 'rgba(100,180,255,0.30)' : 'rgba(255,255,255,0.25)',
            backdropFilter: 'blur(20px)',
            top: inputRef.current ? inputRef.current.getBoundingClientRect().bottom + 8 : 60,
            right: inputRef.current ? Math.max(8, window.innerWidth - inputRef.current.getBoundingClientRect().right) : 16,
            width: 480,
            maxHeight: 520,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: `0 12px 36px rgba(0,0,0,0.4), 0 0 18px ${accentColor}33`,
          }}>
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b"
            style={{ borderColor: TOKEN.sep }}>
            <div className="flex items-center gap-2">
              <Brain size={16} style={{ color: accentColor }} />
              <span className="font-semibold text-sm"
                style={{ color: isLightTheme ? '#1e293b' : 'rgba(240,246,255,0.90)' }}>
                AI Assistant — Gemini
              </span>
              {!apiKey && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: TOKEN.warnBg,
                    color: TOKEN.warn,
                  }}>
                  ⚠ NO KEY
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowKeyConfig(true)}
                title={labels.configKey}
                className="p-1 rounded hover:bg-black/10 transition-colors"
                style={{ color: isLightTheme ? '#64748b' : 'rgba(220,240,255,0.60)' }}>
                <Settings size={14} />
              </button>
              {/* Fermeture en MINI TOGGLE (cohérence graphique) : on = fenêtre ouverte. */}
              <GlassCollapseToggle on onToggle={() => setIsOpen(false)} title={pick5(lang, 'Chiudi', 'Fermer', 'Close', 'Cerrar', 'Stäng')} />
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 200 }}>
            {messages.length === 0 && (
              <div className="text-center py-8 opacity-60">
                <div className="text-sm"
                  style={{ color: isLightTheme ? '#64748b' : 'rgba(220,240,255,0.60)' }}>
                  {labels.hello}
                </div>
                {!apiKey && (
                  <button
                    onClick={() => setShowKeyConfig(true)}
                    className="mt-3 px-3 py-1.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider"
                    style={{
                      background: TOKEN.warnBg,
                      color: TOKEN.warn,
                      border: `1px solid ${TOKEN.warnEdge}`,
                      cursor: 'pointer',
                    }}>
                    ⚙ {labels.configKey}
                  </button>
                )}
              </div>
            )}

            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap`}
                  style={{
                    background: message.role === 'user'
                      ? (isLightTheme ? '#0284c7' : 'rgba(255,255,255,0.16)')
                      : (isLightTheme ? '#f1f5f9' : 'rgba(255,255,255,0.06)'),
                    color: message.role === 'user'
                      ? '#fff'
                      : (isLightTheme ? '#1e293b' : 'rgba(240,246,255,0.92)'),
                    border: message.role === 'assistant'
                      ? `1px solid ${isLightTheme ? 'rgba(100,180,255,0.20)' : 'rgba(255,255,255,0.16)'}`
                      : 'none',
                  }}>
                  {message.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-lg text-sm flex items-center gap-2"
                  style={{
                    background: isLightTheme ? '#f1f5f9' : 'rgba(255,255,255,0.06)',
                    color: isLightTheme ? '#475569' : 'rgba(220,240,255,0.7)',
                  }}>
                  <Loader2 size={12} className="animate-spin" />
                  {labels.thinking}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <div className="p-3 border-t"
            style={{ borderColor: TOKEN.sep }}>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={placeholder}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                className="flex-1 px-3 py-2 rounded border bg-transparent outline-none text-sm"
                style={{
                  borderColor: isLightTheme ? 'rgba(100,180,255,0.30)' : 'rgba(255,255,255,0.20)',
                  color: isLightTheme ? '#1e293b' : 'rgba(240,246,255,0.90)',
                  fontFamily: 'monospace',
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="p-2 rounded transition-colors disabled:opacity-50"
                style={{
                  background: isLightTheme ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.14)',
                  color: accentColor,
                }}>
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
