
import { chromium } from "playwright";

const URL = "https://robu.in/product-category/drone-parts/";

async function inspectCategories() {
  let browser;

  try {
    browser = await chromium.launch({
      headless: false
    });

    const page = await browser.newPage();

    console.log("Opening Drone Parts page...");

    await page.goto(URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(3000);

    // Check common WooCommerce category and product selectors
    const selectorCounts = await page.evaluate(() => {
      const selectors = [
        ".product-category",
        ".woocommerce-loop-category__link",
        ".products li.product",
        ".woocommerce-loop-product__title",
        "nav.woocommerce-breadcrumb"
      ];

      const result = {};

      for (const selector of selectors) {
        result[selector] = document.querySelectorAll(selector).length;
      }

      return result;
    });

    console.log("\n--- SELECTOR COUNTS ---");
    console.log(selectorCounts);

    // Find links to drone-parts subcategories
    const categoryLinks = await page.evaluate(() => {
      const links = Array.from(
        document.querySelectorAll("a[href]")
      );

      return links
        .map(link => ({
          name: link.innerText.trim().replace(/\s+/g, " "),
          url: link.href
        }))
        .filter(link =>
          link.name &&
          link.url.includes("/product-category/") &&
          link.url !== window.location.href
        );
    });

    // Remove duplicate URLs
    const uniqueCategories = [
      ...new Map(
        categoryLinks.map(item => [item.url, item])
      ).values()
    ];

    console.log("\n--- CATEGORY LINKS FOUND ---");
    console.log("Total:", uniqueCategories.length);

    console.log(
      JSON.stringify(uniqueCategories, null, 2)
    );

    // Save inspection results
    await page.screenshot({
      path: "output/category-inspection.png",
      fullPage: true
    });

    console.log("\nInspection completed!");

    await page.waitForTimeout(2000);

  } catch (error) {
    console.error("Inspection failed:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

inspectCategories();
