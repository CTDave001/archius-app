// Lightweight in-app event bus for cross-component notifications that don't
// fit neatly into a React provider. Use sparingly — context/state is the
// right tool for most cases.

import { DeviceEventEmitter } from 'react-native';

export const EVENTS = {
  /** A chat has been added, renamed, deleted, or had messages persisted. */
  ChatsChanged: 'archius:chats-changed',
} as const;

export const emitChatsChanged = () => {
  DeviceEventEmitter.emit(EVENTS.ChatsChanged);
};

export const onChatsChanged = (handler: () => void) => {
  const sub = DeviceEventEmitter.addListener(EVENTS.ChatsChanged, handler);
  return () => sub.remove();
};
