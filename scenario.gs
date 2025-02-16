// Load user-defined scenarios and contexts from storage
function loadUserScenarios() {
  var scriptProperties = PropertiesService.getUserProperties();
  var scenariosJson = scriptProperties.getProperty("userScenarios");

  Logger.log("🔄 Loading Scenarios: " + scenariosJson); // Debug log to check if data exists

  return scenariosJson ? JSON.parse(scenariosJson) : {};
}


// Save user-defined scenarios and contexts to storage
function saveUserScenarios(scenarios) {
  var scriptProperties = PropertiesService.getUserProperties();
  scriptProperties.setProperty("userScenarios", JSON.stringify(scenarios));
}

function showScenarioSelectionUI() {
  var userScenarios = loadScenariosFromDrive();
  Logger.log("🔄 Loading Scenarios from Drive: " + JSON.stringify(userScenarios)); // Debugging log

  var scenarioDropdown = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle("Select a Custom Scenario")
    .setFieldName("scenario");

  // ✅ Populate dropdown with saved scenarios
  if (Object.keys(userScenarios).length === 0) {
    scenarioDropdown.addItem("No scenarios available", "none", true); // Prevent empty dropdown
  } else {
    Object.keys(userScenarios).forEach(function (scenarioKey) {
      var scenario = userScenarios[scenarioKey]; // Access scenario details
      scenarioDropdown.addItem(scenario.title, scenarioKey, false);
    });
  }

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("📌 Custom Scenario Reply"))
    .addSection(
      CardService.newCardSection()
        .addWidget(scenarioDropdown)
        .addWidget(
          CardService.newTextInput()
            .setFieldName("additionalInfo")
            .setTitle("📝 Add Extra Information")
            .setHint("Provide additional details for a more specific reply.")
        )
    )
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextButton()
            .setText("⚙️ Define New Scenario")
            .setOnClickAction(CardService.newAction().setFunctionName("showScenarioCreationUI"))
        )
        .addWidget(
          CardService.newTextButton()
            .setText("📨 Generate Reply")
            .setOnClickAction(CardService.newAction().setFunctionName("generateScenarioBasedReply"))
        )
    );

  return [card.build()];
}


// Function to handle customizable scenario-based responses
function generateScenarioBasedReply(e) {
  var selectedScenario = e.formInput.scenario;  // The value coming from the dropdown
  var additionalInfo = e.formInput.additionalInfo || "";
  var emailContent = getSelectedEmailContent(e);
  var senderName = getSenderName(e);
  var subject = getEmailSubject(e);

  Logger.log("📌 Selected Scenario from Dropdown: " + selectedScenario);
  
  var userScenarios = loadScenariosFromDrive();
  Logger.log("🔄 All Stored Scenarios: " + JSON.stringify(userScenarios));

  if (!userScenarios[selectedScenario]) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Scenario not found. Please define it first."))
      .build();
  }

  var scenarioData = userScenarios[selectedScenario];
  var title = scenarioData.title || "Custom Scenario";
  var process = scenarioData.process || "No process details available.";
  var contactPerson = scenarioData.contact_person || "No contact information available.";

  var prompt = `Generate a professional email reply based on '${title}'.
  Process: ${process}
  Contact Person: ${contactPerson}
  
  User's full name: 'Yatrik Rami'.
  Sender: '${senderName}'.
  Email content: ${emailContent}
  Additional Details Provided by User: "${additionalInfo}".`;

  var aiResponse = callOpenAI(prompt);
  var formattedSubject = subject.startsWith("Re:") ? subject : "Re: " + subject;
  aiResponse = aiResponse.replace(/^Subject:.*\n?/i, "").trim();

  GmailApp.createDraft("", formattedSubject, aiResponse);

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("✅ Scenario-based reply saved in Gmail drafts. Open to review and send."))
    .build();
}

// Function to allow users to define a new custom scenario
function defineNewScenario(e) {
  var scenarioName = e.formInput.scenarioName;
  var scenarioTitle = e.formInput.scenarioTitle;
  var scenarioProcess = e.formInput.scenarioProcess;
  var scenarioContact = e.formInput.scenarioContact;

  if (!scenarioName || !scenarioTitle) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Scenario name and title are required."))
      .build();
  }

  // Load existing scenarios from Drive
  var userScenarios = loadScenariosFromDrive();

  // Add new scenario
  userScenarios[scenarioName] = {
    title: scenarioTitle,
    process: scenarioProcess,
    contact_person: scenarioContact
  };

  // Save updated scenarios back to Drive
  saveScenariosToDrive(userScenarios);

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(`✅ Scenario '${scenarioTitle}' saved successfully in Google Drive.`))
    .build();
}


function saveScenariosToDrive(userScenarios) {
  var folderName = "EmailGenie_Scenarios"; // Name of the folder in Drive
  var fileName = "user_scenarios.json"; // File name
  
  // Get or create the folder in Drive
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  
  // Check if the file already exists
  var files = folder.getFilesByName(fileName);
  
  if (files.hasNext()) {
    var file = files.next();
    file.setContent(JSON.stringify(userScenarios, null, 2)); // Update existing file
  } else {
    folder.createFile(fileName, JSON.stringify(userScenarios, null, 2), MimeType.PLAIN_TEXT); // Create new file
  }
}

function loadScenariosFromDrive() {
  var folderName = "EmailGenie_Scenarios";
  var fileName = "user_scenarios.json";

  // Get the folder
  var folders = DriveApp.getFoldersByName(folderName);
  if (!folders.hasNext()) return {}; // Return empty if no folder found

  var folder = folders.next();
  var files = folder.getFilesByName(fileName);
  
  if (!files.hasNext()) return {}; // Return empty if no file found

  var file = files.next();
  var content = file.getBlob().getDataAsString(); // Read file content
  return JSON.parse(content); // Convert JSON string back to object
}


// Function to show scenario creation UI
function showScenarioCreationUI() {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("📌 Define a Custom Scenario"))
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextInput()
            .setFieldName("scenarioName")
            .setTitle("Scenario Identifier (No Spaces)")
            .setHint("Example: course_registration")
        )
        .addWidget(
          CardService.newTextInput()
            .setFieldName("scenarioTitle")
            .setTitle("Scenario Title")
            .setHint("Example: Course Registration Help")
        )
        .addWidget(
          CardService.newTextInput()
            .setFieldName("scenarioProcess")
            .setTitle("Process Description")
            .setHint("Example: Registration can be completed through the student portal.")
        )
        .addWidget(
          CardService.newTextInput()
            .setFieldName("scenarioContact")
            .setTitle("Contact Person")
            .setHint("Example: Registration Officer (email: reg_officer@university.edu)")
        )
        .addWidget(
          CardService.newTextButton()
            .setText("✅ Save Scenario")
            .setOnClickAction(CardService.newAction().setFunctionName("defineNewScenario"))
        )
    );

  return [card.build()];
}

function debugCheckScenariosFromDrive() {
  var scenarios = loadScenariosFromDrive();
  Logger.log("🔍 Stored Scenarios in Drive: " + JSON.stringify(scenarios));
}
