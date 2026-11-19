
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

import {
  connectDB,
  getDB,
  closeDB
} from "../config/db.js";

dotenv.config();

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function main() {
  let connected = false;

  try {
    await connectDB();
    connected = true;

    const db = getDB();

    const products = await db
      .collection("products")
      .find({})
      .toArray();

    const categories = await db
      .collection("categories")
      .find({})
      .toArray();

    console.log("Products found:", products.length);
    console.log("Categories found:", categories.length);

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Robu Catalogue Migration";
    workbook.created = new Date();

    // --------------------------------
    // SHEET 1: PRODUCTS
    // --------------------------------

    const productSheet =
      workbook.addWorksheet("Products");

    productSheet.columns = [
      { header: "Product ID", key: "productId", width: 15 },
      { header: "SKU", key: "sku", width: 18 },
      { header: "Product Name", key: "name", width: 55 },
      { header: "Price", key: "price", width: 15 },
      { header: "Sale Price", key: "salePrice", width: 15 },
      { header: "In Stock", key: "inStock", width: 15 },
      { header: "Brand", key: "brand", width: 20 },
      { header: "MPN", key: "mpn", width: 20 },
      { header: "Main Category", key: "mainCategory", width: 35 },
      { header: "Subcategory", key: "subcategory", width: 40 },
      { header: "All Category Paths", key: "categoryPaths", width: 75 },
      { header: "Description (HTML)", key: "description", width: 60 },
      { header: "Specification (Raw Text)", key: "specification", width: 60 },
      { header: "Product URL", key: "productUrl", width: 65 },
      { header: "Image URLs", key: "images", width: 70 }
    ];

    productSheet.getRow(1).font = { bold: true };

    // --------------------------------
    // SHEET 2: PRODUCT CATEGORY MAPPING
    // --------------------------------

    const mappingSheet =
      workbook.addWorksheet("Product Category Mapping");

    mappingSheet.columns = [
      { header: "SKU", key: "sku", width: 18 },
      { header: "Product Name", key: "name", width: 55 },
      { header: "Category ID", key: "categoryId", width: 18 },
      { header: "Category Name", key: "categoryName", width: 40 },
      { header: "Category Path", key: "categoryPath", width: 75 },
      { header: "Product URL", key: "productUrl", width: 65 }
    ];

    mappingSheet.getRow(1).font = { bold: true };

    // --------------------------------
    // SHEET 3: CATEGORIES
    // --------------------------------

    const categorySheet =
      workbook.addWorksheet("Categories");

    categorySheet.columns = [
      { header: "Category ID", key: "categoryId", width: 18 },
      { header: "Category Name", key: "name", width: 45 },
      { header: "Parent Category", key: "parentName", width: 40 },
      { header: "Category Path", key: "categoryPath", width: 75 },
      { header: "Depth", key: "depth", width: 12 },
      { header: "Assigned Products", key: "productCount", width: 20 },
      { header: "Category URL", key: "url", width: 65 }
    ];

    categorySheet.getRow(1).font = { bold: true };

    // --------------------------------
    // SHEET 4: UNASSIGNED PRODUCTS
    // --------------------------------

    const unassignedSheet =
      workbook.addWorksheet("Unassigned Products");

    unassignedSheet.columns = [
      { header: "SKU", key: "sku", width: 18 },
      { header: "Product Name", key: "name", width: 55 },
      { header: "Product URL", key: "productUrl", width: 65 }
    ];

    unassignedSheet.getRow(1).font = { bold: true };

    // --------------------------------
    // SHEET 5: SPECIFICATIONS
    // --------------------------------

    const specificationSheet =
      workbook.addWorksheet("Specifications");

    specificationSheet.columns = [
      { header: "SKU", key: "sku", width: 18 },
      { header: "Product Name", key: "name", width: 55 },
      { header: "Specification", key: "specification", width: 35 },
      { header: "Value", key: "value", width: 45 }
    ];

    specificationSheet.getRow(1).font = { bold: true };

    // Count distinct products assigned to each category
    const categoryProductSets = new Map();

    for (const product of products) {
      const assignments =
        product.categoryAssignments || [];

      for (const assignment of assignments) {
        const id = String(assignment.categoryId);

        if (!categoryProductSets.has(id)) {
          categoryProductSets.set(id, new Set());
        }

        categoryProductSets
          .get(id)
          .add(product.sourceUrl || product.productUrl || product.sku);
      }
    }

    // --------------------------------
    // EXPORT PRODUCTS AND MAPPINGS
    // --------------------------------

    let productsWithDescription = 0;
    let productsWithSpecification = 0;
    let productsWithImages = 0;

    for (const product of products) {
      const assignments =
        product.categoryAssignments || [];

      const paths = assignments.map(item =>
        (item.categoryPath || [item.categoryName])
          .join(" > ")
      );

      const deepestPath = assignments
        .map(item => item.categoryPath || [item.categoryName])
        .sort((a, b) => b.length - a.length)[0] || [];

      const mainCategory =
        deepestPath.length > 1 ? deepestPath[1] : "";

      const subcategory =
        deepestPath.length > 2
          ? deepestPath.slice(2).join(" > ")
          : deepestPath.length === 2
            ? deepestPath[1]
            : "";

      const description = product.description || "";

      // New GraphQL field is specification (singular).
      const rawSpecification =
        typeof product.specification === "string"
          ? product.specification
          : "";

      const images = product.images || [];

      if (description.trim()) {
        productsWithDescription++;
      }

      if (rawSpecification.trim() ||
          (product.specifications &&
           Object.keys(product.specifications).length > 0)) {
        productsWithSpecification++;
      }

      if (images.length > 0) {
        productsWithImages++;
      }

      productSheet.addRow({
        productId: product.productId || product.id || "",
        sku: product.sku || "",
        name: product.name || "",
        price: product.price ?? "",
        salePrice: product.sale_price ?? "",
        inStock: product.in_stock ?? "",
        brand: product.brand || "",
        mpn: product.mpn || "",
        mainCategory,
        subcategory,
        categoryPaths: unique(paths).join("\n"),
        description,
        specification: rawSpecification,
        productUrl: product.productUrl || product.sourceUrl || "",
        images: images.join("\n")
      });

      if (assignments.length === 0) {
        unassignedSheet.addRow({
          sku: product.sku || "",
          name: product.name || "",
          productUrl: product.productUrl || product.sourceUrl || ""
        });
      }

      for (const assignment of assignments) {
        mappingSheet.addRow({
          sku: product.sku || "",
          name: product.name || "",
          categoryId: assignment.categoryId || "",
          categoryName: assignment.categoryName || "",
          categoryPath: (
            assignment.categoryPath || []
          ).join(" > "),
          productUrl: product.productUrl || product.sourceUrl || ""
        });
      }

      // Export old structured specifications.
      const specifications = product.specifications || {};

      if (Array.isArray(specifications)) {
        for (const spec of specifications) {
          specificationSheet.addRow({
            sku: product.sku || "",
            name: product.name || "",
            specification: spec.name || spec.key || "",
            value: spec.value ?? ""
          });
        }
      } else if (
        typeof specifications === "object" &&
        specifications !== null
      ) {
        for (const [key, value] of Object.entries(specifications)) {
          specificationSheet.addRow({
            sku: product.sku || "",
            name: product.name || "",
            specification: key,
            value: typeof value === "object"
              ? JSON.stringify(value)
              : value ?? ""
          });
        }
      }

      // Also export new raw specification text.
      if (rawSpecification.trim()) {
        specificationSheet.addRow({
          sku: product.sku || "",
          name: product.name || "",
          specification: "Raw Technical Specification",
          value: rawSpecification.trim()
        });
      }
    }

    // --------------------------------
    // EXPORT ALL CATEGORIES
    // --------------------------------

    for (const category of categories) {
      const count =
        categoryProductSets.get(String(category.categoryId))
          ?.size || 0;

      categorySheet.addRow({
        categoryId: category.categoryId || "",
        name: category.name || "",
        parentName: category.parentName || "",
        categoryPath: (category.categoryPath || []).join(" > "),
        depth: category.depth ?? "",
        productCount: count,
        url: category.url || ""
      });
    }

    // --------------------------------
    // FORMAT ALL SHEETS
    // --------------------------------

    for (const sheet of workbook.worksheets) {
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      if (sheet.rowCount > 1) {
        sheet.autoFilter = {
          from: "A1",
          to: {
            row: 1,
            column: sheet.columnCount
          }
        };
      }

      sheet.getRow(1).font = {
        bold: true
      };

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.alignment = {
            vertical: "top",
            wrapText: true
          };
        }
      });
    }

    // --------------------------------
    // SAVE EXCEL FILE
    // --------------------------------

    const outputDir = path.join("output", "excel");

    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(
      outputDir,
    "robu-category-product-mapping-updated.xlsx"
    );

    await workbook.xlsx.writeFile(outputPath);

    console.log("\n========== EXCEL EXPORT COMPLETED ==========");
    console.log("Unique products:", products.length);
    console.log("Categories:", categories.length);
    console.log("Category mappings:", mappingSheet.rowCount - 1);
    console.log("Unassigned products:", unassignedSheet.rowCount - 1);
    console.log("Specification rows:", specificationSheet.rowCount - 1);
    console.log("Products with description:", productsWithDescription);
    console.log("Products with specification:", productsWithSpecification);
    console.log("Products with images:", productsWithImages);
    console.log("Excel file:", outputPath);

    // Check the Sunny Sky example
    const sunnySky = products.find(
      product => product.sku === "R153568"
    );

    console.log("\nSunny Sky SKU R153568:");

    if (sunnySky) {
      console.log("Product:", sunnySky.name);
      console.log(
        "Categories:",
        (sunnySky.categoryAssignments || [])
          .map(item => item.categoryName)
      );
    } else {
      console.log("SKU R153568 was not found in MongoDB.");
    }

  } catch (error) {
    console.error("Excel export failed:", error.message);
  } finally {
    if (connected) {
      await closeDB();
    }
  }
}

main();
