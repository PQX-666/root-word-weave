import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const learningState=sqliteTable('learning_state',{
  userId:text('user_id').primaryKey(),
  stateJson:text('state_json').notNull(),
  revision:integer('revision').notNull().default(1),
  updatedAt:integer('updated_at').notNull()
});
