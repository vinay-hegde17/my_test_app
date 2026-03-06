const express = require("express");
require("dotenv").config();
const cron = require("node-cron");
const { google } = require("googleapis");
const fs = require("fs").promises;
const path = require("path");
const fsSync = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

if (process.env.TOKEN_JSON && !fsSync.existsSync(TOKEN_PATH)) {
  fsSync.writeFileSync(TOKEN_PATH, process.env.TOKEN_JSON);
}

if (process.env.CREDENTIALS_JSON && !fsSync.existsSync(CREDENTIALS_PATH)) {
  fsSync.writeFileSync(CREDENTIALS_PATH, process.env.CREDENTIALS_JSON);
}

async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;

  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });

  await fs.writeFile(TOKEN_PATH, payload);
}

async function authorize() {
  let client = await loadSavedCredentialsIfExist();

  if (client) return client;

  const { authenticate } = require("@google-cloud/local-auth");

  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });

  if (client.credentials) {
    await saveCredentials(client);
  }

  return client;
}

function createEmail(to, subject, message) {
  const emailLines = [
    `To: ${to}`,
    `From: no-reply@test.com`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    "",
    `<html>
      <body>
        <h3>${message}</h3>
        <p>This email is sent every minute using Gmail API.</p>
      </body>
    </html>`
  ];

  const email = emailLines.join("\n");

  const encodedMessage = Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return encodedMessage;
}

async function sendEmail() {
  try {
    const auth = await authorize();

    const gmail = google.gmail({
      version: "v1",
      auth
    });

    const recipients = [
      "vinay.hegde@phyelements.com",
      "nagarjun.prabhuswamy@phyelements.com"
    ];

    const to = recipients.join(", ");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: createEmail(
          to,
          "POC Email",
          "Hello! This is a test email."
        )
      }
    });

    console.log("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

cron.schedule("* * * * *", async () => {
  console.log("Running cron job...");
  await sendEmail();
});

app.get("/", (req, res) => {
  res.send("Email cron POC running...");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});