require("dotenv").config();
const fs = require("fs");
const { google } = require("googleapis");
const readline = require("readline");
const path = require("path");

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];
const url = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // force new refresh_token
  scope: SCOPES,
});

console.log("Authorize this app by visiting this URL:\n", url);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Paste the code from the browser here: ", async (code) => {
  try {
    const { tokens } = await oAuth2Client.getToken(code.trim());
    console.log("Tokens received:", tokens);

    // Save full tokens to token.json
    fs.writeFileSync("token.json", JSON.stringify(tokens, null, 2));
    console.log("Tokens stored in token.json");

    // If refresh token exists, update .env file
    if (tokens.refresh_token) {
      const envPath = path.resolve(".env");
      let envContent = fs.readFileSync(envPath, "utf-8");

      if (envContent.includes("GMAIL_REFRESH_TOKEN=")) {
        // Replace existing
        envContent = envContent.replace(
          /GMAIL_REFRESH_TOKEN=.*/,
          `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`
        );
      } else {
        // Append new
        envContent += `\nGMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`;
      }

      fs.writeFileSync(envPath, envContent);
      console.log(" .env updated with new GMAIL_REFRESH_TOKEN");
    } else {
      console.warn(
        "No refresh_token returned — try running with prompt: 'consent'"
      );
    }
  } catch (err) {
    console.error("Error retrieving access token", err.response?.data || err);
  }
  rl.close();
});