// Global variable for user scenarios
var USER_SCENARIOS = {};

// Load user scenarios from PropertiesService
function loadScenarios() {
  var scriptProperties = PropertiesService.getUserProperties();
  var scenariosJson = scriptProperties.getProperty("scenarios");
  USER_SCENARIOS = scenariosJson ? JSON.parse(scenariosJson) : {};
}

// Save user scenarios to PropertiesService
function saveScenarios() {
  var scriptProperties = PropertiesService.getUserProperties();
  scriptProperties.setProperty("scenarios", JSON.stringify(USER_SCENARIOS));
}

// Global variable for user-defined contexts
var USER_CUSTOM_CONTEXTS = {
  "course_registration": {
    "title": "Course Registration Help",
    "process": "Registration can be completed through the student portal.",
    "contact_person": "Registration Officer (email: reg_officer@university.edu)"
  },
  "job_application": {
    "title": "Job Application Inquiry",
    "process": "Submit your application through the careers portal.",
    "contact_person": "HR Department (email: hr@company.com)"
  }
};
//new
// Function to load user-defined contexts from storage
function loadCustomContexts() {
  var scriptProperties = PropertiesService.getUserProperties();
  var contextsJson = scriptProperties.getProperty("customContexts");
  USER_CUSTOM_CONTEXTS = contextsJson ? JSON.parse(contextsJson) : USER_CUSTOM_CONTEXTS;
}

// Function to save user-defined contexts to storage
function saveCustomContexts() {
  var scriptProperties = PropertiesService.getUserProperties();
  scriptProperties.setProperty("customContexts", JSON.stringify(USER_CUSTOM_CONTEXTS));
}

// Enhance a short message into a full email and insert into Gmail compose box
function enhanceShortMessage(e) {
  if (!e || !e.formInput || !e.formInput.shortMessage) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Please enter a short message to enhance."))
      .build();
  }

  var formInput = e.formInput.shortMessage;
  
  // Modify AI prompt to explicitly return a structured response with subject & body
  var prompt = `Enhance this short message into a friendly and professional email. 
  Format the response as follows:
  - Subject: [Generated Subject]
  - Body: [Generated Email Content]
  
  Short message: ${formInput}`;

  var aiResponse = callOpenAI(prompt);

  // Extract subject and email body from AI response
  var subjectMatch = aiResponse.match(/Subject:\s*(.*)/i);
  var bodyMatch = aiResponse.match(/Body:\s*([\s\S]*)/i);

  var emailSubject = subjectMatch ? subjectMatch[1].trim() : "No Subject";
  var emailBody = bodyMatch ? bodyMatch[1].trim() : aiResponse;

  // Create a draft with the correct subject and body
  GmailApp.createDraft("", emailSubject, emailBody);

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("✅ Email generated and saved as a draft. Open Gmail Compose to edit."))
    .build();
}

function generateReplyForScenario(e) { 
  var userEmail = Session.getActiveUser().getEmail();
  var userName = userEmail.split("@")[0].replace(/\./g, " ");
  userName = userName.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

  var selectedScenario = e.formInput.scenario;
  var additionalInfo = e.formInput.additionalInfo || ""; // Preserve custom input
  var emailContent = getSelectedEmailContent(e);
  var senderName = getSenderName(e);
  var subject = getEmailSubject(e);

  if (!emailContent) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ No email content found. Cannot generate a reply."))
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
  var formattedSubject = subject.startsWith("Re:") ? subject : "Re: " + subject;
  aiResponse = aiResponse.replace(/^Subject:.*\n?/i, "").trim();

  GmailApp.createDraft("", formattedSubject, aiResponse);

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("✅ AI-generated reply saved in Gmail drafts. Open to review and send."))
    .build();
}

// Function to get email subject
function getEmailSubject(e) {
  if (!e || !e.gmail || !e.gmail.messageId) {
    return "No Subject"; // Default if no subject found
  }

  var messageId = e.gmail.messageId;
  var message = GmailApp.getMessageById(messageId);
  if (!message) {
    return "No Subject";
  }

  return message.getThread().getFirstMessageSubject(); // Get original subject
}

//function onGmailMessageOpen(e) {
//if (!e || !e.gmail || !e.gmail.messageId) {
//   return CardService.newActionResponseBuilder()
//    .setNotification(CardService.newNotification().setText("❌ No email found."))
//     .build();
// }

//var emailContent = getSelectedEmailContent(e);
// var senderName = getSenderName(e);

// var card = CardService.newCardBuilder()
// .setHeader(CardService.newCardHeader().setTitle("📧 EMAIL GENIE"))
//   .addSection(
//     CardService.newCardSection()
//       .addWidget(CardService.newTextParagraph().setText("👤 **Sender:** " + senderName))
//      .addWidget(CardService.newTextParagraph().setText("📩 **Email Content:**\n" + emailContent.substring(0, 200) + "..."))
// )
//.addSection(
// CardService.newCardSection()
// .addWidget(CardService.newTextParagraph().setText("💡 **AI-Generated Preview:**\n(Select a reply type and add optional details)"))
//)
//.addSection(
//CardService.newCardSection()
//    .addWidget(
//       CardService.newTextInput()
//         .setFieldName("additionalInfo")
//        .setTitle("📝 Add Custom Information")
//         .setHint("E.g., Mention a specific date, reason, or extra details for AI to consider.")
//    )
//  )
//  .addSection(
//     CardService.newCardSection()
//     .addWidget(
//        CardService.newSelectionInput()
//         .setType(CardService.SelectionInputType.DROPDOWN)
//          .setTitle("Select Reply Type")
//          .setFieldName("scenario")
//           .addItem("Positive Response", "positive", false)
//           .addItem("Negative Response", "negative", false)
//           .addItem("Suggest Alternative", "alternative", false)
//            .addItem("❌ Discard Reply", "discard", false) // New discard option
//           .setOnChangeAction(CardService.newAction().setFunctionName("updatePreview"))
//      )
//       .addWidget(
//          CardService.newTextButton()
//           .setText("📨 Generate Reply")
//           .setOnClickAction(CardService.newAction().setFunctionName("generateReplyForScenario"))
//        )
//    );

//  return [card.build()];
//}

function onGmailMessageOpen(e) {
  if (!e || !e.gmail || !e.gmail.messageId) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ No email found."))
      .build();
  }

  var emailContent = getSelectedEmailContent(e);
  var senderName = getSenderName(e);

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("📧 EMAIL GENIE"))
    .addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText("👤 **Sender:** " + senderName))
        .addWidget(CardService.newTextParagraph().setText("📩 **Email Content:**\n" + emailContent.substring(0, 200) + "..."))
    )
    .addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText("💡 **AI-Generated Preview:**\n(Select a reply type and add optional details)"))
    )
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextInput()
            .setFieldName("additionalInfo")
            .setTitle("📝 Add Custom Information")
            .setHint("E.g., Mention a specific date, reason, or extra details for AI to consider.")
        )
    )
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newSelectionInput()
            .setType(CardService.SelectionInputType.DROPDOWN)
            .setTitle("Select Reply Type")
            .setFieldName("scenario")
            .addItem("Positive Response", "positive", false)
            .addItem("Negative Response", "negative", false)
            .addItem("Suggest Alternative", "alternative", false)
            .addItem("📌 Use Custom Scenario", "custom_scenario", false) // Feature 3 added
            .setOnChangeAction(CardService.newAction().setFunctionName("updatePreview"))
        )
        .addWidget(
          CardService.newTextButton()
            .setText("📨 Generate Reply")
            .setOnClickAction(CardService.newAction().setFunctionName("generateReplyForScenario"))
        )
    )
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextButton()
            .setText("⚙️ Manage Custom Scenarios")  // NEW: Open the scenario selection UI
            .setOnClickAction(CardService.newAction().setFunctionName("showScenarioSelectionUI"))
        )
    );

  return [card.build()];
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
      return data.name;  // Full name from Google account
    } else if (data.given_name && data.family_name) {
      return data.given_name + " " + data.family_name; // First + Last name
    }

    return "User";  // Fallback name if not found
  } catch (error) {
    Logger.log("⚠ Error fetching user name: " + error.toString());
    return "User";  // Fallback to "User" if API fails
  }
}


// 📌 updatePreview FUNCTION 
function updatePreview(e) {
  var selectedScenario = e.formInput.scenario;
  var additionalInfo = e.formInput.additionalInfo || ""; 
  var emailContent = getSelectedEmailContent(e);
  var senderName = getSenderName(e);
  var userName = getUserNameFromGoogle(); // ✅ Fetch user name from Google Account

  if (!emailContent) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ No email content found."))
      .build();
  }

  if (selectedScenario === "discard") {
    var discardCard = CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader().setTitle("📧 EMAIL GENIE"))
      .addSection(CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText("🚫 **Reply discarded.** Select a new response type to continue.")))
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

  var aiPreviewHeader = "🔷 **AI-Generated Preview:** 🔷\n";

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("📧 EMAIL GENIE"))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText("👤 **Sender:** " + senderName))
      .addWidget(CardService.newTextParagraph().setText("📩 **Email Content:**\n" + emailContent.substring(0, 200) + "...")))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(aiPreviewHeader))
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


// Call OpenAI API for AI-generated responses
function callOpenAI(prompt) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) {
    Logger.log("⚠ Error: Missing OpenAI API key.");
    return "Error: Missing API key.";
  }

  var userName = getUserNameFromGoogle(); // Fetch user name from Google Account

  var url = "https://api.openai.com/v1/chat/completions";
  var payload = {
    "model": "gpt-4o-mini",
    "messages": [
      { 
        "role": "system", 
        "content": `You are an AI email assistant. Always refer to the user as '${userName}' in responses. Ensure the response addresses the sender by name and is professional.` 
      },
      { "role": "user", "content": prompt }
    ],
    "max_tokens": 250,
    "temperature": 0.7
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "headers": { "Authorization": "Bearer " + apiKey },
    "payload": JSON.stringify(payload)
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var data = JSON.parse(response.getContentText());
    return data.choices[0]?.message?.content?.trim() || "No AI response received.";
  } catch (error) {
    Logger.log("⚠ OpenAI API Error: " + error.toString());
    return "Error: " + error.toString();
  }
}



// Gmail Add-on UI
// function showSidebar() {
//  var card = CardService.newCardBuilder()
//    .setHeader(CardService.newCardHeader()
//      .setTitle("📩 EmailGenie")
//      .setSubtitle("Your AI-powered email assistant ✨")
//    )
//    .addSection(
//      CardService.newCardSection()
//        .addWidget(CardService.newTextParagraph()
//          .setText("👋 Welcome to EmailGenie!\n\nLet AI handle your emails with smart email generation. 🚀"))
//    )
//    .addSection(
//      CardService.newCardSection()
//        .addWidget(CardService.newTextInput()
//          .setFieldName("shortMessage")  // ✅ Ensure this field name matches the function input
//         .setTitle("✍️ Enter Short Message")
//          .setHint("Type a brief message to expand into an email"))
//    )
//    .addSection(
//      CardService.newCardSection()
//        .addWidget(
//          CardService.newTextButton()
//            .setText("⚡ Generate Email")
//            .setOnClickAction(
//              CardService.newAction()
//                .setFunctionName("enhanceShortMessage")
//            )
//        )
//    )
//    .addSection(
//      CardService.newCardSection()
//        .addWidget(
//          CardService.newTextButton()
//            .setText("🔍 Analyze Email")  // ✅ "Analyze Email" button is added back
//           .setOnClickAction(
//              CardService.newAction()
//                .setFunctionName("analyzeEmail")
//            )
//        )
//    );
//
//  return [card.build()];
//}
function showSidebar() {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle("📩 EmailGenie")
      .setSubtitle("Your AI-powered email assistant ✨")
    )
    .addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextParagraph()
          .setText("👋 Welcome to EmailGenie!\n\nLet AI handle your emails with smart email generation. 🚀"))
    )
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextInput()
            .setFieldName("shortMessage")
            .setTitle("✍️ Enter Short Message")
            .setHint("Type a brief message to expand into an email") // ✅ Restored Text Input
        )
        .addWidget(
          CardService.newTextButton()
            .setText("⚡ Enhance Text")
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName("enhanceShortMessage") // ✅ Calls enhance function
            )
        )
    )
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextButton()
            .setText("🔍 Analyze Email")  
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName("analyzeEmail") // ✅ Calls analyze function
            )
        )
    )
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextButton()
            .setText("📌 Use Custom Scenario")
            .setOnClickAction(CardService.newAction().setFunctionName("showScenarioSelectionUI")) 
        )
    )
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextButton()
            .setText("⚙️ Define New Scenario") 
            .setOnClickAction(CardService.newAction().setFunctionName("showScenarioCreationUI"))
        )
    );

  return [card.build()];
}



// Get selected email content
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

// Get sender's name
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

// Analyze the selected email and provide insights
function analyzeEmail(e) {
  var emailContent = getSelectedEmailContent(e);
  var senderName = getSenderName(e);

  if (!emailContent) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ No email content found. Cannot analyze."))
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

// Create card for email analysis results
function createAnalysisCard(senderName, emailContent, analysisResult) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("📊 Email Analysis"))
    .addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText("👤 **Sender:** " + senderName))
        .addWidget(CardService.newTextParagraph().setText("📩 **Email Content:**\n" + emailContent.substring(0, 200) + "..."))
        .addWidget(CardService.newTextParagraph().setText("🔍 **AI Analysis:**\n" + analysisResult))
    );
  function myFunction() {
    Logger.log("myFunction executed successfully.");
}
  return card.build();
}
