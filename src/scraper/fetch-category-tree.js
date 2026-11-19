
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

const ROOT_SLUG = "drone-parts";

const DELAY_MS = 1500;

const query = `
query CategoryMeta($slug: String!) {
  visibleMenuCategories(
    slug: $slug
    parent: true
    limit: 1
    page: 1
    sort: "latest"
    search: ""
  ) {
    status
    message
    data {
      id
      name
      slug
      description
      banner
      has_children
      children {
        id
        name
        slug
        description
        banner
        products_count
      }
    }
  }
}
`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCategory(slug, page) {
  return await page.evaluate(
    async ({ query, graphqlUrl, slug }) => {
      const response = await fetch(graphqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          variables: { slug }
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

      const data =
        result?.data?.visibleMenuCategories?.data;

      return Array.isArray(data) ? data[0] : data;
    },
    {
      query,
      graphqlUrl: GRAPHQL_URL,
      slug
    }
  );
}

async function main() {
  let browser;

  try {
    await connectDB();

    const db = getDB();
    const collection = db.collection("categories");

    browser = await chromium.launch({
      headless: false
    });

    const page = await browser.newPage();

    console.log("Opening Drone Parts category...");

    await page.goto(ROOT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(3000);

    const queue = [
      {
        slug: ROOT_SLUG,
        parentId: null,
        parentName: null,
        depth: 0,
        categoryPath: ["Drone Parts"]
      }
    ];

    const visited = new Set();
    const categories = [];

    while (queue.length > 0) {
      const current = queue.shift();

      if (visited.has(current.slug)) {
        continue;
      }

      visited.add(current.slug);

      console.log(
        `Fetching category: ${current.slug}`
      );

      const data = await fetchCategory(
        current.slug,
        page
      );

      if (!data) {
        console.log(
          `No category data found: ${current.slug}`
        );
        continue;
      }

      const category = {
        categoryId: String(data.id),
        name: data.name,
        slug: data.slug,
        url: `https://robu.in/product-category/${data.slug}/`,
        description: data.description || "",
        banner: data.banner || "",
        hasChildren: Boolean(data.has_children),
        parentId: current.parentId,
        parentName: current.parentName,
        depth: current.depth,
        categoryPath: current.categoryPath,
        productsCount: Number(
          data.products_count || 0
        ),
        collectedAt: new Date()
      };

      categories.push(category);

      await collection.updateOne(
        { url: category.url },
        {
          $set: category,
          $setOnInsert: {
            createdAt: new Date()
          }
        },
        { upsert: true }
      );

      const children = data.children || [];

      console.log(
        `  ${data.name}: ${children.length} direct subcategories`
      );

      for (const child of children) {
        if (!child.slug || visited.has(child.slug)) {
          continue;
        }

        queue.push({
          slug: child.slug,
          parentId: String(data.id),
          parentName: data.name,
          depth: current.depth + 1,
          categoryPath: [
            ...current.categoryPath,
            child.name
          ]
        });
      }

      await sleep(DELAY_MS);
    }

    const outputDir = path.join("output", "excel");

    fs.mkdirSync(outputDir, {
      recursive: true
    });

    const outputPath = path.join(
      outputDir,
      "robu-category-tree.json"
    );

    fs.writeFileSync(
      outputPath,
      JSON.stringify(categories, null, 2),
      "utf-8"
    );

    console.log("\n========== CATEGORY EXTRACTION COMPLETED ==========");
    console.log("Total categories:", categories.length);
    console.log("Saved in MongoDB:", categories.length);
    console.log("JSON file:", outputPath);

    console.log("\nCategory hierarchy:");

    for (const category of categories) {
      console.log(
        `${"  ".repeat(category.depth)}- ${category.name}`
      );
    }

  } catch (error) {
    console.error("\nCategory extraction failed:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }

    await closeDB();
  }
}

main();
