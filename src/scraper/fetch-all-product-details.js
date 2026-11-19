
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
        description
        specification
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
          result.errors.map(error => error.message).join("; ")
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
  let dbConnected = false;

  const processedProductUrls = new Set();

  const categorySummary = [];

  let totalUniqueProductsChecked = 0;
  let totalExistingProductsMatched = 0;
  let totalProductsUpdated = 0;
  let totalProductsNotFound = 0;
  let totalWithDescription = 0;
  let totalWithSpecification = 0;
  let totalWithoutDescription = 0;
  let totalWithoutSpecification = 0;
  let totalFailedProducts = 0;

  try {
    await connectDB();
    dbConnected = true;

    const db = getDB();

    const categoriesCollection =
      db.collection("categories");

    const productsCollection =
      db.collection("products");

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

    console.log("\nOpening Robu website...");

    await page.goto(ROOT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(3000);

    for (const category of categories) {
      console.log("\n==================================");
      console.log("Category:", category.name);
      console.log("Slug:", category.slug);
      console.log("==================================");

      const categoryStats = {
        category: category.name,
        slug: category.slug,
        expectedProducts: 0,
        totalPages: 0,
        uniqueProductsChecked: 0,
        matchedExistingProducts: 0,
        productsUpdated: 0,
        productsNotFound: 0,
        failedProducts: 0,
        status: "COMPLETED"
      };

      try {
        const firstResult = await fetchCategoryPage(
          page,
          category.slug,
          1
        );

        const totalPages = Number(
          firstResult.pagination.last_page || 1
        );

        categoryStats.expectedProducts = Number(
          firstResult.pagination.total || 0
        );

        categoryStats.totalPages = totalPages;

        console.log(
          "Expected products:",
          categoryStats.expectedProducts
        );

        console.log("Total pages:", totalPages);

        async function updateProducts(items, pageNumber) {
          for (const item of items) {
            if (!item.slug) {
              continue;
            }

            const productUrl =
              `https://robu.in/product/${item.slug}/`;

            // Avoid processing the same product again
            // if it appears in another category.
            if (processedProductUrls.has(productUrl)) {
              continue;
            }

            const hasDescription =
              typeof item.description === "string" &&
              item.description.trim().length > 0;

            const hasSpecification =
              typeof item.specification === "string" &&
              item.specification.trim().length > 0;

            totalUniqueProductsChecked++;
            categoryStats.uniqueProductsChecked++;

            if (hasDescription) {
              totalWithDescription++;
            } else {
              totalWithoutDescription++;
            }

            if (hasSpecification) {
              totalWithSpecification++;
            } else {
              totalWithoutSpecification++;
            }

            // Update only fields that actually contain data.
            const updateFields = {};

            if (hasDescription) {
              updateFields.description = item.description;
            }

            if (hasSpecification) {
              updateFields.specification = item.specification;
            }

            try {
              if (Object.keys(updateFields).length === 0) {
                processedProductUrls.add(productUrl);
                continue;
              }

              // No upsert: only existing MongoDB records
              // can be updated by this script.
              const result = await productsCollection.updateOne(
                { sourceUrl: productUrl },
                {
                  $set: updateFields
                }
              );

              if (result.matchedCount === 0) {
                totalProductsNotFound++;
                categoryStats.productsNotFound++;

                console.log(
                  "Product not found in MongoDB:",
                  item.sku,
                  item.name
                );
              } else {
                totalExistingProductsMatched++;
                categoryStats.matchedExistingProducts++;

                if (result.modifiedCount > 0) {
                  totalProductsUpdated++;
                  categoryStats.productsUpdated++;
                }
              }

              processedProductUrls.add(productUrl);

            } catch (error) {
              totalFailedProducts++;
              categoryStats.failedProducts++;

              console.error(
                "Product update failed:",
                item.sku,
                error.message
              );
            }
          }

          console.log(
            `Page ${pageNumber}/${totalPages}: ` +
            `${items.length} products received`
          );

          console.log(
            "Unique products checked so far:",
            totalUniqueProductsChecked
          );
        }

        await updateProducts(
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

          await updateProducts(
            result.products,
            pageNumber
          );
        }

        console.log(
          "Unique products checked in category:",
          categoryStats.uniqueProductsChecked
        );

        console.log(
          "Existing products matched:",
          categoryStats.matchedExistingProducts
        );

        console.log(
          "Products updated:",
          categoryStats.productsUpdated
        );

      } catch (error) {
        categoryStats.status = "FAILED";
        categoryStats.error = error.message;

        console.error(
          "Category failed:",
          category.name,
          error.message
        );
      }

      categorySummary.push(categoryStats);

      // Save progress after every category.
      const outputDir = path.join("output", "excel");

      fs.mkdirSync(outputDir, {
        recursive: true
      });

      fs.writeFileSync(
        path.join(
          outputDir,
          "product-details-summary.json"
        ),
        JSON.stringify(
          {
            categorySummary,
            totals: {
              totalUniqueProductsChecked,
              totalExistingProductsMatched,
              totalProductsUpdated,
              totalProductsNotFound,
              totalWithDescription,
              totalWithSpecification,
              totalWithoutDescription,
              totalWithoutSpecification,
              totalFailedProducts
            }
          },
          null,
          2
        ),
        "utf-8"
      );

      await sleep(DELAY_MS);
    }

    const uniqueProductsInDB =
      await productsCollection.countDocuments();

    console.log("\n==================================");
    console.log("PRODUCT DETAILS COLLECTION COMPLETED");
    console.log("==================================");

    console.log(
      "Categories:",
      categorySummary.length
    );

    console.log(
      "Unique products checked:",
      totalUniqueProductsChecked
    );

    console.log(
      "Existing products matched:",
      totalExistingProductsMatched
    );

    console.log(
      "Products updated:",
      totalProductsUpdated
    );

    console.log(
      "Products not found in MongoDB:",
      totalProductsNotFound
    );

    console.log(
      "Products with description:",
      totalWithDescription
    );

    console.log(
      "Products with specification:",
      totalWithSpecification
    );

    console.log(
      "Products without description:",
      totalWithoutDescription
    );

    console.log(
      "Products without specification:",
      totalWithoutSpecification
    );

    console.log(
      "Failed product updates:",
      totalFailedProducts
    );

    console.log(
      "Unique products currently in MongoDB:",
      uniqueProductsInDB
    );

    console.log(
      "Summary: output/excel/product-details-summary.json"
    );

  } catch (error) {
    console.error(
      "\nProduct details collection failed:",
      error.message
    );

  } finally {
    if (browser) {
      await browser.close();
    }

    if (dbConnected) {
      await closeDB();
    }
  }
}

main();
