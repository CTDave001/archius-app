import type { Message } from '@/utils/Interfaces';

export type ChatRecord = {
  id: number;
  title: string;
  updated_at: string | null;
};

export type AddChatResult = {
  lastInsertRowId: number;
};

export interface ChatDatabaseValue {
  addChat(title: string): Promise<AddChatResult>;
  getChats(): Promise<ChatRecord[]>;
  getChat(chatId: number): Promise<ChatRecord | null>;
  getMessages(chatId: number): Promise<Message[]>;
  addMessage(chatId: number, message: Message): Promise<void>;
  deleteChat(chatId: number): Promise<void>;
  renameChat(chatId: number, title: string): Promise<void>;
  deleteLastNMessages(chatId: number, count: number): Promise<void>;
  searchChats(query: string): Promise<ChatRecord[]>;
  deleteUserChats(userId: string): Promise<void>;
}
