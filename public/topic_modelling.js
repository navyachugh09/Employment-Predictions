
/* topic_modelling.js */

let TOPIC_DATA = null;

let activeOcc = null;


// LOAD JSON DATA

fetch("data/topic_modelling_results.json")

  .then(response => response.json())

  .then(data => {

    TOPIC_DATA = data;

    // Automatically select first occupation
    activeOcc = data[0].occupation;

    populateDropdown();

    selectOccupation(activeOcc);

  })

  .catch(error => {

    console.error(
      "Failed to load topic modelling data:",
      error
    );

  });


// DROPDOWN

function populateDropdown() {

  const select =
    document.getElementById(
      "occupationSelect"
    );

  // Clear existing options
  select.innerHTML = "";

  // Create options
  TOPIC_DATA.forEach(item => {

    const option =
      document.createElement("option");

    option.value = item.occupation;

    option.textContent =
      item.occupation
        .replaceAll("_", " ")
        .replace(/\b\w/g, c => c.toUpperCase());

    select.appendChild(option);

  });

  // Set default selected value
  select.value = activeOcc;

  // Change occupation
  select.addEventListener(
    "change",
    event => {

      selectOccupation(
        event.target.value
      );

    }
  );

}


// DISPLAY TOPICS

function selectOccupation(occupation) {

  activeOcc = occupation;

  // Find selected occupation
  const selectedData =
    TOPIC_DATA.find(
      item => item.occupation === occupation
    );

  // Stop if no data found
  if (!selectedData) return;

  // Update page title
  document.getElementById(
    "topicTitle"
  ).textContent =

    "Topics for " +

    occupation
      .replaceAll("_", " ")
      .replace(/\b\w/g, c => c.toUpperCase());

  // Get topic container
  const container =
    document.getElementById(
      "topicsContainer"
    );

  // Clear old cards
  container.innerHTML = "";

  // Create topic cards
  selectedData.topics.forEach(topic => {

    const card =
      document.createElement("div");

    card.className =
      "card mb-3";

    // Create keyword chips
    const keywordHTML =
      topic.keywords.map(keyword =>

        `<span class="topic-chip">
          ${keyword}
        </span>`

      ).join("");

    // Card HTML
    card.innerHTML = `

      <div class="card-body">

        <h5 class="mb-3">

          Topic ${topic.topic_id}

        </h5>

        <div class="mb-3">

          <span class="badge bg-primary">

            ${topic.label}

          </span>

        </div>

        <div>

          ${keywordHTML}

        </div>

      </div>

    `;

    // Add card
    container.appendChild(card);

  });

}

