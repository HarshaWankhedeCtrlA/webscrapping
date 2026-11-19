
import { chromium } from "playwright";

const PRODUCT_URL =
  "https://robu.in/product/multirotor-esc-power-distribution-battery-board-quadcopter/";

async function inspectProduct() {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage();

    // Monitor product page JavaScript bundle
    page.on("response", (response) => {
      const url = response.url();

      if (
        url.includes("/product/") ||
        url.includes("static/chunks/app/product")
      ) {
        console.log(
          `[${response.status()}] ${url}`
        );
      }
    });

    page.on("pageerror", (error) => {
      console.log("PAGE ERROR:", error.message);
    });

    console.log("Opening second product page...");

    const response = await page.goto(PRODUCT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForTimeout(5000);

    console.log("\n========== PAGE STATUS ==========");
    console.log("HTTP status:", response?.status());
    console.log("Final URL:", page.url());
    console.log("Title:", await page.title());

    // Read visible page text
    const bodyText = await page.locator("body").innerText();

    console.log("\n========== BODY TEXT ==========");
    console.log("Body text length:", bodyText.length);
    console.log(bodyText.slice(0, 3000));

    // Read Product JSON-LD
    const jsonLdProducts = await page.locator(
      'script[type="application/ld+json"]'
    ).evaluateAll((scripts) => {
      return scripts.flatMap((script) => {
        try {
          const data = JSON.parse(script.textContent);

          const items = Array.isArray(data) ? data : [data];

          return items.filter((item) => {
            const type = item["@type"];

            return type === "Product" ||
              (Array.isArray(type) && type.includes("Product"));
          });
        } catch {
          return [];
        }
      });
    });

    console.log("\n========== JSON-LD PRODUCT ==========");

    if (jsonLdProducts.length > 0) {
      const product = jsonLdProducts[0];

      console.log({
        name: product.name,
        sku: product.sku,
        description: product.description,
        descriptionLength: product.description?.length || 0,
        price: product.offers?.price,
        imageCount: product.image?.length || 0,
        rating: product.aggregateRating?.ratingValue,
        reviewCount: product.aggregateRating?.reviewCount,
        reviewsFound: product.review?.length || 0,
      });
    } else {
      console.log("Product JSON-LD not found.");
    }

    // Inspect Next.js server-rendered data
    const html = await page.content();

    console.log("\n========== DESCRIPTION MARKERS ==========");

    const markers = [
      "If you are new in multirotor",
      "Package Includes",
      "Package Include",
      "Features",
      "Technical",
      "Specifications",
      "You May Also Like",
    ];

    for (const marker of markers) {
      console.log(
        `${marker}: ${html.includes(marker) || bodyText.includes(marker)
          ? "FOUND"
          : "NOT FOUND"}`
      );
    }

    const nextDataBlocks = await page.locator(
      'script:has-text("__next_f.push")'
    ).count();

    console.log("\nNext.js data blocks:", nextDataBlocks);

  } catch (error) {
    console.error("Inspection failed:", error.message);
  } finally {
    await browser.close();
  }
}

inspectProduct();
