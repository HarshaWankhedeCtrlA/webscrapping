import { connectDB, closeDB } from "./config/db.js";

async function testMongoDB() {
  try {
    const db = await connectDB();

    await db.command({ ping: 1 });

    console.log("Database name:", db.databaseName);
    console.log("MongoDB test successful!");
  } catch (error) {
    console.error("Test failed:", error.message);
  } finally {
    await closeDB();
  }
}

testMongoDB();