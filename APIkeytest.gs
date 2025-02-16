function testOpenAIKey() {
  var apiKey = "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"; // Replace with your API key
  var url = "https://api.openai.com/v1/models";
  
  var options = {
    "method": "get",
    "headers": {
      "Authorization": "Bearer " + apiKey
    }
  };

  var response = UrlFetchApp.fetch(url, options);
  Logger.log(response.getContentText());
}

