
import { chromium } from "playwright";

const CATEGORY_URL =
  "https://robu.in/product-category/60300-kv-agriculture-heavy-lift-drone-motors/";

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
      id
      name
      products {
        id
        sku
        name
        slug
        price
        images
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

async function main() {
  let browser;

  try {
    browser = await chromium.launch({
      headless: false
    });

    const page = await browser.newPage();

    console.log("Opening subcategory...");

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
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
      },
      {
        query,
        graphqlUrl: GRAPHQL_URL
      }
    );

    if (result.errors?.length) {
      throw new Error(
        result.errors.map(e => e.message).join("; ")
      );
    }

    const categoryData =
      result?.data?.visibleMenuCategories?.data;

    const category = Array.isArray(categoryData)
      ? categoryData[0]
      : categoryData;

    if (!category) {
      throw new Error("Subcategory data not found");
    }

    const products = category.products || [];

    console.log("\nSubcategory:", category.name);
    console.log("Category ID:", category.id);
    console.log(
      "Total products:",
      category.pagination?.total
    );
    console.log(
      "Total pages:",
      category.pagination?.last_page
    );

    console.log("\nFirst product:");
    console.log(
      JSON.stringify(products[0] || null, null, 2)
    );

    const sunnySkyProducts = products.filter(product =>
      product.name.toLowerCase().includes("sunny sky")
    );

    console.log("\nSunny Sky products on page 1:");

    console.log(
      JSON.stringify(sunnySkyProducts, null, 2)
    );

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main();
