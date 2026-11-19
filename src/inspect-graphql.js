
import { chromium } from "playwright";

const URL = "https://robu.in/product-category/drone-motor/";

async function inspectGraphQL() {
  let browser;

  try {
    browser = await chromium.launch({
      headless: false
    });

    const page = await browser.newPage();

    let requestCount = 0;

    page.on("response", async (response) => {
      if (!response.url().includes("/api/proxy/graphql/")) {
        return;
      }

      requestCount++;

      try {
        const request = response.request();
        const body = request.postData();

        if (!body) return;

        const requestData = JSON.parse(body);
        const query = requestData.query || "";

        const data = await response.json();
        const responseKeys = Object.keys(data.data || {});

        console.log("\n==================================");
        console.log("GRAPHQL REQUEST:", requestCount);
        console.log("==================================");

        console.log("Status:", response.status());

        console.log("\n--- GRAPHQL QUERY ---");
        console.log(query.slice(0, 4000));

        console.log("\n--- VARIABLES ---");
        console.log(JSON.stringify(requestData.variables, null, 2));

        console.log("\n--- RESPONSE DATA KEYS ---");
        console.log(responseKeys);

        console.log("\n--- GRAPHQL ERRORS ---");
        console.log(JSON.stringify(data.errors || []));

        const responseText = JSON.stringify(data.data || {});

        const containsProductData =
          /product|category|price|sku|attribute|specification/i.test(
            responseText
          );

        if (containsProductData) {
          console.log("\n*** POSSIBLE PRODUCT/CATEGORY DATA ***");
          console.log(responseText.slice(0, 6000));
        }

      } catch (error) {
        console.log("Inspection error:", error.message);
      }
    });

    console.log("Opening Robu.in...");

    await page.goto(URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log("Waiting for GraphQL requests...");

    await page.waitForTimeout(15000);

    console.log("\nTotal GraphQL requests:", requestCount);

  } catch (error) {
    console.error("Inspection failed:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

inspectGraphQL();
