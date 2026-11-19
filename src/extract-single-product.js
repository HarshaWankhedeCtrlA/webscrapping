
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const URL =
  "https://robu.in/product/720-magnetic-micro-coreless-motor-55-mm-propeller-for-micro-quadcopters/";

async function extractProduct() {
  let browser;

  try {
    browser = await chromium.launch({
      headless: false
    });

    const page = await browser.newPage();

    console.log("Opening product page...");

    await page.goto(URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(8000);

    const product = await page.evaluate(() => {
      const clean = (value) =>
        value?.replace(/\s+/g, " ").trim() || "";

      // 1. Extract JSON-LD product data
      const scripts = Array.from(
        document.querySelectorAll(
          'script[type="application/ld+json"]'
        )
      );

      let structuredProduct = null;

      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);

          const products = Array.isArray(data)
            ? data
            : [data];

          structuredProduct = products.find(
            (item) => item["@type"] === "Product"
          );

          if (structuredProduct) break;
        } catch (error) {
          // Ignore invalid JSON-LD scripts
        }
      }

      if (!structuredProduct) {
        throw new Error("Product JSON-LD not found");
      }

      // 2. Extract full description
      const bodyText = document.body.innerText;

      const startMarker =
        "If you are new in multirotor/drone hobby area";

      const endMarker = "You May Also Like";

      const startIndex = bodyText.indexOf(startMarker);

      const endIndex = bodyText.indexOf(
        endMarker,
        startIndex
      );

      let fullDescription = "";

      if (startIndex !== -1 && endIndex !== -1) {
        fullDescription = bodyText
          .substring(startIndex, endIndex)
          .trim();
      }

      // 3. Extract specifications
      const specificationText =
        structuredProduct.description || "";

      const specifications = {};

      specificationText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          const separator = line.indexOf(":");

          if (separator !== -1) {
            const key = line.slice(0, separator).trim();
            const value = line.slice(separator + 1).trim();

            if (key && value) {
              specifications[key] = value;
            }
          }
        });

      // 4. Extract price and availability
      const offer = structuredProduct.offers || {};

      // 5. Extract reviews
      const reviews = (
        structuredProduct.review || []
      ).map((review) => ({
        author: review.author?.name || "",
        rating: review.reviewRating?.ratingValue || null,
        date: review.datePublished || "",
        comment: review.reviewBody || ""
      }));

      return {
        name: structuredProduct.name || "",
        sku: structuredProduct.sku || "",

        productUrl:
          structuredProduct.offers?.url || location.href,

        price: offer.price
          ? Number(offer.price)
          : null,

        currency: offer.priceCurrency || "INR",

        availability:
          offer.availability?.split("/").pop() || "",

        description: fullDescription,

        specifications,

        images: Array.isArray(structuredProduct.image)
          ? structuredProduct.image
          : structuredProduct.image
            ? [structuredProduct.image]
            : [],

        rating:
          structuredProduct.aggregateRating?.ratingValue || null,

        reviewCount:
          structuredProduct.aggregateRating?.reviewCount || 0,

        reviews
      };
    });

    console.log(
      "\nDescription length:",
      product.description.length
    );

    console.log(
      "Description extracted:",
      product.description.length > 0
    );

    // 6. Save JSON output
    const outputDir = path.join("output", "excel");

    fs.mkdirSync(outputDir, {
      recursive: true
    });

    const outputPath = path.join(
      outputDir,
      "single-product.json"
    );

    fs.writeFileSync(
      outputPath,
      JSON.stringify(product, null, 2),
      "utf-8"
    );

    console.log("\n========== EXTRACTED PRODUCT ==========");

    console.log(JSON.stringify(product, null, 2));

    console.log("\nSaved successfully:", outputPath);

  } catch (error) {
    console.error("\nExtraction failed:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

extractProduct();
