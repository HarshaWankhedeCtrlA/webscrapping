
import { chromium } from "playwright";

async function testBrowser() {
  let browser;

  try {
    console.log("Launching browser...");

    browser = await chromium.launch({
      headless: false
    });

    const page = await browser.newPage();

    console.log("Opening Robu.in...");

    await page.goto(
      "https://robu.in/product-category/drone-parts/",
      {
        waitUntil: "domcontentloaded",
        timeout: 60000
      }
    );

    console.log("Website opened successfully!");

    console.log("Page title:", await page.title());

    console.log("Current URL:", page.url());

    await page.screenshot({
      path: "output/robu-home-test.png",
      fullPage: true
    });

    console.log("Screenshot saved in output folder.");

    await page.waitForTimeout(5000);

  } catch (error) {
    console.error("Browser test failed:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

testBrowser();
