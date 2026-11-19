
import { chromium } from "playwright";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { connectDB, getDB, closeDB } from "../config/db.js";

dotenv.config();

const CATEGORY_URL =
  "https://robu.in/product-category/drone-parts/";

const GRAPHQL_URL =
  "https://robu.in/api/proxy/graphql/";

const REQUEST_DELAY_MS = Number(
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

async function fetchPage(page, browserPage) {
  return await browserPage.evaluate(
    async ({ query, graphqlUrl, pageNumber }) => {
      const response = await fetch(graphqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          variables: {
            slug: "drone-parts",
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
        throw new Error("Category data not found");
      }

      return {
        products: data.products || [],
        pagination: data.pagination || {}
      };
    },
    {
      query,
      graphqlUrl: GRAPHQL_URL,
      pageNumber: page
    }
  );
}

async function exportExcel(products) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Robu Catalogue Migration";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Products");

  sheet.columns = [
    { header: "Product ID", key: "id", width: 15 },
    { header: "SKU", key: "sku", width: 18 },
    { header: "Product Name", key: "name", width: 55 },
    { header: "Slug", key: "slug", width: 45 },
    { header: "Price", key: "price", width: 15 },
    { header: "Sale Price", key: "sale_price", width: 15 },
    { header: "In Stock", key: "in_stock", width: 15 },
    { header: "MPN", key: "mpn", width: 20 },
    { header: "Categories", key: "categories", width: 35 },
    { header: "Product URL", key: "productUrl", width: 65 },
    { header: "Image URLs", key: "images", width: 80 }
  ];

  sheet.getRow(1).font = { bold: true };

  for (const product of products) {
    sheet.addRow({
      ...product,
      categories: (product.categories || []).join(", "),
      images: (product.images || []).join("\n")
    });
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: "A1",
    to: "K1"
  };

  const outputDir = path.join("output", "excel");

  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(
    outputDir,
    "robu-drone-parts-products.xlsx"
  );

  await workbook.xlsx.writeFile(outputPath);

  console.log("\nExcel file saved:", outputPath);
}

async function main() {
  let browser;

  try {
    await connectDB();

    const db = getDB();
    const collection = db.collection("products");

    browser = await chromium.launch({
      headless: false
    });

    const page = await browser.newPage();

    console.log("Opening Drone Parts category...");

    await page.goto(CATEGORY_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(3000);

    // First page determines the total page count
    const firstResult = await fetchPage(1, page);

    const totalPages = Number(
      firstResult.pagination.last_page || 1
    );

    const totalProducts = Number(
      firstResult.pagination.total || 0
    );

    console.log("\nTotal products:", totalProducts);
    console.log("Total pages:", totalPages);

    const allProducts = [];
    const seenUrls = new Set();

    async function saveProducts(pageProducts, pageNumber) {
      for (const item of pageProducts) {
        const productUrl =
          `https://robu.in/product/${item.slug}/`;

        if (seenUrls.has(productUrl)) {
          continue;
        }

        seenUrls.add(productUrl);

        const product = {
          ...item,
          sourceUrl: productUrl,
          productUrl,
          categorySource: "Drone Parts",
          collectedAt: new Date()
        };

        allProducts.push(product);

        await collection.updateOne(
          { sourceUrl: productUrl },
          {
            $set: product,
            $setOnInsert: {
              createdAt: new Date()
            }
          },
          { upsert: true }
        );
      }

      console.log(
        `Page ${pageNumber}/${totalPages}: ` +
        `${pageProducts.length} products fetched | ` +
        `${allProducts.length} unique products saved`
      );
    }

    await saveProducts(firstResult.products, 1);

    for (let pageNumber = 2; pageNumber <= totalPages; pageNumber++) {
      await sleep(REQUEST_DELAY_MS);

      const result = await fetchPage(pageNumber, page);

      await saveProducts(
        result.products,
        pageNumber
      );
    }

    await exportExcel(allProducts);

    console.log("\n========== COMPLETED ==========");
    console.log("Unique products:", allProducts.length);
    console.log("Expected products:", totalProducts);

  } catch (error) {
    console.error("\nCollection failed:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }

    await closeDB();
  }
}

main();
