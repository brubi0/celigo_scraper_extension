# Celigo U Content Scraper

A Chrome extension for extracting learning content from Celigo University (training.celigo.com) pages for flashcard generation.

## Features

- **Extracts Interactive Elements:**
  - Flip Cards (front/back content)
  - Hotspots / Labeled Graphics
  - Knowledge Checks (questions, answers, feedback)
  - Accordions
  - Tabbed Content
  - Process/Steps
  - Timeline Events
  - Sorting Activities
  - Text Blocks
  - Lists
  - Tables
  - Images (with alt text and captions)
  - Videos

- **Supports Multiple Content Types:**
  - Articulate Rise 360 courses
  - Storyline content
  - Generic SCORM packages

- **Easy Export:**
  - JSON output for flashcard generation
  - Copy to clipboard with one click
  - Structured data format

## Installation

### Developer Mode (Recommended for Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `celigo-u-scraper` folder

### Building for Distribution

1. Zip the extension folder
2. Upload to Chrome Web Store (requires developer account)

## Usage

1. Navigate to any Celigo U training page (training.celigo.com)
2. Click the extension icon in the toolbar
3. View the detected course and lesson information
4. Click "Scrape Page Content" to extract learning elements
5. Review the extracted content in the Summary tab
6. Switch to JSON tab to see the full data structure
7. Click "Copy JSON to Clipboard" to copy for use in flashcard generation

## Output Format

```json
{
  "metadata": {
    "scrapedAt": "2024-12-14T10:30:00.000Z",
    "url": "https://training.celigo.com/...",
    "course": "Course Name",
    "lesson": "Lesson Name",
    "path": "Learning Path Name"
  },
  "content": {
    "flipCards": [
      {
        "id": "flip-1",
        "front": { "title": "...", "content": "..." },
        "back": { "title": "...", "content": "..." }
      }
    ],
    "hotspots": [...],
    "knowledgeChecks": [
      {
        "id": "kc-1",
        "question": "What is...?",
        "choices": [
          { "text": "Option A", "isCorrect": false },
          { "text": "Option B", "isCorrect": true }
        ],
        "feedback": "Correct! Because..."
      }
    ],
    "accordions": [...],
    "tabs": [...],
    "textBlocks": [...],
    "images": [...],
    "videos": [...]
  },
  "statistics": {
    "flipCards": 5,
    "hotspots": 3,
    "knowledgeChecks": 2,
    "totalItems": 10
  }
}
```

## Integration with Flashcard Generation

The JSON output is designed to be pasted into a Claude conversation for generating flashcard study materials. The structured format allows for:

1. Converting flip cards directly to flashcards
2. Transforming knowledge checks into Q&A cards
3. Creating definition cards from text blocks
4. Building image-based review cards

## Technical Notes

### Content Script Architecture

- **content-main.js**: Runs on the main Celigo U page, extracts Skilljar metadata and attempts to access iframe content
- **content-iframe.js**: Runs inside SCORM frames, specialized for Rise 360 and Articulate content extraction
- **background.js**: Service worker for coordination and storage

### Permissions Required

- `activeTab`: Access current tab content
- `scripting`: Execute scripts in page context
- `storage`: Save extraction history
- `clipboardWrite`: Copy JSON to clipboard

### Cross-Origin Considerations

The SCORM content is loaded in an iframe. Due to browser security policies:
- Same-origin frames are fully accessible
- Cross-origin frames may have limited access
- The extension uses `all_frames: true` to inject scripts where possible

## Troubleshooting

### "Extension not loaded" error
- Refresh the Celigo U page
- Ensure you're on a training.celigo.com URL

### No content extracted
- Some SCORM packages may use different element structures
- Check the browser console for errors
- The content may be dynamically loaded - wait for full page load

### Partial content
- Cross-origin restrictions may prevent full access
- Rise 360 content is best supported
- Generic SCORM may have limited extraction

## Development

### Project Structure

```
celigo-u-scraper/
├── manifest.json          # Extension configuration
├── popup.html            # Extension popup UI
├── popup.js              # Popup logic
├── background.js         # Service worker
├── lib/
│   ├── content-main.js   # Main page content script
│   └── content-iframe.js # Iframe content script
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### Adding New Element Types

1. Add extraction function in content-iframe.js
2. Add selector patterns for the element
3. Update the content object structure
4. Add UI display in popup.js

## Version History

- **1.0.0** - Initial release
  - Rise 360 content extraction
  - Knowledge check detection
  - Flip card extraction
  - JSON export

## License

MIT License - Free to use and modify

## Author

Bruno Rubio - Urku Consulting, LLC
