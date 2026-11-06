import type { ChatPerson, Conversation } from './api';

export const MESSAGE_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];
export const MESSAGE_MAX_LENGTH = 2000;

export function chatTitle(conversation: Conversation, me?: number) {
  if (conversation.name) return conversation.name;
  const people = conversation.members.filter(({ userId }) => userId !== me);
  if (people.length === 0) return 'Just you';
  const names = people.map(displayName);
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}

export function chatPreview(conversation: Conversation, me?: number) {
  const sender = conversation.members.find(({ userId }) => userId === conversation.lastSenderId);
  if (conversation.lastSystem) {
    const name = conversation.lastSenderId === me ? 'You' : sender ? displayName(sender) : 'Someone';
    return `${name} ${conversation.lastText}`;
  }
  if (conversation.lastSenderId === me) return `You: ${conversation.lastText}`;
  if (conversation.isGroup && sender) {
    return `${displayName(sender).split(' ')[0]}: ${conversation.lastText}`;
  }
  return conversation.lastText;
}

export function displayName(person: Pick<ChatPerson, 'name' | 'username'>) {
  return person.name?.trim() || person.username;
}
