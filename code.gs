// ✅ Load user-defined contexts from Google Drive
var USER_CUSTOM_CONTEXTS = loadCustomContextsFromDrive();

// ✅ Function to load user-defined contexts from Google Drive
function loadCustomContextsFromDrive() {
  var folderName = "EmailGenie_Contexts";
  var fileName = "user_custom_contexts.json";

  var folders = DriveApp.getFoldersByName(folderName);
  if (!folders.hasNext()) return {}; // Return empty if no folder found

  var folder = folders.next();
  var files = folder.getFilesByName(fileName);
  
  if (!files.hasNext()) return {}; // Return empty if no file found

  var file = files.next();
  var content = file.getBlob().getDataAsString();
  return JSON.parse(content);
}

// ✅ Function to save user-defined contexts to Google Drive
function saveCustomContextsToDrive(userContexts) {
  var folderName = "EmailGenie_Contexts";
  var fileName = "user_custom_contexts.json";
  
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  
  var files = folder.getFilesByName(fileName);
  
  if (files.hasNext()) {
    var file = files.next();
    file.setContent(JSON.stringify(userContexts, null, 2)); // Update existing file
  } else {
    folder.createFile(fileName, JSON.stringify(userContexts, null, 2), MimeType.PLAIN_TEXT);
  }
}

// ✅ Ensure changes are saved after loading
saveCustomContextsToDrive(USER_CUSTOM_CONTEXTS);

// Enhance a short message into a full email and open in Gmail compose box
function enhanceShortMessage(e) {
  if (!e || !e.formInput || !e.formInput.shortMessage) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Please enter a short message to enhance."))
      .build();
  }

  var shortMessage = e.formInput.shortMessage;
  var recipientEmail = e.formInput.recipientEmail || "";
  var recipientName = e.formInput.recipientName || "Recipient";

  if (!recipientEmail) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Please enter the recipient's email address."))
      .build();
  }

  var prompt = `Enhance this short message into a friendly and professional email. 
  Address the email to '${recipientName}'.
  Format the response as follows:
  - Subject: [Generated Subject]
  - Body: [Generated Email Content starting with "Dear ${recipientName},"]

  Short message: ${shortMessage}`;

  var aiResponse = callOpenAI(prompt);

  var subjectMatch = aiResponse.match(/Subject:\s*(.*)/i);
  var bodyMatch = aiResponse.match(/Body:\s*([\s\S]*)/i);

  var emailSubject = subjectMatch ? subjectMatch[1].trim() : "Enhanced Message";
  var emailBody = bodyMatch ? bodyMatch[1].trim() : aiResponse;

  var draft = GmailApp.createDraft(recipientEmail, emailSubject, emailBody);

  var composeAction = CardService.newComposeActionResponseBuilder()
    .setGmailDraft(draft)
    .build();

  return composeAction;
}

function buildScenarioPrompt({ scenarioType, tone, userName, senderName, emailContent, additionalInfo }) {
  let context = `User: ${userName}\nSender: ${senderName}\nEmail: ${emailContent}\nExtra Info: ${additionalInfo}`;

  switch (scenarioType) {
    case "positive":
      return `Write a ${tone} and professional email accepting the sender's request.\n${context}`;
    case "negative":
      return `Write a ${tone} and polite email declining the sender's request.\n${context}`;
    case "alternative":
      return `Write a ${tone} email suggesting an alternative instead of direct rejection or acceptance.\n${context}`;
    default:
      return `Write a ${tone} and professional email.\n${context}`;
  }
}

// Generate a reply for a selected scenario and open in Gmail compose box
function generateReplyForScenario(e) { 
  var userEmail = Session.getActiveUser().getEmail();
  var userName = userEmail.split("@")[0].replace(/\./g, " ");
  userName = userName.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

  var selectedScenario = e.formInput.scenario;
  var additionalInfo = e.formInput.additionalInfo || "";
  var tone = e.formInput.tone || "formal";
  var emailContent = getSelectedEmailContent(e);
  var senderName = getSenderName(e);
  var subject = getEmailSubject(e);

  if (!emailContent) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ No email content found. Cannot generate a reply."))
      .build();
  }
  var prompt = buildScenarioPrompt({
    scenarioType: selectedScenario,
    tone: tone,
    userName: userName,
    senderName: senderName,
    emailContent: emailContent,
    additionalInfo: additionalInfo
  });
  var aiResponse = callOpenAI(prompt);
  var formattedSubject = subject.startsWith("Re:") ? subject : "Re: " + subject;
  aiResponse = aiResponse.replace(/^Subject:.*\n?/i, "").trim();

  var messageId = e.gmail.messageId;
  var message = GmailApp.getMessageById(messageId);
  var senderEmail = message ? message.getFrom() : "";
  var emailMatch = senderEmail.match(/<(.+)>/);
  var toRecipient = emailMatch ? emailMatch[1] : senderEmail;

  var draft = GmailApp.createDraft(toRecipient, formattedSubject, aiResponse);

  var composeAction = CardService.newComposeActionResponseBuilder()
    .setGmailDraft(draft)
    .build();
  return composeAction;
}

// Function to get email subject
function getEmailSubject(e) {
  if (!e || !e.gmail || !e.gmail.messageId) {
    return "No Subject";
  }

  var messageId = e.gmail.messageId;
  var message = GmailApp.getMessageById(messageId);
  if (!message) {
    return "No Subject";
  }

  return message.getThread().getFirstMessageSubject();
}

function onGmailMessageOpen(e) {
  Logger.log("📌 onGmailMessageOpen called with event: " + JSON.stringify(e));
  
  try {
    // If no email is selected, show the homepage UI (sidebar.html)
    if (!e || !e.gmail || !e.gmail.messageId) {
  return [CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle("📧 EmailGenie")
      .setSubtitle("No email selected"))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText("Please open an email to begin composing a reply.")))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextButton()
        .setText("🏠 Go to Home")
        .setOnClickAction(CardService.newAction().setFunctionName("showSidebar"))))
    .build()];
}

    // If an email is selected, show the contextual UI
    var emailContent = getSelectedEmailContent(e);
    var senderName = getSenderName(e);

    var card = CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader()
        .setTitle("📧 EmailGenie")
        .setSubtitle("Your AI-powered email assistant ✨"))
      .addSection(
        CardService.newCardSection()
          .setHeader("📩 Email Details")
          .addWidget(CardService.newTextParagraph().setText(`👤 <b>Sender:</b> ${senderName}`))
          .addWidget(CardService.newTextInput()
            .setFieldName("emailContent")
            .setTitle("📜 Full Email Content (Scroll to View)")
            .setMultiline(true)
            .setValue(emailContent))
      )
      .addSection(
        CardService.newCardSection()
          .setHeader("💡 AI-Generated Reply")
          .addWidget(CardService.newTextParagraph().setText("Select a reply type and add optional details below."))
          .addWidget(CardService.newTextInput()
            .setFieldName("additionalInfo")
            .setTitle("📝 Add Custom Information")
            .setHint("E.g., Mention a specific date, reason, or extra details for AI to consider."))
          .addWidget(CardService.newSelectionInput()
            .setType(CardService.SelectionInputType.DROPDOWN)
            .setTitle("Select Tone")
            .setFieldName("tone")
            .addItem("Formal", "formal", true)
            .addItem("Friendly", "friendly", false)
            .addItem("Neutral", "neutral", false))
          .addWidget(CardService.newSelectionInput()
            .setType(CardService.SelectionInputType.DROPDOWN)
            .setTitle("Select Reply Type")
            .setFieldName("scenario")
            .addItem("Positive Response", "positive", false)
            .addItem("Negative Response", "negative", false)
            .addItem("Suggest Alternative", "alternative", false)
            .addItem("📌 Use Custom Scenario", "custom_scenario", false)
            .setOnChangeAction(CardService.newAction().setFunctionName("updatePreview")))
          .addWidget(CardService.newTextButton()
            .setText("📨 Generate Reply")
            .setOnClickAction(CardService.newAction().setFunctionName("generateReplyForScenario")))
      )
      .addSection(
        CardService.newCardSection()
          .addWidget(CardService.newTextButton()
            .setText("⚙️ Manage Custom Scenarios")
            .setOnClickAction(CardService.newAction().setFunctionName("showScenarioSelectionUI")))
      );

    return [card.build()];
  } catch (error) {
    Logger.log("⚠ Error in onGmailMessageOpen: " + error.toString());
    // Fallback card in case of an error
    var errorCard = CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader()
        .setTitle("📧 EmailGenie")
        .setSubtitle("Your AI-powered email assistant ✨"))
      .addSection(
        CardService.newCardSection()
          .setHeader("⚠ Error")
          .addWidget(CardService.newTextParagraph()
            .setText("An error occurred: " + error.message))
          .addWidget(CardService.newTextButton()
            .setText("🏠 Go to Homepage")
            .setOnClickAction(CardService.newAction().setFunctionName("showSidebar")))
      );
    return [errorCard.build()];
  }
}

function getUserNameFromGoogle() {
  try {
    var url = "https://www.googleapis.com/oauth2/v2/userinfo";
    var options = {
      "method": "get",
      "headers": {
        "Authorization": "Bearer " + ScriptApp.getOAuthToken()
      },
      "muteHttpExceptions": true
    };

    var response = UrlFetchApp.fetch(url, options);
    var data = JSON.parse(response.getContentText());

    if (data.name) {
      return data.name;
    } else if (data.given_name && data.family_name) {
      return data.given_name + " " + data.family_name;
    }

    return "User";
  } catch (error) {
    Logger.log("⚠ Error fetching user name: " + error.toString());
    return "User";
  }
}

function updatePreview(e) {
  var selectedScenario = e.formInput.scenario;
  var additionalInfo = e.formInput.additionalInfo || "";
  var emailContent = getSelectedEmailContent(e);
  var senderName = getSenderName(e);
  var userName = getUserNameFromGoogle();

  if (!emailContent) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ No email content found."))
      .build();
  }

  if (selectedScenario === "discard") {
    var discardCard = CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader()
        .setTitle("📧 EmailGenie")
        .setSubtitle("Your AI-powered email assistant ✨"))
      .addSection(CardService.newCardSection()
        .setHeader("🚫 Reply Discarded")
        .addWidget(CardService.newTextParagraph().setText("Select a new response type to continue.")))
      .addSection(CardService.newCardSection()
        .addWidget(CardService.newTextInput()
          .setFieldName("additionalInfo")
          .setTitle("📝 Add Custom Information")
          .setHint("E.g., Mention a specific date, reason, or extra details for AI to consider.")
          .setValue(additionalInfo)))
      .addSection(CardService.newCardSection()
        .addWidget(CardService.newSelectionInput()
          .setType(CardService.SelectionInputType.DROPDOWN)
          .setTitle("Select Reply Type")
          .setFieldName("scenario")
          .addItem("Positive Response", "positive", false)
          .addItem("Negative Response", "negative", false)
          .addItem("Suggest Alternative", "alternative", false)
          .addItem("❌ Discard Reply", "discard", true)
          .setOnChangeAction(CardService.newAction().setFunctionName("updatePreview"))));

    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(discardCard.build()))
      .setNotification(CardService.newNotification().setText("❌ Reply discarded."))
      .build();
  }

  var prompt = "";

  if (selectedScenario === "positive") {
    prompt = `Generate a professional and friendly email accepting the sender's request.
    Ensure the reply is warm, professional, and confirms the request.
    
    User's full name: '${userName}'. 
    Sender: '${senderName}'. 
    Email content: ${emailContent}
    Additional Details Provided by User: "${additionalInfo}".
    
    Ensure the extra details are naturally included in the reply.`;
  } else if (selectedScenario === "negative") {
    prompt = `Generate a polite and professional email declining the sender's request.
    Provide a reason if necessary, and keep the tone polite.

    User's full name: '${userName}'. 
    Sender: '${senderName}'. 
    Email content: ${emailContent}
    Additional Details Provided by User: "${additionalInfo}".

    Ensure the extra details are naturally included in the reply.`;
  } else if (selectedScenario === "alternative") {
    prompt = `Generate a professional email suggesting an alternative option instead of a direct acceptance or rejection.
    Keep the tone polite and flexible.

    User's full name: '${userName}'. 
    Sender: '${senderName}'. 
    Email content: ${emailContent}
    Additional Details Provided by User: "${additionalInfo}".

    Ensure the extra details are naturally included in the reply.`;
  }

  var aiResponse = callOpenAI(prompt);

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle("📧 EmailGenie")
      .setSubtitle("Your AI-powered email assistant ✨"))
    .addSection(CardService.newCardSection()
      .setHeader("📩 Email Details")
      .addWidget(CardService.newTextParagraph().setText(`👤 <b>Sender:</b> ${senderName}`))
      .addWidget(CardService.newTextParagraph().setText(`📜 <b>Email Content:</b>\n${emailContent}`)))
    .addSection(CardService.newCardSection()
      .setHeader("🔷 AI-Generated Preview")
      .addWidget(CardService.newTextParagraph().setText(aiResponse)))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextInput()
        .setFieldName("additionalInfo")
        .setTitle("📝 Add Custom Information")
        .setHint("E.g., Mention a specific date, reason, or extra details for AI to consider.")
        .setValue(additionalInfo)))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.DROPDOWN)
        .setTitle("Select Reply Type")
        .setFieldName("scenario")
        .addItem("Positive Response", "positive", selectedScenario === "positive")
        .addItem("Negative Response", "negative", selectedScenario === "negative")
        .addItem("Suggest Alternative", "alternative", selectedScenario === "alternative")
        .addItem("❌ Discard Reply", "discard", false)
        .setOnChangeAction(CardService.newAction().setFunctionName("updatePreview")))
      .addWidget(CardService.newTextButton()
        .setText("📨 Generate Reply")
        .setOnClickAction(CardService.newAction().setFunctionName("generateReplyForScenario"))));

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card.build()))
    .build();
}

function callOpenAI(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) {
    Logger.log("❌ Missing OpenAI API Key. Set it via Script Properties.");
    return "Error: Missing OpenAI API Key.";
  }

  const userName = getUserNameFromGoogle();
  const userEmail = Session.getActiveUser().getEmail();
  const userPosition = PropertiesService.getUserProperties().getProperty("USER_POSITION") || "Not specified";
  const additionalContactInfo = PropertiesService.getUserProperties().getProperty("USER_CONTACT_INFO") || "Not specified";

  const url = "https://api.openai.com/v1/chat/completions";
  const payload = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are an AI email assistant. Refer to the user as '${userName}'.
Include their position: '${userPosition}', and contact: 'Email: ${userEmail}'.
${additionalContactInfo !== "Not specified" ? `Also include: ${additionalContactInfo}` : ""}`
      },
      { role: "user", content: prompt }
    ],
    max_tokens: 250,
    temperature: 0.7
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(payload)
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());
    return data.choices[0]?.message?.content?.trim() || "⚠️ No response received.";
  } catch (error) {
    Logger.log("⚠ OpenAI Error: " + error);
    return "OpenAI Error: " + error.message;
  }
}

function showSidebar() {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle("📧 EmailGenie")
      .setSubtitle("Your AI-powered email assistant ✨"))

    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText("Welcome to EmailGenie! ✨ Select an email to get started, or use options below.")))

    // ✨ Enhance Short Message
    .addSection(CardService.newCardSection()
      .setHeader("⚡ Enhance a Short Message")
      .addWidget(CardService.newTextInput()
        .setFieldName("recipientEmail")
        .setTitle("Recipient Email"))
      .addWidget(CardService.newTextInput()
        .setFieldName("recipientName")
        .setTitle("Recipient Name (Optional)"))
      .addWidget(CardService.newTextInput()
        .setFieldName("shortMessage")
        .setTitle("Short Message")
        .setMultiline(true))
      .addWidget(CardService.newTextButton()
        .setText("⚡ Enhance Message")
        .setOnClickAction(CardService.newAction().setFunctionName("enhanceShortMessage"))))

    // 🔍 Analyze Email (disabled unless email selected)
    .addSection(CardService.newCardSection()
     .setHeader("🔍 Analyze Email")
    .addWidget(CardService.newTextParagraph()
      .setText("Use AI to analyze the selected email. Please open an email first."))
    .addWidget(CardService.newTextButton()
      .setText("🔍 Analyze This Email")
    .setOnClickAction(CardService.newAction().setFunctionName("analyzeEmail"))))


    // ⚙️ Settings + Scenario
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextButton()
        .setText("⚙️ Open Settings")
        .setOnClickAction(CardService.newAction().setFunctionName("showSettingsUI"))))

    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextButton()
        .setText("📌 Define Custom Scenario")
        .setOnClickAction(CardService.newAction().setFunctionName("showScenarioCreationUI"))));

  return [card.build()];
}


function showSettingsUI() {
  var currentPosition = PropertiesService.getUserProperties().getProperty("USER_POSITION") || "";
  var currentContactInfo = PropertiesService.getUserProperties().getProperty("USER_CONTACT_INFO") || "";
  

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle("🛠️ EmailGenie Settings")
      .setSubtitle("Customize your email signature"))
    .addSection(
      CardService.newCardSection()
        .setHeader("✏️ Signature Details")
        .addWidget(CardService.newTextInput()
          .setFieldName("userPosition")
          .setTitle("Your Position")
          .setHint("Enter your position (e.g., Academic Advisor)")
          .setValue(currentPosition))
        .addWidget(CardService.newTextInput()
          .setFieldName("userContactInfo")
          .setTitle("Additional Contact Information")
          .setHint("Enter additional contact info (e.g., Phone: 123-456-7890, Office: Room 101)")
          .setValue(currentContactInfo))
        .addWidget(CardService.newTextButton()
          .setText("✅ Save Settings")
          .setOnClickAction(CardService.newAction().setFunctionName("saveSettings")))
    );

  return [card.build()];
}

function saveSettings(e) {
  var userPosition = e.formInput.userPosition || "Not specified";
  var userContactInfo = e.formInput.userContactInfo || "Not specified";


  PropertiesService.getUserProperties().setProperty("USER_POSITION", userPosition);
  PropertiesService.getUserProperties().setProperty("USER_CONTACT_INFO", userContactInfo);
 

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot())
    .setNotification(CardService.newNotification().setText("✅ Settings saved successfully!"))
    .build();
}

function getSelectedEmailContent(e) {
  if (!e || !e.gmail || !e.gmail.messageId) {
    return "No email content found.";
  }

  var messageId = e.gmail.messageId;
  var message = GmailApp.getMessageById(messageId);
  if (!message) {
    return "Could not retrieve email content.";
  }

  return message.getPlainBody();
}

function getSenderName(e) {
  if (!e || !e.gmail || !e.gmail.messageId) {
    return "Unknown Sender";
  }

  var messageId = e.gmail.messageId;
  var message = GmailApp.getMessageById(messageId);
  if (!message) {
    return "Unknown Sender";
  }

  var senderInfo = message.getFrom();
  var nameMatch = senderInfo.match(/^(.*?)\s*<.*?>$/);
  return nameMatch ? nameMatch[1].trim() : senderInfo;
}

function analyzeEmail(e) {
  var emailContent = getSelectedEmailContent(e);
  var senderName = getSenderName(e);

  // Handle case when no email is selected (from homepage)
  if (!e || !e.gmail || !e.gmail.messageId || !emailContent || emailContent === "No email content found.") {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Please select an email to analyze."))
      .build();
  }

  var prompt = `Analyze the following email. Extract key points, sentiment, and action items:

Sender: '${senderName}'.
Email content: ${emailContent}`;

  var analysisResult = callOpenAI(prompt);

  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation()
        .pushCard(createAnalysisCard(senderName, emailContent, analysisResult))
    )
    .build();
}

function createAnalysisCard(senderName, emailContent, analysisResult) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle("📊 Email Analysis")
      .setSubtitle("Insights from your email"))
    .addSection(
      CardService.newCardSection()
        .setHeader("**📩 Email Details**")
        .addWidget(CardService.newTextParagraph().setText(`👤 <b>Sender:</b> ${senderName}`))
        .addWidget(CardService.newTextParagraph().setText(`📜 <b>Email Content:</b> \n${emailContent}`)))
    .addSection(
      CardService.newCardSection()
        .setHeader("🔍 AI Analysis")
        .addWidget(CardService.newTextParagraph().setText(analysisResult)))
    .addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextButton()
          .setText("⬅ Back to EmailGenie")
          .setOnClickAction(CardService.newAction().setFunctionName("onGmailMessageOpen"))));

  return card.build();
}

function myFunction() {
  Logger.log("myFunction executed successfully.");
}
