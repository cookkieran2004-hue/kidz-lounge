import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState(null); // null = showing the conversation list
  const [newChatTrigger, setNewChatTrigger] = useState(0);

  const refreshConversations = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.getConversations();
      setConversations(data || []);
    } catch (err) {
      // Background poll -- fail silently rather than disrupting the page.
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setWidgetOpen(false);
      setActiveConversationId(null);
      return;
    }
    // Background: let the page's own requests go first.
    const first = setTimeout(refreshConversations, 2000);
    // Chat expectations are more "live" than Tasks, so this polls more often.
    const interval = setInterval(refreshConversations, 15000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, [user, refreshConversations]);

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  const openConversation = (id) => {
    setActiveConversationId(id);
    setWidgetOpen(true);
  };

  // Lets another page (e.g. a patient's Care Team tab) jump straight to the
  // "start a new chat" flow instead of the conversation list.
  const openNewChat = () => {
    setActiveConversationId(null);
    setWidgetOpen(true);
    setNewChatTrigger(t => t + 1);
  };

  return (
    <ChatContext.Provider value={{
      conversations, refreshConversations, widgetOpen, setWidgetOpen,
      activeConversationId, setActiveConversationId, openConversation, openNewChat, newChatTrigger, totalUnread,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside a ChatProvider');
  return ctx;
}
