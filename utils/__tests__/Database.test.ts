import {
  addMessage,
  deleteChat,
  deleteUserChats,
  getChat,
  getChats,
  getMessages,
  setActiveChatUser,
} from '@/utils/Database';
import { Role } from '@/utils/Interfaces';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const makeDb = () => {
  const db: any = {
    execAsync: jest.fn(async () => undefined),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
    runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })),
  };
  db.withTransactionAsync = jest.fn(async (work: () => Promise<void>) => work());
  return db;
};

describe('per-user chat database scoping', () => {
  beforeEach(() => {
    setActiveChatUser('user-a');
  });

  afterEach(() => {
    setActiveChatUser(null);
    jest.restoreAllMocks();
  });

  it('fails closed when no signed-in user is active', async () => {
    const db = makeDb();
    setActiveChatUser(null);

    await expect(getChats(db)).rejects.toThrow('No signed-in chat user is active');
    expect(db.getAllAsync).not.toHaveBeenCalled();
  });

  it('scopes single-chat and message reads to the active user', async () => {
    const db = makeDb();

    await getChat(db, 42);
    await getMessages(db, 42);

    expect(db.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('id = ? AND user_id = ?'),
      42,
      'user-a'
    );
    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('c.user_id = ?'),
      42,
      'user-a'
    );
  });

  it('does not insert a message when the chat is not owned by the active user', async () => {
    const db = makeDb();
    db.runAsync.mockResolvedValueOnce({ changes: 0, lastInsertRowId: 0 });

    await expect(
      addMessage(db, 99, { role: Role.User, content: 'private message' })
    ).rejects.toThrow('Chat not found for the active user');

    expect(db.runAsync).toHaveBeenCalledTimes(1);
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('id = ? AND user_id = ?'),
      expect.any(String),
      99,
      'user-a'
    );
  });

  it('does not delete a chat owned by another local account', async () => {
    const db = makeDb();
    db.runAsync
      .mockResolvedValueOnce({ changes: 0, lastInsertRowId: 0 })
      .mockResolvedValueOnce({ changes: 0, lastInsertRowId: 0 });

    await expect(deleteChat(db, 99)).rejects.toThrow(
      'Chat not found for the active user'
    );

    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('c.user_id = ?'),
      99,
      'user-a'
    );
    expect(db.runAsync).toHaveBeenLastCalledWith(
      expect.stringContaining('id = ? AND user_id = ?'),
      99,
      'user-a'
    );
  });

  it('account cleanup deletes only rows belonging to the captured user id', async () => {
    const db = makeDb();

    await deleteUserChats(db, 'deleted-user');

    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('c.user_id = ?'),
      'deleted-user'
    );
    expect(db.runAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT id FROM chats WHERE user_id = ?'),
      'deleted-user'
    );
    expect(db.runAsync).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM chats WHERE user_id = ?',
      'deleted-user'
    );
  });
});
