
import { chromium } from "playwright";

const URL =
  "https://robu.in/product/720-magnetic-micro-coreless-motor-55-mm-propeller-for-micro-quadcopters/";

async function inspectPage() {
  let browser;

  try {
    browser = await chromium.launch({ headless: false });

    const page = await browser.newPage();

    page.on("response", (response) => {
      const request = response.request();

      if (
        request.resourceType() === "script" ||
        request.resourceType() === "document"
      ) {
        console.log(
          `[${response.status()}] ${request.resourceType()} ${response.url()}`
        );
      }
    });

    page.on("requestfailed", (request) => {
      console.log(
        "\nFAILED:",
        request.url(),
        request.failure()?.errorText
      );
    });

    page.on("pageerror", (error) => {
      console.log("\nPAGE ERROR:", error.message);
    });

    page.on("console", (message) => {
      if (message.type() === "error") {
        console.log("\nCONSOLE ERROR:", message.text());
      }
    });

    console.log("Opening product page...");

    await page.goto(URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(15000);

    const result = await page.evaluate(() => {
      const root = document.querySelector("body");

      return {
        readyState: document.readyState,
        title: document.title,
        bodyText: root?.innerText || "",
        bodyHTMLLength: root?.innerHTML.length || 0,
        nextRootExists: !!document.querySelector("#__next"),
        nextRootLength:
          document.querySelector("#__next")?.innerHTML.length || 0,
        productNameVisible:
          document.body.innerText.includes("720 Magnetic Micro")
      };
    });

    console.log("\n========== PAGE RENDER RESULT ==========");
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error("Inspection failed:", error.message);
  } finally {
    if (browser) await browser.close();
  }
}

inspectPage();
