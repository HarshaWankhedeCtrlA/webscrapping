
import { chromium } from "playwright";

const URL = "https://robu.in/product-category/drone-motor/";

async function inspectProducts() {
  let browser;

  try {
    browser = await chromium.launch({
      headless: false
    });

    const page = await browser.newPage();

    // Capture relevant network responses
    const apiResponses = [];

    page.on("response", async (response) => {
      const responseUrl = response.url();
      const contentType = response.headers()["content-type"] || "";

      if (
        /api|product|category|graphql|search/i.test(responseUrl) &&
        (contentType.includes("json") || contentType.includes("javascript"))
      ) {
        apiResponses.push({
          url: responseUrl,
          status: response.status(),
          contentType
        });
      }
    });

    console.log("Opening Robu.in Drone Motors page...");

    await page.goto(URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(5000);

    // Inspect actual page content
    const pageData = await page.evaluate(() => {
      const links = Array.from(
        document.querySelectorAll("a[href]")
      ).map((link) => ({
        text: link.innerText.trim().replace(/\s+/g, " "),
        href: link.href,
        className: String(link.className)
      }));

      const scripts = Array.from(
        document.querySelectorAll("script[src]")
      ).map(script => script.src);

      const nextData = document.querySelector(
        "#__NEXT_DATA__"
      )?.textContent;

      return {
        title: document.title,
        heading: document.body.innerText.slice(0, 5000),
        links: links.slice(0, 100),
        scripts,
        hasNextData: Boolean(nextData),
        nextDataPreview: nextData
          ? nextData.slice(0, 3000)
          : null
      };
    });

    console.log("\n========== PAGE TITLE ==========");
    console.log(pageData.title);

    console.log("\n========== VISIBLE PAGE TEXT ==========");
    console.log(pageData.heading);

    console.log("\n========== LINKS ==========");
    console.log(JSON.stringify(pageData.links, null, 2));

    console.log("\n========== SCRIPT FILES ==========");
    console.log(JSON.stringify(pageData.scripts, null, 2));

    console.log("\n========== NEXT DATA ==========");
    console.log("Has __NEXT_DATA__:", pageData.hasNextData);
    console.log(pageData.nextDataPreview);

    console.log("\n========== API / NETWORK RESPONSES ==========");
    console.log(JSON.stringify(apiResponses, null, 2));

    await page.screenshot({
      path: "output/nextjs-inspection.png",
      fullPage: true
    });

    console.log("\nInspection completed!");

  } catch (error) {
    console.error("Inspection failed:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

inspectProducts();
