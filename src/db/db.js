import Dexie from 'dexie';

export const db = new Dexie('KalimatDB');

db.version(1).stores({
  users:          '++id, username, email',
  decks:          '++id, userId, isPublic',
  words:          '++id, userId, deckId, arabic',
  srsCards:       '++id, userId, wordId, nextReviewDate',
  communityDecks: '++id, uploadedByUserId',
  meta:           'key',
});

export default db;
