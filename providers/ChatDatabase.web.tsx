import type { ChatDatabaseValue, ChatRecord } from '@/providers/ChatDatabase.types';
import type { Message } from '@/utils/Interfaces';
import { resolveApiBaseUrl } from '@/utils/apiUrl';
import { useAuth } from '@clerk/clerk-expo';
import React, { createContext, useContext, useMemo } from 'react';

const ChatDatabaseContext = createContext<ChatDatabaseValue | null>(null);

export const useChatDatabase = () => {
  const value = useContext(ChatDatabaseContext);
  if (!value) throw new Error('useChatDatabase must be used within ChatDatabaseProvider');
  return value;
};

type ChatAction =
  | { action: 'create_chat'; title: string }
  | { action: 'add_message'; chatId: number; message: Message }
  | { action: 'delete_chat'; chatId: number }
  | { action: 'rename_chat'; chatId: number; title: string }
  | { action: 'delete_last_messages'; chatId: number; count: number }
  | { action: 'delete_all' };

const apiOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return resolveApiBaseUrl();
};

export const ChatDatabaseProvider = ({ children }: { children: React.ReactNode }) => {
  const { getToken, userId } = useAuth({ treatPendingAsSignedOut: false });

  const value = useMemo<ChatDatabaseValue>(() => {
    const request = async <T,>(path = '', init?: RequestInit): Promise<T> => {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Sign in again to continue.');
      const response = await fetch(`${apiOrigin()}/api/chats${path}`, {
        ...init,
        headers: {
          ...(init?.body ? { 'content-type': 'application/json' } : {}),
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || payload?.error || 'Could not sync chats.');
      }
      return (await response.json()) as T;
    };

    const mutate = <T,>(action: ChatAction) =>
      request<T>('', { method: 'POST', body: JSON.stringify(action) });

    return {
      addChat: async (title) => {
        const data = await mutate<{ chat: ChatRecord }>({ action: 'create_chat', title });
        return { lastInsertRowId: data.chat.id };
      },
      getChats: async () => (await request<{ chats: ChatRecord[] }>()).chats,
      getChat: async (chatId) =>
        (await request<{ chat: ChatRecord | null }>(`?chatId=${chatId}`)).chat,
      getMessages: async (chatId) =>
        (await request<{ messages: Message[] }>(`?chatId=${chatId}&messages=1`)).messages,
      addMessage: async (chatId, message) => {
        await mutate({ action: 'add_message', chatId, message });
      },
      deleteChat: async (chatId) => {
        await mutate({ action: 'delete_chat', chatId });
      },
      renameChat: async (chatId, title) => {
        await mutate({ action: 'rename_chat', chatId, title });
      },
      deleteLastNMessages: async (chatId, count) => {
        await mutate({ action: 'delete_last_messages', chatId, count });
      },
      searchChats: async (query) =>
        (await request<{ chats: ChatRecord[] }>(`?q=${encodeURIComponent(query)}`)).chats,
      deleteUserChats: async (targetUserId) => {
        if (!userId || targetUserId !== userId) throw new Error('Account identity changed.');
        await mutate({ action: 'delete_all' });
      },
    };
  }, [getToken, userId]);

  if (!userId) return null;
  return <ChatDatabaseContext.Provider value={value}>{children}</ChatDatabaseContext.Provider>;
};
