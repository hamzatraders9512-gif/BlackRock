import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.warn('MONGODB_URI is not set. DB operations will fail.');
}

let client;
let clientPromise;

export async function getClient() {
  if (!uri) throw new Error('Missing MONGODB_URI');
  if (!clientPromise) {
    client = new MongoClient(uri);
    clientPromise = client.connect();
  }
  await clientPromise;
  return client;
}


// Always use the 'BlackRock' database, regardless of argument or connection string
export async function getDb() {
  const c = await getClient();
  return c.db('BlackRock');
}
