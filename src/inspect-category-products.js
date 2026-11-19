
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const CATEGORY_URL =
  "https://robu.in/product-category/drone-parts/";

const GRAPHQL_URL =
  "https://robu.in/api/proxy/graphql/";

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

async function inspectCategoryProducts() {
  let browser;

  try {
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

    const result = await page.evaluate(
      async ({ query, graphqlUrl }) => {
        const response = await fetch(graphqlUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            query,
            variables: {
        slug: "60300-kv-agriculture-heavy-lift-drone-motors",
              limit: 20,
              categoryId: null,
              page: 1,
              sort: "",
              search: "",
              filters: [],
              minPrice: null,
              maxPrice: null
            }
          })
        });

        if (!response.ok) {
          throw new Error(
            `HTTP error: ${response.status}`
          );
        }

        return await response.json();
      },
      {
        query,
        graphqlUrl: GRAPHQL_URL
      }
    );

    if (result.errors) {
      console.log("GraphQL errors:", result.errors);
      return;
    }

    const categoryData =
      result?.data?.visibleMenuCategories?.data;

    const category = Array.isArray(categoryData)
      ? categoryData[0]
      : categoryData;

    if (!category) {
      throw new Error("Category data not found");
    }

    const products = category.products || [];
    const pagination = category.pagination || {};

    console.log("\nCategory product information:");
    console.log("Products fetched:", products.length);
    console.log("Total products:", pagination.total);
    console.log("Current page:", pagination.current_page);
    console.log("Last page:", pagination.last_page);

 console.log("\n========== DESCRIPTION COVERAGE ==========");

const withDescription = products.filter(
  (product) => product.description?.trim()
);

const withSpecification = products.filter(
  (product) => product.specification?.trim()
);

console.log("Products checked:", products.length);
console.log("With description:", withDescription.length);
console.log("Without description:", products.length - withDescription.length);
console.log("With specifications:", withSpecification.length);

console.log("\n========== PRODUCT DESCRIPTION LENGTHS ==========");

products.forEach((product) => {
  console.log({
    name: product.name,
    sku: product.sku,
    descriptionLength: product.description?.length || 0,
    specificationLength: product.specification?.length || 0
  });
});
    console.log(
      JSON.stringify(products[0] || null, null, 2)
    );

    const outputDir = path.join("output", "excel");

    fs.mkdirSync(outputDir, {
      recursive: true
    });

    fs.writeFileSync(
      path.join(outputDir, "category-products-test.json"),
      JSON.stringify(
        {
          category: "Drone Parts",
          pagination,
          products
        },
        null,
        2
      ),
      "utf-8"
    );

    console.log(
      "\nSaved: output/excel/category-products-test.json"
    );

  } catch (error) {
    console.error("\nError:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

inspectCategoryProducts();
