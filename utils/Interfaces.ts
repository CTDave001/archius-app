export enum Role {
  User = 0,
  Bot = 1,
}

export type MessageSource = { title: string; url: string };

export type EmailDraft = { to?: string; subject: string; body: string };

export type EventDraft = {
  title: string;
  startISO: string;
  endISO?: string;
  location?: string;
  notes?: string;
};

export interface Message {
  role: Role;
  content: string;
  // Cited web-search sources (assistant messages only). Persisted as JSON.
  sources?: MessageSource[];
  // A drafted email the user can review + send (assistant messages only).
  email?: EmailDraft;
  // A drafted calendar event the user can add (assistant messages only).
  event?: EventDraft;
  // Persisted local file URI for an attached image (user messages only).
  imageUri?: string;
}

export interface Chat {
  id: number;
  title: string;
}
