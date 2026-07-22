/**
 * OrkaVault Google Chat App Proxy Script
 * 
 * Instructions:
 * 1. Go to https://script.google.com/
 * 2. Create a new project.
 * 3. Replace the default code in Code.gs with this entire script.
 * 4. Replace the BYPASS_SECRET constant below with a secure random string.
 * 5. Link this script to your GCP project:
 *    - Click Settings (gear icon on the left).
 *    - Under GCP Project, click Change Project, enter Project Number: 224803754761, and Set Project.
 * 6. Deploy:
 *    - Click Deploy (top right) > New deployment.
 *    - Select type: Add-on.
 *    - Enter a description and click Deploy.
 *    - Copy the Deployment ID.
 * 7. Configure GCP Google Chat API:
 *    - Go to Google Chat API > Configuration tab.
 *    - Under Connection settings, select Apps Script and paste the Deployment ID.
 *    - Click Save.
 * 8. Set the Render environment variable:
 *    - Key: GCHAT_BYPASS_SECRET
 *    - Value: (The same secure random string you put in BYPASS_SECRET below)
 */

const BACKEND_URL = "https://orkavault-a7w0.onrender.com/api/integrations/gchat/events";
const BYPASS_SECRET = "YOUR_CHOSEN_SECURE_SECRET_HERE"; // REPLACE THIS VALUE!

function onCardClick(event) {
  return proxyEvent(event);
}

function onMessage(event) {
  return proxyEvent(event);
}

function onAddToSpace(event) {
  return proxyEvent(event);
}

function onRemoveFromSpace(event) {
  return proxyEvent(event);
}

function proxyEvent(event) {
  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "X-OrkaVault-Secret": BYPASS_SECRET
    },
    payload: JSON.stringify(event),
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(BACKEND_URL, options);
  if (response.getResponseCode() !== 200) {
    return { text: "OrkaVault: Backend error (" + response.getResponseCode() + ")" };
  }
  return JSON.parse(response.getContentText());
}
