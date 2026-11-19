
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  connectDB,
  getDB,
  closeDB
} from "../config/db.js";

dotenv.config();

const ROOT_URL =
  "https://robu.in/product-category/drone-parts/";

const GRAPHQL_URL =
  "https://robu.in/api/proxy/graphql/";

const DELAY_MS = Number(
  process.env.REQUEST_DELAY_MS || 1500
);

const query = `
query CategoryProducts(
  $slug: String!,
  $limit: Int,
  $categoryId: ID,
  $page: Int,
  $sort: String!,
  $search: String!,
  $filters: [AttributeFilterInput!],
  $minPrice: Float,
  $maxPrice: Float
) {
  visibleMenuCategories(
    parent: true
    limit: $limit
    categoryId: $categoryId
    slug: $slug
    page: $page
    sort: $sort
    search: $search
    filters: $filters
    minPrice: $minPrice
    maxPrice: $maxPrice
  ) {
    status
    message
    data {
      products {
        id
        sku
        name
        slug
        price
        sale_price
        images
        in_stock
        mpn
        categories
      }
      pagination {
        current_page
        per_page
        total
        last_page
      }
    }
  }
}
`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCategoryPage(page, slug, pageNumber) {
  return await page.evaluate(
    async ({ query, graphqlUrl, slug, pageNumber }) => {
      const response = await fetch(graphqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          variables: {
            slug,
            limit: 20,
            categoryId: null,
            page: pageNumber,
            sort: "",
            search: "",
            filters: [],
            minPrice: null,
            maxPrice: null
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.errors?.length) {
        throw new Error(
          result.errors.map(e => e.message).join("; ")
        );
      }

      const category =
        result?.data?.visibleMenuCategories?.data;

      const data = Array.isArray(category)
        ? category[0]
        : category;

      if (!data) {
        throw new Error(`No data returned for ${slug}`);
      }

      return {
        products: data.products || [],
        pagination: data.pagination || {}
      };
    },
    {
      query,
      graphqlUrl: GRAPHQL_URL,
      slug,
      pageNumber
    }
  );
}

async function main() {
  let browser;

  try {
    await connectDB();

    const db = getDB();

    const categoriesCollection =
      db.collection("categories");

    const productsCollection =
      db.collection("products");

    // Read all categories collected by fetch-category-tree.js
    const categories = await categoriesCollection
      .find({})
      .sort({ depth: 1, name: 1 })
      .toArray();

    if (categories.length === 0) {
      throw new Error(
        "No categories found. Run fetch-category-tree.js first."
      );
    }

    console.log("\nTotal categories:", categories.length);

    browser = await chromium.launch({
      headless: false
    });

    const page = await browser.newPage();

    console.log("\nOpening Drone Parts website...");

    await page.goto(ROOT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(3000);

    let totalProductsFetched = 0;
    let totalAssignments = 0;

    const categorySummary = [];

    for (const category of categories) {
      console.log("\n----------------------------------");
      console.log("Category:", category.name);
      console.log("Slug:", category.slug);

      let firstResult;

      try {
        firstResult = await fetchCategoryPage(
          page,
          category.slug,
          1
        );
      } catch (error) {
        console.error(
          "Category fetch failed:",
          error.message
        );

        categorySummary.push({
          category: category.name,
          slug: category.slug,
          status: "FAILED",
          error: error.message
        });

        continue;
      }

      const totalPages = Number(
        firstResult.pagination.last_page || 1
      );

      const expectedProducts = Number(
        firstResult.pagination.total || 0
      );

      console.log("Expected products:", expectedProducts);
      console.log("Total pages:", totalPages);

      let categoryProducts = 0;

      const categoryAssignment = {
        categoryId: String(category.categoryId),
        categoryName: category.name,
        categorySlug: category.slug,
        categoryUrl: category.url,
        categoryPath: category.categoryPath || []
      };

      async function savePageProducts(items, pageNumber) {
        for (const item of items) {
          if (!item.slug) {
            continue;
          }

          const productUrl =
            `https://robu.in/product/${item.slug}/`;

          // Update listing fields only.
          // Existing detailed product data is preserved.
          await productsCollection.updateOne(
            { sourceUrl: productUrl },
            {
              $set: {
                productId: String(item.id),
                sku: item.sku || "",
                name: item.name || "",
                slug: item.slug,
                price: item.price ?? null,
                sale_price: item.sale_price ?? null,
                images: item.images || [],
                in_stock: item.in_stock ?? false,
                mpn: item.mpn || "",
                productUrl,
                sourceUrl: productUrl,
                listingUpdatedAt: new Date()
              },

              $addToSet: {
                categoryAssignments: categoryAssignment,
                categoryNames: category.name,
                sourceCategoryLabels: {
                  $each: item.categories || []
                }
              },

              $setOnInsert: {
                createdAt: new Date()
              }
            },
            { upsert: true }
          );

          categoryProducts++;
          totalProductsFetched++;
          totalAssignments++;
        }

        console.log(
          `Page ${pageNumber}/${totalPages}: ` +
          `${items.length} products processed`
        );
      }

      await savePageProducts(
        firstResult.products,
        1
      );

      for (
        let pageNumber = 2;
        pageNumber <= totalPages;
        pageNumber++
      ) {
        await sleep(DELAY_MS);

        const result = await fetchCategoryPage(
          page,
          category.slug,
          pageNumber
        );

        await savePageProducts(
          result.products,
          pageNumber
        );
      }

      console.log(
        "Category products processed:",
        categoryProducts
      );

      categorySummary.push({
        category: category.name,
        slug: category.slug,
        expectedProducts,
        processedProducts: categoryProducts,
        totalPages,
        status: "COMPLETED"
      });

      // Small pause before starting the next category
      await sleep(DELAY_MS);
    }

    const outputDir = path.join("output", "excel");

    fs.mkdirSync(outputDir, {
      recursive: true
    });

    const outputPath = path.join(
      outputDir,
      "category-product-summary.json"
    );

    fs.writeFileSync(
      outputPath,
      JSON.stringify(categorySummary, null, 2),
      "utf-8"
    );

    const uniqueProducts =
      await productsCollection.countDocuments();

    console.log("\n========== COMPLETED ==========");
    console.log("Categories processed:", categorySummary.length);
    console.log("Product assignments processed:", totalAssignments);
    console.log("Unique products in MongoDB:", uniqueProducts);
    console.log("Summary file:", outputPath);

  } catch (error) {
    console.error(
      "\nCategory product extraction failed:",
      error.message
    );
  } finally {
    if (browser) {
      await browser.close();
    }

    await closeDB();
  }
}

main();
