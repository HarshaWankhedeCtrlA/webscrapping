
import fs from "fs";
import { connectDB, getDB, closeDB } from "./config/db.js";

async function saveProduct() {
  try {
    // Read extracted product JSON
    const filePath = "output/excel/single-product.json";

    const product = JSON.parse(
      fs.readFileSync(filePath, "utf-8")
    );

    // Connect MongoDB
    await connectDB();

    const db = getDB();

    // Save product using sourceUrl as unique identifier
    const result = await db.collection("products").updateOne(
      { sourceUrl: product.productUrl },
      {
        $set: {
          ...product,
          sourceUrl: product.productUrl,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    console.log("\nProduct saved successfully!");
    console.log("Inserted:", result.upsertedCount);
    console.log("Modified:", result.modifiedCount);

    // Verify saved product
    const savedProduct = await db.collection("products").findOne({
      sourceUrl: product.productUrl
    });

    console.log("\nSaved product from MongoDB:");
    console.log(JSON.stringify(savedProduct, null, 2));

  } catch (error) {
    console.error("MongoDB save failed:", error.message);
  } finally {
    await closeDB();
  }
}

saveProduct();
