function showScenarioSelectionUI() {
  var userScenarios = loadScenariosFromDrive();
  Logger.log("🔄 Loading Scenarios from Drive: " + JSON.stringify(userScenarios));

  var scenarioDropdown = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle("Select a Custom Scenario")
    .setFieldName("scenario");

  if (Object.keys(userScenarios).length === 0) {
    scenarioDropdown.addItem("No scenarios available", "none", true);
  } else {
    Object.keys(userScenarios).sort().forEach(function (scenarioKey) {
      var scenario = userScenarios[scenarioKey];
      scenarioDropdown.addItem(scenario.title, scenarioKey, false);
    });
  }

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle("📌 Manage Custom Scenarios")
      .setSubtitle("Generate replies using custom scenarios"))
    .addSection(
      CardService.newCardSection()
        .setHeader("📋 Scenario Selection")
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
            .setOnClickAction(CardService.newAction().setFunctionName("showScenarioCreationUI")))
        .addWidget(
          CardService.newTextButton()
            .setText("📨 Generate Reply")
            .setOnClickAction(CardService.newAction().setFunctionName("generateScenarioBasedReply")))
        .addWidget(
          CardService.newTextButton()
            .setText("🗑️ Delete Scenario")
            .setOnClickAction(CardService.newAction().setFunctionName("deleteScenario")))
    );

  return [card.build()];
}

function generateScenarioBasedReply(e) {
  var userEmail = Session.getActiveUser().getEmail();
  var userName = userEmail.split("@")[0].replace(/\./g, " ");
  userName = userName.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

  var selectedScenario = e.formInput.scenario;
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
  
  User's full name: '${userName}'.
  Sender: '${senderName}'.
  Email content: ${emailContent}
  Additional Details Provided by User: "${additionalInfo}".`;

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

function defineNewScenario(e) {
  var scenarioName = e.formInput.scenarioName;
  var scenarioTitle = e.formInput.scenarioTitle;
  var scenarioProcess = e.formInput.scenarioProcess;
  var scenarioContact = e.formInput.scenarioContact;

  if (!scenarioName || !scenarioTitle) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot())
    .setNotification(CardService.newNotification().setText("❌ Scenario name and title are required."))
    .build();
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(scenarioName)) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot())
    .setNotification(CardService.newNotification().setText("❌ Identifier can only contain letters, numbers, underscores, or hyphens."))
    .build();
  }

  var userScenarios = loadScenariosFromDrive();

  userScenarios[scenarioName] = {
    title: scenarioTitle,
    process: scenarioProcess,
    contact_person: scenarioContact
  };

  saveScenariosToDrive(userScenarios);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot().pushCard(showScenarioSelectionUI()[0]))
    .setNotification(CardService.newNotification().setText(`✅ Scenario '${scenarioTitle}' saved successfully. Select it from the dropdown.`))
    .build();
}

function saveScenariosToDrive(userScenarios) {
  var folderName = "EmailGenie_Scenarios";
  var fileName = "user_scenarios.json";
  
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  
  var files = folder.getFilesByName(fileName);
  
  if (files.hasNext()) {
    var file = files.next();
    file.setContent(JSON.stringify(userScenarios, null, 2));
  } else {
    folder.createFile(fileName, JSON.stringify(userScenarios, null, 2), MimeType.PLAIN_TEXT);
  }
}

function loadScenariosFromDrive() {
  var folderName = "EmailGenie_Scenarios";
  var fileName = "user_scenarios.json";

  var folders = DriveApp.getFoldersByName(folderName);
  if (!folders.hasNext()) return {};

  var folder = folders.next();
  var files = folder.getFilesByName(fileName);
  
  if (!files.hasNext()) return {};

  var file = files.next();
  var content = file.getBlob().getDataAsString();
  return JSON.parse(content);
}

function deleteScenario(e) {
  var selectedScenario = e.formInput.scenario;
  var userScenarios = loadScenariosFromDrive();

  if (!userScenarios[selectedScenario]) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Scenario not found."))
      .build();
  }

  delete userScenarios[selectedScenario];

  saveScenariosToDrive(userScenarios);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot().pushCard(showScenarioSelectionUI()[0]))
    .setNotification(CardService.newNotification().setText(`✅ Scenario '${selectedScenario}' deleted successfully.`))
    .build();
}

function showScenarioCreationUI() {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle("📌 Define a Custom Scenario")
      .setSubtitle("Create a new scenario for email replies"))
    .addSection(
      CardService.newCardSection()
        .setHeader("✏️ Scenario Details")
        .addWidget(
          CardService.newTextInput()
            .setFieldName("scenarioName")
            .setTitle("Scenario Identifier (No Spaces)")
            .setHint("Example: course_registration"))
        .addWidget(
          CardService.newTextInput()
            .setFieldName("scenarioTitle")
            .setTitle("Scenario Title")
            .setHint("Example: Course Registration Help"))
        .addWidget(
          CardService.newTextInput()
            .setFieldName("scenarioProcess")
            .setTitle("Process Description")
            .setHint("Example: Registration can be completed through the student portal."))
        .addWidget(
          CardService.newTextInput()
            .setFieldName("scenarioContact")
            .setTitle("Contact Person")
            .setHint("Example: Registration Officer (email: reg_officer@university.edu)"))
        .addWidget(
          CardService.newTextButton()
            .setText("✅ Save Scenario")
            .setOnClickAction(CardService.newAction().setFunctionName("defineNewScenario")))
    );

  return [card.build()];
}

function debugCheckScenariosFromDrive() {
  var scenarios = loadScenariosFromDrive();
  Logger.log("🔍 Stored Scenarios in Drive: " + JSON.stringify(scenarios));
}
