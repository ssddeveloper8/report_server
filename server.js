const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const pool = require("./db");

const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { Document, Packer, Paragraph, ImageRun, TextRun } = require("docx");
const moment = require("moment");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { selectReports } = require("./queryDetails");
const { waitForAllAPIs } = require("./commonFeatures");
const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

function splitPathName(path) {
  const pathAndserialNo = path.split("&&");
  return pathAndserialNo;
}

const checkUserFirst = async () => {
  try {
    const payload = {
      loginData:
        "Lyr8gf4MgkZnofu5jDutNZ7buH2H1tulmX4F8xOWC0B2h3GptRAbSdhYW+dWbp7wpi2zACIDN/kpaoWnxRsbpA==",
    };

    const response = await fetch(
      "http://localhost:8999/DashboardBuilder/auth/signin",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error(" Failed to call /all-reports:", error.message);
  }
};

// Fetch reports and trigger mail send
app.get("/all-reports", async (req, res) => {
  try {
    const result = await pool.query(selectReports());
    const grouped = {};

    result.rows.forEach((row) => {
      const {
        report_id,
        project_id,
        report_name,
        append_name,
        html_format,
        page_name,
        tab_name,
        sub_tab_name,
        page_path,
        base_url,
        current_project_build_name,
        email_status,
        email_attachemnet,
        email_body,
        email_subject,
        to_list,
        cc_list,
        bcc_list,
        group_names,
      } = row;

      if (!base_url || !current_project_build_name || !email_status) return;

      if (!grouped[report_id]) {
        grouped[report_id] = {
          reportId: report_id,
          reportName: report_name,
          appendName: append_name,
          baseUrl: base_url,
          htmlFormat: html_format,
          projectName: current_project_build_name,
          projectId: project_id,
          isEmail: email_status,
          attachments: email_attachemnet,
          subject: email_subject,
          bContent: email_body,
          toList: to_list,
          ccList: cc_list,
          bccList: bcc_list,
          groupNames: group_names,
          pages: [],
        };
      }

      grouped[report_id].pages.push({
        pageName: page_name,
        tabName: tab_name,
        subTabName: sub_tab_name,
        path: splitPathName(page_path)[1],
        serialNo: splitPathName(page_path)[0],
      });

      Object.values(grouped).forEach((report) => {
        report.pages.sort((a, b) => {
          const parse = (s) => s.split(".").map(Number);
          const [aParts, bParts] = [parse(a.serialNo), parse(b.serialNo)];

          for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aNum = aParts[i] || 0;
            const bNum = bParts[i] || 0;
            if (aNum !== bNum) return aNum - bNum;
          }
          return 0;
        });
      });
    });

    const finalResponse = Object.values(grouped);
    // res.json(finalResponse);
    await sendMail(finalResponse, res);
  } catch (error) {
    console.error("Database issue:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

// Send mail for each report
const sendMail = async (reports, res) => {
  const results = [];

  const TOKEN = await checkUserFirst();

  if (!TOKEN) {
    return res.status(401).json({
      error: "Authentication failed. Unable to retrieve token.",
    });
  }

  for (const report of reports) {
    const {
      reportId,
      reportName,
      appendName,
      baseUrl,
      htmlFormat,
      projectName,
      pages,
      subject,
      bContent,
      attachments,
      projectId,
      toList,
      ccList,
      bccList,
    } = report;

    const allPages = pages.map((page) => {
      const hasTab = page.tabName && page.tabName !== "-";
      const hasSubTab = page.subTabName && page.subTabName !== "-";

      const pathParts = page.path.split("/#");
      const basePath = pathParts[0];
      const tabId = pathParts[1] || null;
      const subId = pathParts[2] || null;

      return {
        url: `${baseUrl}/${projectName}/${basePath}`,
        pageName: hasTab ? `${page.pageName} - ${page.tabName}` : page.pageName,
        tabSelectors: hasTab && tabId ? [`#${tabId}`] : [],
        subTabSelectors: hasSubTab && subId ? [`#${subId}`] : [],
      };
    });

    const payload = {
      reportName,
      appendName,
      projectName,
      pages: allPages,
      token: TOKEN,
      type: htmlFormat,
      projectID: projectId,
      isAttachFile: attachments,
      email: { to: toList, cc: ccList, bcc: bccList },
      emailSubject: subject,
      emailBody: bContent,
    };

    try {
      const response = await fetch("http://localhost:5000/screenshot-to-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      results.push({ reportId, status: "success" });
    } catch (err) {
      console.error(
        "Screenshot generation failed for report:",
        reportName,
        err
      );
      return res.status(500).json({
        error: `Failed to generate screenshot or send email for report: ${reportName}`,
      });
    }
  }

  res.status(200).json({
    success: true,
    message: "All dashboard reports processed and emails sent successfully.",
    results,
  });
};

// Generate and send document (PDF/DOC)
app.post("/screenshot-to-docx", async (req, res) => {
  const {
    reportName,
    appendName,
    projectName,
    pages,
    token,
    projectID,
    email,
    isAttachFile,
    emailSubject,
    emailBody,
    type = "doc",
  } = req.body;

  if (
    !reportName ||
    !projectName ||
    !token ||
    !projectID ||
    !email?.to?.length ||
    !Array.isArray(pages) ||
    pages.length === 0
  ) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const generatedDate = moment().format("DD-MM-YYYY");
  const filename = `${reportName}.${type === "pdf" ? "pdf" : "docx"}`;
  const filePath = path.join(__dirname, filename);

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const screenshots = [];

    for (const { url, pageName, tabSelectors, subTabSelectors } of pages) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 930 });

      await page.evaluateOnNewDocument(
        (t) => sessionStorage.setItem("token", t),
        token
      );
      await page.evaluateOnNewDocument(
        (id) => sessionStorage.setItem("projectID", id),
        projectID
      );

      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

        if (
          (tabSelectors?.length || 0) > 0 &&
          (subTabSelectors?.length || 0) > 0
        ) {
          for (const tabSelector of tabSelectors) {
            await page.evaluate((id) => {
              const el = document.getElementById(id);
              if (el) el.click();
            }, tabSelector.replace(/^#/, ""));
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }

          for (const subTabSelector of subTabSelectors) {
            await page.evaluate((id) => {
              const el = document.getElementById(id);
              if (el) el.click();
            }, subTabSelector.replace(/^#/, ""));
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        } else if ((tabSelectors?.length || 0) > 0) {
          for (const tabSelector of tabSelectors) {
            await page.evaluate((id) => {
              const el = document.getElementById(id);
              if (el) el.click();
            }, tabSelector.replace(/^#/, ""));
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        }
        await waitForAllAPIs(page, 2000, 60000);
        
        // Take screenshot
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        screenshots.push({
          buffer: screenshotBuffer,
          title: pageName || "Screenshot",
        });
      } catch (err) {
        console.error(`Failed to capture screenshot for ${url}`, err);
      } finally {
        await page.close();
      }
    }

    if (screenshots.length === 0) {
      return res
        .status(500)
        .json({ error: "No screenshots were successfully captured." });
    }

    if (type === "doc") {
      const docChildren = [
        new Paragraph({
          children: [
            new TextRun({
              text: `Project Name: ${projectName}`,
              bold: true,
              size: 24,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Date: ${generatedDate}`,
              size: 22,
              color: "444444",
            }),
          ],
        }),
        new Paragraph({
          children: [],
          border: {
            bottom: { color: "auto", space: 1, value: "single", size: 6 },
          },
        }),
      ];

      screenshots.forEach(({ buffer, title }, index) => {
        const children = [];

        if (index > 0) {
          // Add a page break before each screenshot (except the first one)
          children.push(new Paragraph({ children: [], pageBreakBefore: true }));
        }

        children.push(
          new Paragraph({
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({
                text: title,
                size: 20,
                bold: true,
                color: "000000",
              }),
            ],
          }),
          new Paragraph({
            children: [
              new ImageRun({
                type: "png",
                data: buffer,
                filename: "screenshot.png",
                transformation: { width: 600, height: 300 },
              }),
            ],
            alignment: "center",
          }),
          new Paragraph({
            children: [],
            border: {
              bottom: { color: "auto", space: 1, value: "single", size: 6 },
            },
          }),
          new Paragraph("")
        );

        docChildren.push(...children);
      });

      const doc = new Document({ sections: [{ children: docChildren }] });
      const docBuffer = await Packer.toBuffer(doc);
      fs.writeFileSync(filePath, docBuffer);
    } else {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      for (const { buffer, title } of screenshots) {
        const page = pdfDoc.addPage([595.28, 841.89]); // A4
        const image = await pdfDoc.embedPng(buffer);
        const scaled = image.scale(0.26);
        const yStart = 800;

        page.drawText(`Project Name: ${projectName}`, {
          x: 50,
          y: yStart,
          size: 12,
          font,
        });

        page.drawText(`Date: ${generatedDate}`, {
          x: 50,
          y: yStart - 20,
          size: 12,
          font,
          color: rgb(0.4, 0.4, 0.4),
        });

        page.drawLine({
          start: { x: 50, y: yStart - 35 },
          end: { x: 545, y: yStart - 35 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });

        page.drawText(title, {
          x: 50,
          y: yStart - 60,
          size: 15,
          font,
        });

        page.drawImage(image, {
          x: 50,
          y: yStart - scaled.height - 100,
          width: scaled.width,
          height: scaled.height,
        });

        page.drawLine({
          start: { x: 50, y: 50 },
          end: { x: 545, y: 50 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
      }

      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(filePath, pdfBytes);
    }

    // Send Email
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "ssddeveloper8@gmail.com",
        pass: "rvlmpxdzdrzycpoB",
      },
    });

    const mailOptions = {
      from: "Sandip",
      to: email.to,
      cc: email.cc || [],
      bcc: email.bcc || [],
      subject: emailSubject || "Report",
      text: emailBody || "",
    };

    if (isAttachFile) {
      mailOptions.attachments = [
        {
          filename,
          path: filePath,
        },
      ];
    }

    await transporter.sendMail(mailOptions);

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: `Screenshot ${type.toUpperCase()} sent successfully.`,
    });
  } catch (error) {
    console.error("Error during screenshot-to-docx:", error);
    res.status(500).json({
      error: "Failed to generate or send the document.",
      details: error.message,
    });
  } finally {
    if (browser) await browser.close();
  }
});

// setInterval(async () => {
//   try {
//     console.log(" Triggering /all-reports at", new Date().toLocaleString());
//     const response = await fetch("http://localhost:5000/all-reports");
//     const data = await response.json();
//     console.log(" /all-reports result:", data);
//   } catch (error) {
//     console.error(" Failed to call /all-reports:", error.message);
//   }
// }, 5 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
