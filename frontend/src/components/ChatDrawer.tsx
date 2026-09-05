import React, { useState, useEffect, useRef } from 'react';
import { X, Send, ShieldAlert, AlertCircle } from 'lucide-react';
import { ChatMessage } from '../types/index.js';
import { preCheckMessage } from '../ai/chatModerator.js';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  currentUserId: string;
  onSendMessage: (text: string) => void;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  currentUserId,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const [clientWarning, setClientWarning] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    // Client pre-screening
    const check = preCheckMessage(inputText);
    if (!check.isClean) {
      setClientWarning(check.reason || 'Message blocked: Abusive content detected.');
      return;
    }

    setClientWarning(null);
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 md:w-96 z-40 glass-panel border-l border-slate-200 bg-white shadow-2xl flex flex-col animate-slideLeft">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">Meeting Chat</h3>
          <p className="text-[11px] text-slate-500">AI Toxicity Moderation Active</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-xs">
            No messages yet. Send a message to start chatting.
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.senderId === currentUserId;
            if (m.isSystem) {
              return (
                <div
                  key={m.id}
                  className={`text-center py-1.5 px-3 rounded-lg text-xs font-medium my-2 ${
                    m.isBlocked
                      ? 'bg-rose-50 border border-rose-200 text-rose-700'
                      : 'bg-slate-100 border border-slate-200 text-slate-600'
                  }`}
                >
                  {m.message}
                </div>
              );
            }

            return (
              <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="text-[10px] text-slate-500 mb-1 px-1">
                  {isMe ? 'You' : m.senderName} •{' '}
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div
                  className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs break-words shadow-xs ${
                    isMe
                      ? 'bg-indigo-600 text-white rounded-tr-xs'
                      : 'bg-slate-100 text-slate-800 rounded-tl-xs border border-slate-200'
                  }`}
                >
                  {m.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Warning banner */}
      {clientWarning && (
        <div className="p-3 mx-3 mb-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Blocked:</span> {clientWarning}
          </div>
          <button
            onClick={() => setClientWarning(null)}
            className="text-rose-500 hover:text-rose-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-3 border-t border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Type a message..."
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              if (clientWarning) setClientWarning(null);
            }}
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:border-indigo-600"
          />
          <button
            type="submit"
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
