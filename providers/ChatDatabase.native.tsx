import {
  addChat,
  addMessage,
  claimLegacyChats,
  deleteChat,
  deleteLastNMessages,
  deleteUserChats,
  getChat,
  getChats,
  getMessages,
  migrateDbIfNeeded,
  renameChat,
  searchChats,
  setActiveChatUser,
} from '@/utils/Database';
import type { ChatDatabaseValue } from '@/providers/ChatDatabase.types';
import { useAuth } from '@clerk/clerk-expo';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ChatDatabaseContext = createContext<ChatDatabaseValue | null>(null);

export const useChatDatabase = () => {
  const value = useContext(ChatDatabaseContext);
  if (!value) throw new Error('useChatDatabase must be used within ChatDatabaseProvider');
  return value;
};

const ScopedNativeDatabase = ({ children }: { children: React.ReactNode }) => {
  const { userId } = useAuth({ treatPendingAsSignedOut: false });
  const db = useSQLiteContext();
  const [readyUserId, setReadyUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReadyUserId(null);
    setActiveChatUser(userId ?? null);

    (async () => {
      if (userId) await claimLegacyChats(db, userId).catch(() => undefined);
      if (!cancelled && userId) setReadyUserId(userId);
    })();

    return () => {
      cancelled = true;
      setActiveChatUser(null);
    };
  }, [db, userId]);

  const value = useMemo<ChatDatabaseValue>(
    () => ({
      addChat: async (title) => {
        const result = await addChat(db, title);
        return { lastInsertRowId: Number(result.lastInsertRowId) };
      },
      getChats: () => getChats(db),
      getChat: (chatId) => getChat(db, chatId),
      getMessages: (chatId) => getMessages(db, chatId),
      addMessage: (chatId, message) => addMessage(db, chatId, message),
      deleteChat: (chatId) => deleteChat(db, chatId),
      renameChat: async (chatId, title) => {
        await renameChat(db, chatId, title);
      },
      deleteLastNMessages: async (chatId, count) => {
        await deleteLastNMessages(db, chatId, count);
      },
      searchChats: (query) => searchChats(db, query),
      deleteUserChats: (targetUserId) => deleteUserChats(db, targetUserId),
    }),
    [db]
  );

  if (!userId || readyUserId !== userId) return null;
  return <ChatDatabaseContext.Provider value={value}>{children}</ChatDatabaseContext.Provider>;
};

export const ChatDatabaseProvider = ({ children }: { children: React.ReactNode }) => (
  <SQLiteProvider databaseName="chat.db" onInit={migrateDbIfNeeded}>
    <ScopedNativeDatabase>{children}</ScopedNativeDatabase>
  </SQLiteProvider>
);
