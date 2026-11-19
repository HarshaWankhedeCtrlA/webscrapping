
import { chromium } from "playwright";

const URL =
  "https://robu.in/product/720-magnetic-micro-coreless-motor-55-mm-propeller-for-micro-quadcopters/";

async function inspectProduct() {
  let browser;

  try {
    browser = await chromium.launch({
      headless: false
    });

    const page = await browser.newPage();

    console.log("Opening product page...");

    const response = await page.goto(URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log("HTTP status:", response?.status());
    console.log("Final URL:", page.url());

    await page.waitForTimeout(10000);

    const result = await page.evaluate(() => {
      const bodyText = document.body?.innerText || "";

      const jsonLdScripts = Array.from(
        document.querySelectorAll(
          'script[type="application/ld+json"]'
        )
      ).map((script) => script.textContent);

      const productElements = Array.from(
        document.querySelectorAll("*")
      )
        .filter((element) => {
          const text = element.innerText || "";
          return (
            text.length > 100 &&
            /description|specification|reviews|add to cart/i.test(
              text
            )
          );
        })
        .slice(0, 15)
        .map((element) => ({
          tag: element.tagName,
          id: element.id,
          className: String(element.className || "").slice(0, 200),
          text: (element.innerText || "").slice(0, 500)
        }));

      return {
        title: document.title,
        bodyLength: bodyText.length,
        bodyStart: bodyText.slice(0, 3000),
        bodyEnd: bodyText.slice(-1500),
        jsonLdCount: jsonLdScripts.length,
        jsonLdScripts,
        productElements
      };
    });

    console.log("\n========== PAGE INFORMATION ==========");
    console.log("Title:", result.title);
    console.log("Body text length:", result.bodyLength);

    console.log("\n========== BODY TEXT START ==========");
    console.log(result.bodyStart);

    console.log("\n========== BODY TEXT END ==========");
    console.log(result.bodyEnd);

    console.log("\n========== JSON-LD ==========");
    console.log("JSON-LD scripts:", result.jsonLdCount);
    console.log(JSON.stringify(result.jsonLdScripts, null, 2));

    console.log("\n========== POSSIBLE PRODUCT ELEMENTS ==========");
    console.log(JSON.stringify(result.productElements, null, 2));

  } catch (error) {
    console.error("Inspection failed:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

inspectProduct();
