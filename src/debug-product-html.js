
import { chromium } from "playwright";
import fs from "fs";

const URL =
  "https://robu.in/product/720-magnetic-micro-coreless-motor-55-mm-propeller-for-micro-quadcopters/";

async function debugProductHTML() {
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

    await page.waitForTimeout(10000);

    const result = await page.evaluate(() => {
      return {
        title: document.title,

        h1: Array.from(
          document.querySelectorAll("h1")
        ).map((el) => ({
          text: el.innerText,
          html: el.outerHTML
        })),

        productText: document.body.innerText.slice(0, 10000),

        productImages: Array.from(
          document.querySelectorAll("img")
        )
          .filter((img) =>
            img.alt.toLowerCase().includes("thumbnail")
          )
          .map((img) => ({
            alt: img.alt,
            src: img.getAttribute("src"),
            dataSrc: img.getAttribute("data-src"),
            html: img.outerHTML
          })),

        skuElements: Array.from(
          document.querySelectorAll("*")
        )
          .filter((el) => {
            return (
              el.children.length === 0 &&
              el.innerText?.includes("22127")
            );
          })
          .slice(0, 10)
          .map((el) => ({
            tag: el.tagName,
            text: el.innerText,
            html: el.outerHTML
          }))
      };
    });

    console.log("\nDEBUG RESULT:");
    console.log(JSON.stringify(result, null, 2));

    fs.writeFileSync(
      "output/product-debug.json",
      JSON.stringify(result, null, 2)
    );

    console.log("\nSaved: output/product-debug.json");

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugProductHTML();
