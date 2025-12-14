# Celigo U Content Scraper - Claude Code Handover

## Project Overview

**Project Name:** Celigo U Content Scraper  
**Type:** Chrome Extension (Manifest V3)  
**Purpose:** Extract learning content from Celigo University (training.celigo.com) for flashcard generation  
**Owner:** Bruno Rubio - Urku Consulting, LLC  
**Status:** MVP Working - Needs Refinement

---

## What This Extension Does

Extracts interactive learning elements from Celigo U training pages (which use Skilljar LMS with Rise 360 SCORM content):

- **Flip Cards** - Front/back content for flashcards
- **Hotspots/Labeled Graphics** - Interactive image markers with descriptions
- **Knowledge Checks** - Quiz questions with answers and feedback
- **Accordions** - Expandable content sections
- **Tabs** - Tabbed content panels
- **Tables** - Structured data (like permission matrices)
- **Lists** - Bullet points and numbered lists
- **Text Blocks** - Headings and paragraphs

Output is JSON that can be pasted into a Claude conversation to generate study flashcards.

---

## Current File Structure

```
celigo-u-scraper/
├── manifest.json           # Extension config (Manifest V3)
├── popup.html              # Extension popup UI
├── popup.js                # Popup logic & scraping coordination
├── background.js           # Service worker for frame aggregation
├── lib/
│   ├── content-main.js     # Main page script (Skilljar metadata)
│   └── content-iframe.js   # SCORM iframe script (Rise 360 content)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## Technical Architecture

### The Challenge
Celigo U uses Skilljar LMS which loads SCORM content (Rise 360 courses) in a **cross-origin iframe**. Browser security prevents direct access to iframe content from the parent page.

### Current Solution
Three extraction methods run in parallel:

1. **Content Script Messages** - `content-main.js` extracts Skilljar metadata from parent page
2. **Iframe Content Script** - `content-iframe.js` runs inside SCORM frames (when same-origin)
3. **Direct Script Injection** - `popup.js` uses `chrome.scripting.executeScript()` with `allFrames: true` to inject extraction code directly

The popup aggregates and deduplicates results from all methods.

### Key Selectors (Rise 360)
```javascript
// Labeled Graphics / Hotspots
'.labeled-graphic-canvas'
'.labeled-graphic-canvas__item'
'[class*="labeled-graphic"]'

// Flip Cards
'.blocks-flip-card'
'[class*="flip-card"]'

// Knowledge Checks
'[class*="knowledge"]'
'[class*="quiz"]'
'[class*="question"]'

// Accordions
'.blocks-accordion'
'[class*="accordion"]'
```

---

## Known Issues (TODO)

### High Priority

1. **Duplicate Content**
   - Hotspots are captured multiple times (6x in test)
   - Need deduplication based on content hash, not just ID
   - Location: `popup.js` → `combineResults()` function

2. **Navigation Buttons Captured**
   - "Close modal", "Previous", "Next" buttons appear in hotspot data
   - Need filter to exclude common UI button labels
   - Location: Script injection function in `popup.js`

3. **Text Truncation**
   - Some content ends at 200 characters with "..."
   - Increase limit or remove for important content
   - Location: `popup.js` → script injection → `.substring(0, 200)`

### Medium Priority

4. **Knowledge Checks Not Detected**
   - Quiz questions exist but aren't being captured
   - Rise 360 may use different selectors
   - Need to inspect actual quiz DOM structure

5. **Flip Cards Not Detected**
   - Zero flip cards in test output
   - May need updated selectors for Rise 360 version

6. **Images Not Captured**
   - No images in output despite page having them
   - Cross-origin restrictions may block image URLs

### Low Priority

7. **Better Metadata Extraction**
   - Learning path name not captured
   - Lesson number within course not captured

8. **Export Options**
   - Add "Download JSON" button
   - Add "Copy as Markdown" option for direct use

---

## Sample Output Structure

```json
{
  "metadata": {
    "scrapedAt": "2025-12-14T15:19:20.036Z",
    "url": "https://training.celigo.com/...",
    "course": "Account Settings",
    "lesson": "Account",
    "description": "Review how to create/modify user accounts..."
  },
  "content": {
    "flipCards": [],
    "hotspots": [
      {
        "id": "injected-lg-0",
        "points": [
          { "index": 0, "label": "StatusThis shows whether..." }
        ]
      }
    ],
    "knowledgeChecks": [],
    "tables": [
      {
        "id": "injected-table-0",
        "headers": ["Role", "Admin", "Manage All", "Monitor All", "Custom"],
        "rows": [["Transfer Account Ownership", "No", "No", "No", "No"], ...]
      }
    ],
    "textBlocks": [...],
    "lists": [...]
  },
  "statistics": {
    "flipCards": 0,
    "hotspots": 6,
    "tables": 1,
    "totalItems": 87
  }
}
```

---

## Development & Testing

### Load Extension
```bash
# Navigate to chrome://extensions/
# Enable "Developer mode"
# Click "Load unpacked"
# Select the celigo-u-scraper folder
```

### Test Pages
- https://training.celigo.com/path/builder-core-learning-path/account-settings/194670/scorm/1moiad0s3b4iq
- Any Celigo U course with interactive content

### Reload After Changes
1. Make code changes
2. Go to `chrome://extensions/`
3. Click refresh icon (🔄) on extension card
4. Reload the Celigo U page
5. Click extension → "Scrape Page Content"

### Debug
- Open DevTools on Celigo U page
- Check Console for "Celigo U Scraper:" log messages
- Check Network tab for iframe URLs
- Use "Inspect views: service worker" link in extension details

---

## Immediate Next Steps

1. **Fix Deduplication** - Update `combineResults()` to use content-based hashing:
```javascript
const seen = new Set();
combined.content[key] = combined.content[key].filter(item => {
    // Create hash from actual content, not ID
    const contentStr = item.content || item.question || item.label || 
                       JSON.stringify(item.points?.map(p => p.label));
    const hash = contentStr?.substring(0, 100);
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
});
```

2. **Filter Navigation Buttons** - Add exclusion list:
```javascript
const EXCLUDE_LABELS = [
    'close modal', 'previous', 'next', 'back', 'submit',
    'continue', 'skip', 'menu', 'not viewed'
];

// In extraction:
if (EXCLUDE_LABELS.some(ex => label.toLowerCase().includes(ex))) {
    return; // Skip this item
}
```

3. **Remove Character Limit** - Change truncation:
```javascript
// From:
label.substring(0, 200)
// To:
label.substring(0, 2000)  // Or remove entirely
```

---

## Future Enhancements

- [ ] Auto-scroll page to trigger lazy-loaded content
- [ ] Batch scrape multiple lessons in a course
- [ ] Direct integration with flashcard generation (API call to Claude)
- [ ] Store extraction history in chrome.storage
- [ ] Export as Anki deck format
- [ ] Visual diff between scrapes (track course changes)

---

## Related Context

### User's Goal
Bruno is preparing for **Celigo Builder Core Certification**. He's building a study system that:
1. Scrapes training content (this extension)
2. Generates flashcards (separate Claude conversation)
3. Creates interactive HTML study materials

### Example Flashcard Output
See: `/mnt/user-data/uploads/advanced-configurations-transformation-2-hooks.html`
- HTML file with embedded flashcard data
- Dark theme UI with flip card interactions
- Includes learning objectives, key concepts, knowledge checks

### Bruno's Development Standards
- SuiteScript 2.1 style (modular, JSDoc comments)
- Semantic versioning
- Helper modules for config/logging
- Git workflow with dev/stable branches

---

## Commands for Claude Code

```bash
# Navigate to project
cd ~/OneDrive/Documents/celigo_scraper_extension/celigo-u-scraper

# View current structure
ls -la

# Edit specific file
code popup.js

# Test changes - instructions above for Chrome reload

# Package for distribution
zip -r celigo-u-scraper-v1.1.0.zip celigo-u-scraper/
```

---

## Contact

**Developer:** Bruno Rubio  
**Email:** bruno.rubio@urkuconsulting.com  
**GitHub:** https://github.com/brubi0/
