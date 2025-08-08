const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "DashboardBuilderForProd",
  password: "root",
  port: 5432,
});

pool.on("connect", () => {
  console.log("Connected");
});

module.exports = pool;


// app.post("/screenshot", async (req, res) => {
//   const { pages, token, projectID, email, emailSubject, emailBody } = req.body;

//   if (!Array.isArray(pages) || pages.length === 0 || !token || !email) {
//     return res.status(400).json({ error: "Missing required data." });
//   }

//   const browser = await puppeteer.launch({
//     headless: "new",
//     args: ["--no-sandbox", "--disable-setuid-sandbox"],
//   });

//   const page = await browser.newPage();
//   await page.setViewport({ width: 1920, height: 930 });

//   await page.goto("about:blank");

//   await page.evaluateOnNewDocument(
//     (t) => sessionStorage.setItem("token", t),
//     token
//   );
//   await page.evaluateOnNewDocument(
//     (id) => sessionStorage.setItem("projectID", id),
//     projectID
//   );

//   const attachments = [];

//   for (let i = 0; i < pages.length; i++) {
//     const { url, pageName, tabSelectors = [] } = pages[i];

//     try {
//       await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
//       await new Promise((r) => setTimeout(r, 3000));

//       if (tabSelectors.length === 0) {
//         const buffer = await page.screenshot({ fullPage: true });
//         attachments.push({ filename: `${pageName}.png`, content: buffer });
//       } else {
//         for (let j = 0; j < tabSelectors.length; j++) {
//           const selector = tabSelectors[j];
//           await page.evaluate((id) => {
//             const el = document.getElementById(id);
//             if (el) el.click();
//           }, selector.replace(/^#/, ""));
//           await new Promise((r) => setTimeout(r, 3000));
//           const buffer = await page.screenshot({ fullPage: true });
//           attachments.push({ filename: `${pageName}.png`, content: buffer });
//         }
//       }
//     } catch (err) {
//       console.error(`Failed on ${url}:`, err.message);
//     }
//   }

//   await browser.close();

//   if (attachments.length === 0)
//     return res.status(500).json({ error: "No screenshots captured." });

//   try {
//     const transporter = nodemailer.createTransport({
//       host: "smtp.gmail.com",
//       port: 587,
//       secure: false,
//       auth: {
//         user: "ssddeveloper8@gmail.com",
//         pass: "rvlmpxdzdrzycpoB",
//       },
//     });

//     await transporter.sendMail({
//       from: '"Dashboard Screenshots" <ssddeveloper8@gmail.com>',
//       to: email,
//       subject: emailSubject || "All Dashboard Screenshots",
//       text: emailBody || "Here are all the screenshots.",
//       attachments,
//     });

//     res.json({ success: true, message: "Screenshots sent successfully." });
//   } catch (mailErr) {
//     console.error("Mail error:", mailErr.message);
//     res.status(500).json({ error: "Failed to send email." });
//   }
// });