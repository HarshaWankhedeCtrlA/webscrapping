
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const client = new MongoClient(process.env.MONGO_URI);

let db;

export async function connectDB() {
  try {
    await client.connect();

    db = client.db(process.env.DB_NAME);

    console.log("MongoDB connected successfully!");

    await db.collection("products").createIndex(
      { sourceUrl: 1 },
      { unique: true }
    );

    await db.collection("categories").createIndex(
      { url: 1 },
      { unique: true }
    );

    await db.collection("scrapeRuns").createIndex(
      { startedAt: -1 }
    );

    console.log("MongoDB indexes created successfully!");

    return db;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
}

export function getDB() {
  if (!db) {
    throw new Error("Database is not connected.");
  }

  return db;
}

export async function closeDB() {
  await client.close();
  console.log("MongoDB connection closed.");
}
