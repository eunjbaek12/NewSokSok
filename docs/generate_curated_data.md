Mission: Automated Batch Generation of 100 Curated Themes (50+ Words Each)

[Goal]
Create a Python script to batch-generate high-quality, "context-first" vocabulary data for 100 themes. The data must be stored in a structured format (assets/data/soksok_voca.db) for the Curation Library.

[Data Requirements per Theme]

Quantity: 50 to 60 high-density words (Quality over quantity).

Difficulty: CEFR B2+ level (Professional/Advanced).

Fields:

word: The English word/phrase.

meaningKr: Contextualized Korean translation. It must be the most appropriate nuance for the specific theme (not just a generic dictionary meaning).

example: A concise, contextual example sentence. Length MUST be strictly between 10-15 words to ensure readability on mobile screens.

[Automation Script Instructions]

Script Path: Create scripts/data_factory.py.

Logic:

Contextual Prompting: When calling the Gemini API, explicitly state the theme and situation. (e.g., "Generate words for 'Baking Science', ensuring meanings are related to chemistry/cooking.")

Self-Correction & Validation:

Length Check: The script must count the words in the example field. If it's over 15 or under 10, ask the API to rewrite it once.

Context Check: Include a step where the API verifies: "Does the Korean meaning naturally fit the example and the theme?"

Storage: Save all data into a SQLite database (soksok_voca.db) with tables for themes and words.

[First Step]

First, generate a structured List of 100 Themes (Title + 1-sentence description) based on the categories: [Survival & Essentials / Professional & Specialized / Social & Global Issues].

After I approve the list, write the Python script and run a Test Run for the first 2 themes to verify:

Are the examples concise (10-15 words)?

Does the Korean meaning perfectly match the professional context?

Please start by suggesting the 100 Theme List in a JSON-ready format.