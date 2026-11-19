
import { chromium } from "playwright";

const URL =
  "https://robu.in/product/720-magnetic-micro-coreless-motor-55-mm-propeller-for-micro-quadcopters/";

async function inspectProductDetail() {
  let browser;

  try {
    browser = await chromium.launch({
      headless: false
    });

    const page = await browser.newPage();

    let graphqlCount = 0;

    page.on("response", async (response) => {
      if (!response.url().includes("/api/proxy/graphql/")) {
        return;
      }

      graphqlCount++;

      try {
        const request = response.request();
        const postData = request.postData();

        if (!postData) return;

        const requestData = JSON.parse(postData);
        const responseData = await response.json();

        console.log("\n======================================");
        console.log("GRAPHQL REQUEST:", graphqlCount);
        console.log("======================================");

        console.log("\nQUERY:");
        console.log(requestData.query || "No query found");

        console.log("\nVARIABLES:");
        console.log(
          JSON.stringify(requestData.variables || {}, null, 2)
        );

        console.log("\nRESPONSE STATUS:");
        console.log(response.status());

        console.log("\nRESPONSE DATA:");
        console.log(
          JSON.stringify(responseData.data || {}, null, 2).slice(0, 12000)
        );

        if (responseData.errors) {
          console.log("\nGRAPHQL ERRORS:");
          console.log(
            JSON.stringify(responseData.errors, null, 2)
          );
        }

      } catch (error) {
        console.log("GraphQL inspection error:", error.message);
      }
    });

    console.log("Opening product page...");

    await page.goto(URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(15000);

    console.log("\n======================================");
    console.log("INSPECTION COMPLETED");
    console.log("Total GraphQL requests:", graphqlCount);
    console.log("======================================");

  } catch (error) {
    console.error("Inspection failed:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

inspectProductDetail();
