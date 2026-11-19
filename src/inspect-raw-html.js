
import { chromium } from "playwright";

const URL =
  "https://robu.in/product/720-magnetic-micro-coreless-motor-55-mm-propeller-for-micro-quadcopters/";

async function inspectRawHTML() {
  let browser;

  try {
    browser = await chromium.launch({ headless: false });

    const page = await browser.newPage();

    console.log("Requesting original HTML...");

    const response = await page.goto(URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    const html = await response.text();

    console.log("HTTP status:", response.status());
    console.log("HTML length:", html.length);

    const searchTerms = [
      "If you are new in multirotor",
      "Features",
      "Package Includes",
      "Model:",
      "description",
      "You May Also Like"
    ];

    console.log("\n========== SEARCH RESULTS ==========");

    for (const term of searchTerms) {
      const index = html.toLowerCase().indexOf(term.toLowerCase());

      console.log(`\n${term}:`, index !== -1 ? "FOUND" : "NOT FOUND");

      if (index !== -1) {
        console.log(
          html.substring(
            Math.max(0, index - 300),
            Math.min(html.length, index + 1500)
          )
        );
      }
    }

    console.log("\n========== HTML CHECK COMPLETED ==========");

  } catch (error) {
    console.error("Inspection failed:", error.message);
  } finally {
    if (browser) await browser.close();
  }
}

inspectRawHTML();
