
import { connectDB, getDB, closeDB } from "./config/db.js";

async function main() {
  let connected = false;

  try {
    await connectDB();
    connected = true;

    const db = getDB();
    const products = db.collection("products");

    const total = await products.countDocuments();

    const withDescription = await products.countDocuments({
      description: { $exists: true, $ne: "" }
    });

    // New scraper field: specification (singular)
    const withSpecification = await products.countDocuments({
      specification: { $exists: true, $nin: ["", null] }
    });

    // Older field: specifications (plural)
    const withSpecifications = await products.countDocuments({
      specifications: { $exists: true, $ne: null }
    });

    const withImages = await products.countDocuments({
      images: { $exists: true, $ne: [] }
    });

    const withReviews = await products.countDocuments({
      reviews: { $exists: true, $ne: [] }
    });

    const withProductUrl = await products.countDocuments({
      productUrl: { $exists: true, $ne: "" }
    });

    // Count products having either specification field.
    const withAnySpecification = await products.countDocuments({
      $or: [
        { specification: { $exists: true, $nin: ["", null] } },
        { specifications: { $exists: true, $ne: null } }
      ]
    });

    console.log("\n========== PRODUCT DETAIL COVERAGE ==========");
    console.log("Total products:", total);
    console.log("Products with description:", withDescription);
    console.log("Products with specification (new field):", withSpecification);
    console.log("Products with specifications (old field):", withSpecifications);
    console.log("Products with either specification field:", withAnySpecification);
    console.log("Products without either specification field:", total - withAnySpecification);
    console.log("Products with images:", withImages);
    console.log("Products with reviews:", withReviews);
    console.log("Products with product URL:", withProductUrl);

    const sample = await products.findOne(
      {},
      {
        projection: {
          sku: 1,
          name: 1,
          productUrl: 1,
          description: 1,
          specification: 1,
          specifications: 1,
          images: 1,
          categoryAssignments: 1
        }
      }
    );

    console.log("\nSample product:");
    console.log(JSON.stringify(sample, null, 2));

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    if (connected) {
      await closeDB();
    }
  }
}

main();
