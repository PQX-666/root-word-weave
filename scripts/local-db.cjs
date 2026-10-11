const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.sites-runtime');fs.mkdirSync(dir,{recursive:true});
const dbName=process.env.PREVIEW_DB_NAME||'preview.sqlite';if(!/^[a-zA-Z0-9_-]+\.sqlite$/.test(dbName))throw Error('Invalid preview database name');
let db;
function open(){if(db)return db;db=new DatabaseSync(path.join(dir,dbName));for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(x=>x.endsWith('.sql')).sort()){const exists=db.prepare("SELECT name FROM sqlite_master WHERE name = 'learning_state'").get();if(!exists)db.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));}return db;}
exports.binding={prepare(sql){return {bind(...params){const statement=open().prepare(sql);return {async first(){return statement.get(...params)||null;},async run(){const result=statement.run(...params);return {meta:{changes:Number(result.changes)}};}};}};}};
