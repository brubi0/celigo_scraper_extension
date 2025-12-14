/**
 * Celigo U Scraper - Popup Script
 * Handles UI interactions and communicates with content scripts
 * @version 1.0.8
 */

const VERSION = '1.0.8';

// UI elements to exclude from scraping (navigation buttons, markers, etc.)
const EXCLUDE_LABELS = [
    'close modal',
    'previous',
    'next',
    'back',
    'submit',
    'continue',
    'skip',
    'menu',
    'not viewed',
    'marker,',
    'information, not viewed'
];

// False positive knowledge check patterns (system messages, not actual quiz questions)
const FALSE_POSITIVE_KC = [
    'you are offline',
    'trying to reconnect',
    'loading',
    'please wait',
    'error occurred',
    'begin by',
    'select either option'
];

// Function to check if a label should be excluded
function shouldExcludeLabel(label) {
    if (!label) return true;
    const lowerLabel = label.toLowerCase().trim();
    // Exclude if too short or matches exclusion patterns
    if (lowerLabel.length < 5) return true;
    return EXCLUDE_LABELS.some(ex => lowerLabel.includes(ex) || lowerLabel === ex);
}

// Function to parse a label into title and description
function parseLabel(label) {
    if (!label) return { title: '', description: '' };

    // Common patterns where title runs into description:
    // "StatusThis shows whether..." -> "Status" | "This shows whether..."
    // "Enable userYou can turn off..." -> "Enable user" | "You can turn off..."
    // "Require MFAThe first time..." -> "Require MFA" | "The first time..."
    // "ActionsSelecting the ellipsis..." -> "Actions" | "Selecting the ellipsis..."

    // Pattern 1: Title (possibly with spaces/uppercase words) followed by sentence starter
    // This catches: "Require MFAThe first..." or "Enable userYou can..."
    const sentenceStartMatch = label.match(/^(.+?)((?:The|This|You|When|If|A |An |It |Select|In |On |Use|Click|Choosing|Enabling|Disabling|What|Where|How|Why|Which|MFA |Note:|Tip:|Generally|Additional)[^]*)/);
    if (sentenceStartMatch && sentenceStartMatch[1].length <= 50) {
        let title = sentenceStartMatch[1].trim();
        let description = sentenceStartMatch[2].trim();

        // Clean up title if it ends with partial word that belongs to description
        // e.g., "Require MFAThe" -> check if description starts reasonably
        if (description.match(/^[a-z]/)) {
            // Description starts lowercase, title might have grabbed too much
            const reparse = title.match(/^(.+?)([A-Z][a-z].*)$/);
            if (reparse) {
                title = reparse[1].trim();
                description = reparse[2] + description;
            }
        }

        return { title, description };
    }

    // Pattern 2: Simple boundary - word(s) ending in lowercase, then uppercase starts description
    const boundaryMatch = label.match(/^([A-Z][a-zA-Z\s]{1,40}?)([A-Z][a-z].*)/);
    if (boundaryMatch) {
        return {
            title: boundaryMatch[1].trim(),
            description: boundaryMatch[2].trim()
        };
    }

    // Pattern 3: Colon or dash separator
    const separatorMatch = label.match(/^([^:–—-]{3,40})(?:\s*[:–—-]\s*)(.+)/);
    if (separatorMatch) {
        return {
            title: separatorMatch[1].trim(),
            description: separatorMatch[2].trim()
        };
    }

    // If no pattern found, return full text as description
    return {
        title: '',
        description: label.trim()
    };
}

// Generate content hash for deduplication
function generateContentHash(item) {
    if (!item) return '';

    // For hotspots, hash based on the actual point content
    if (item.points && Array.isArray(item.points)) {
        const pointContent = item.points
            .map(p => p.title || p.description || p.label || '')
            .filter(s => s.length > 0)
            .join('|');
        return pointContent.substring(0, 200);
    }

    // For other items, use their primary content
    const content = item.content || item.question || item.title || item.description || item.label || '';
    return content.substring(0, 200);
}

class CeligoUScraper {
    constructor() {
        this.currentData = null;
        this.initElements();
        this.initEventListeners();
        this.checkPageStatus();
    }

    initElements() {
        this.elements = {
            pageStatus: document.getElementById('page-status'),
            courseName: document.getElementById('course-name'),
            lessonName: document.getElementById('lesson-name'),
            scrapeBtn: document.getElementById('scrape-btn'),
            copyBtn: document.getElementById('copy-btn'),
            loading: document.getElementById('loading'),
            resultsList: document.getElementById('results-list'),
            totalCount: document.getElementById('total-count'),
            messageArea: document.getElementById('message-area'),
            jsonOutput: document.getElementById('json-output'),
            summaryTab: document.getElementById('summary-tab'),
            jsonTab: document.getElementById('json-tab'),
            tabs: document.querySelectorAll('.tab')
        };
    }

    initEventListeners() {
        this.elements.scrapeBtn.addEventListener('click', () => this.scrapeContent());
        this.elements.copyBtn.addEventListener('click', () => this.copyToClipboard());
        
        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
    }

    async checkPageStatus() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab.url.includes('training.celigo.com')) {
                this.setPageStatus('Not a Celigo U page', 'error');
                this.showMessage('Navigate to a Celigo U training page to use this extension.', 'info');
                return;
            }

            // Try to get page metadata from content script
            try {
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });

                if (response && response.success) {
                    this.setPageStatus('Ready', 'success');
                    this.elements.courseName.textContent = response.data.course || '—';
                    this.elements.lessonName.textContent = response.data.lesson || '—';
                    this.elements.scrapeBtn.disabled = false;
                    return;
                }
            } catch (e) {
                // Content scripts not loaded - this is OK, we can still use direct injection
                console.log('Content scripts not ready, will use direct injection');
            }

            // Content scripts not responding, but we can still scrape via direct injection
            this.setPageStatus('Ready (direct mode)', 'success');
            this.elements.scrapeBtn.disabled = false;

        } catch (error) {
            console.error('Status check error:', error);
            this.setPageStatus('Error', 'error');
            this.showMessage('Could not access tab. Try refreshing the page.', 'info');
        }
    }

    setPageStatus(text, type = 'normal') {
        this.elements.pageStatus.textContent = text;
        this.elements.pageStatus.className = 'status-value';
        if (type !== 'normal') {
            this.elements.pageStatus.classList.add(type);
        }
    }

    showMessage(text, type = 'info') {
        this.elements.messageArea.innerHTML = `<div class="message ${type}">${text}</div>`;
    }

    clearMessage() {
        this.elements.messageArea.innerHTML = '';
    }

    async scrapeContent() {
        this.clearMessage();
        this.elements.loading.classList.add('active');
        this.elements.scrapeBtn.disabled = true;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Method 1: Try direct message to content scripts
            let mainResponse = null;
            let iframeResponse = null;

            try {
                mainResponse = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeMainPage' });
            } catch (e) {
                console.log('Main page scrape note:', e.message);
            }

            try {
                iframeResponse = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeIframe' });
            } catch (e) {
                console.log('Iframe scrape note:', e.message);
            }

            // Method 2: Try executing script directly in all frames via background
            let allFramesResponse = null;
            try {
                allFramesResponse = await chrome.runtime.sendMessage({ action: 'executeInAllFrames' });
            } catch (e) {
                console.log('All frames execution note:', e.message);
            }

            // Method 2.5: Extract metadata from MAIN FRAME ONLY (Skilljar page)
            let mainFrameMetadata = null;
            try {
                const metadataResults = await chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: false },
                    func: () => {
                        const metadata = {
                            url: window.location.href,
                            course: '',
                            lesson: '',
                            path: ''
                        };

                        // Try Skilljar-specific selectors
                        const courseTitle = document.querySelector('.course-title, .course-header h1, [class*="course-name"]');
                        if (courseTitle) {
                            metadata.course = courseTitle.textContent.trim();
                        }

                        // Try to get lesson from header or breadcrumb
                        const lessonTitle = document.querySelector('.lesson-top h2, #lesson-main h2, .lesson-title, [class*="lesson-name"]');
                        if (lessonTitle) {
                            metadata.lesson = lessonTitle.textContent.trim();
                        }

                        // Try breadcrumbs
                        const breadcrumbs = document.querySelectorAll('.breadcrumb a, .breadcrumbs a, [class*="breadcrumb"] a');
                        if (breadcrumbs.length > 0) {
                            const crumbs = Array.from(breadcrumbs).map(a => a.textContent.trim()).filter(t => t.length > 0);
                            if (crumbs.length >= 1 && !metadata.course) {
                                metadata.course = crumbs[crumbs.length - 1] || '';
                            }
                            if (crumbs.length >= 2) {
                                metadata.path = crumbs.slice(0, -1).join(' > ');
                            }
                        }

                        // Try page title as fallback
                        if (!metadata.lesson) {
                            const pageTitle = document.title;
                            if (pageTitle && pageTitle.includes('|')) {
                                const parts = pageTitle.split('|').map(p => p.trim());
                                metadata.lesson = parts[0] || '';
                                if (!metadata.course && parts.length > 1) {
                                    metadata.course = parts[1] || '';
                                }
                            }
                        }

                        // Try curriculum list for current lesson
                        const currentLesson = document.querySelector('.lesson-active .title, [aria-current="page"] .title, .current-lesson');
                        if (currentLesson && !metadata.lesson) {
                            metadata.lesson = currentLesson.textContent.trim();
                        }

                        return metadata;
                    }
                });

                if (metadataResults && metadataResults[0] && metadataResults[0].result) {
                    mainFrameMetadata = metadataResults[0].result;
                }
            } catch (e) {
                console.log('Main frame metadata extraction note:', e.message);
            }

            // Method 3: Try direct script injection
            let injectedResponse = null;
            try {
                const injectionResults = await chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    func: () => {
                        // === INLINE HELPER FUNCTIONS ===
                        // (duplicated here because injected scripts can't access outer scope)

                        const EXCLUDE_LABELS = [
                            'close modal', 'previous', 'next', 'back', 'submit',
                            'continue', 'skip', 'menu', 'not viewed', 'marker,',
                            'information, not viewed'
                        ];

                        function shouldExcludeLabel(label) {
                            if (!label) return true;
                            const lowerLabel = label.toLowerCase().trim();
                            if (lowerLabel.length < 5) return true;
                            return EXCLUDE_LABELS.some(ex => lowerLabel.includes(ex) || lowerLabel === ex);
                        }

                        function parseLabel(label) {
                            if (!label) return { title: '', description: '' };

                            // Pattern 1: Title followed by sentence starter
                            const sentenceStartMatch = label.match(/^(.+?)((?:The|This|You|When|If|A |An |It |Select|In |On |Use|Click|Choosing|Enabling|Disabling|What|Where|How|Why|Which|MFA |Note:|Tip:|Generally|Additional)[^]*)/);
                            if (sentenceStartMatch && sentenceStartMatch[1].length <= 50) {
                                let title = sentenceStartMatch[1].trim();
                                let description = sentenceStartMatch[2].trim();

                                // Clean up if description starts lowercase
                                if (description.match(/^[a-z]/)) {
                                    const reparse = title.match(/^(.+?)([A-Z][a-z].*)$/);
                                    if (reparse) {
                                        title = reparse[1].trim();
                                        description = reparse[2] + description;
                                    }
                                }
                                return { title, description };
                            }

                            // Pattern 2: Simple boundary
                            const boundaryMatch = label.match(/^([A-Z][a-zA-Z\s]{1,40}?)([A-Z][a-z].*)/);
                            if (boundaryMatch) {
                                return { title: boundaryMatch[1].trim(), description: boundaryMatch[2].trim() };
                            }

                            // Pattern 3: Colon/dash separator
                            const separatorMatch = label.match(/^([^:–—-]{3,40})(?:\s*[:–—-]\s*)(.+)/);
                            if (separatorMatch) {
                                return { title: separatorMatch[1].trim(), description: separatorMatch[2].trim() };
                            }

                            return { title: '', description: label.trim() };
                        }

                        // False positive knowledge check patterns
                        const FALSE_POSITIVE_KC = [
                            'you are offline', 'trying to reconnect', 'loading',
                            'please wait', 'error occurred', 'begin by', 'select either option'
                        ];

                        function isFalsePositiveKC(question) {
                            if (!question) return true;
                            const lower = question.toLowerCase();
                            return FALSE_POSITIVE_KC.some(fp => lower.includes(fp));
                        }

                        // === EXTRACTION LOGIC ===
                        const content = {
                            flipCards: [],
                            hotspots: [],
                            knowledgeChecks: [],
                            accordions: [],
                            tabs: [],
                            textBlocks: [],
                            lists: [],
                            tables: [],
                            images: []
                        };

                        // Extract metadata from page
                        const metadata = {
                            course: '',
                            lesson: '',
                            path: ''
                        };

                        // Try to get course/lesson from breadcrumbs or page structure
                        const breadcrumbs = document.querySelectorAll('.breadcrumb a, .breadcrumbs a, nav a');
                        if (breadcrumbs.length > 0) {
                            const crumbs = Array.from(breadcrumbs).map(a => a.textContent.trim());
                            if (crumbs.length >= 2) {
                                metadata.path = crumbs[0] || '';
                                metadata.course = crumbs[crumbs.length - 2] || '';
                            }
                        }

                        // Try to get lesson name from h1
                        const h1 = document.querySelector('h1');
                        if (h1) {
                            const h1Text = h1.textContent.trim();
                            // Remove duration if present (e.g., "Account Settings 0 hr 20 min")
                            metadata.lesson = h1Text.replace(/\s*\d+\s*hr\s*\d*\s*min\s*$/i, '').trim();
                        }

                        // Try Skilljar-specific selectors
                        const courseTitle = document.querySelector('.course-title, [class*="course-name"], .lesson-title');
                        if (courseTitle && !metadata.course) {
                            metadata.course = courseTitle.textContent.trim();
                        }

                        // Store metadata in content for later retrieval
                        content.metadata = metadata;

                        // Get all text content (NO TRUNCATION)
                        document.querySelectorAll('h1, h2, h3, h4, p').forEach((el, i) => {
                            const text = el.textContent.trim();
                            if (text && text.length > 10) {
                                content.textBlocks.push({
                                    id: `injected-text-${i}`,
                                    tagName: el.tagName,
                                    content: text  // Full text, no truncation
                                });
                            }
                        });

                        // Get labeled graphic content with filtering and parsing
                        document.querySelectorAll('[class*="labeled-graphic"]').forEach((lg, i) => {
                            const items = [];
                            let pointIndex = 0;

                            lg.querySelectorAll('[class*="item"], button, [role="button"]').forEach((item) => {
                                const rawLabel = item.getAttribute('aria-label') || item.textContent.trim();

                                // Skip UI buttons and navigation elements
                                if (shouldExcludeLabel(rawLabel)) return;

                                // Parse label into title and description
                                const parsed = parseLabel(rawLabel);

                                items.push({
                                    index: pointIndex++,
                                    title: parsed.title,
                                    description: parsed.description,
                                    rawLabel: rawLabel  // Keep original for reference
                                });
                            });

                            if (items.length > 0) {
                                content.hotspots.push({
                                    id: `injected-lg-${i}`,
                                    points: items
                                });
                            }
                        });

                        // Get accordions
                        document.querySelectorAll('[class*="accordion"], .accordion').forEach((acc, i) => {
                            const panels = [];
                            acc.querySelectorAll('[class*="accordion-item"], [class*="panel"], details').forEach((panel, j) => {
                                const header = panel.querySelector('[class*="header"], summary, button')?.textContent.trim();
                                const body = panel.querySelector('[class*="body"], [class*="content"], .panel-body')?.textContent.trim();
                                if (header || body) {
                                    panels.push({
                                        index: j,
                                        title: header || '',
                                        content: body || ''
                                    });
                                }
                            });
                            if (panels.length > 0) {
                                content.accordions.push({
                                    id: `injected-acc-${i}`,
                                    panels: panels
                                });
                            }
                        });

                        // Get flip cards - Rise 360 uses specific class patterns
                        // Selector 1: Common flip card patterns
                        document.querySelectorAll('[class*="flip-card"], .flip-card, [class*="flashcard"], [class*="blocks-flip"], .blocks-flip-card, [class*="FlipCard"]').forEach((card, i) => {
                            let front = card.querySelector('[class*="flip-card__front"], [class*="front"], .front, [class*="face-front"]')?.textContent.trim();
                            let back = card.querySelector('[class*="flip-card__back"], [class*="back"], .back, [class*="face-back"]')?.textContent.trim();

                            if (!front && !back) {
                                const faces = card.querySelectorAll('[class*="face"], [class*="side"]');
                                if (faces.length >= 2) {
                                    front = faces[0]?.textContent.trim();
                                    back = faces[1]?.textContent.trim();
                                }
                            }

                            if (!front) front = card.getAttribute('aria-label') || '';

                            if (front || back) {
                                content.flipCards.push({
                                    id: `injected-fc-${i}`,
                                    front: front || '',
                                    back: back || ''
                                });
                            }
                        });

                        // Selector 2: Rise 360 flashcard blocks (fr-flashcard pattern)
                        document.querySelectorAll('[class*="fr-flashcard"], [class*="flashcard-block"], [data-block-type*="flash"]').forEach((card, i) => {
                            const front = card.querySelector('[class*="term"], [class*="front"], [class*="question"]')?.textContent.trim();
                            const back = card.querySelector('[class*="definition"], [class*="back"], [class*="answer"]')?.textContent.trim();
                            if ((front || back) && !content.flipCards.some(fc => fc.front === front && fc.back === back)) {
                                content.flipCards.push({
                                    id: `injected-fc-fr-${i}`,
                                    front: front || '',
                                    back: back || ''
                                });
                            }
                        });

                        // Selector 3: Button-based flip cards (Rise 360 interactive)
                        document.querySelectorAll('button[class*="card"], [role="button"][class*="card"]').forEach((btn, i) => {
                            const parent = btn.closest('[class*="flip"], [class*="flash"], [class*="card-container"]');
                            if (parent) {
                                const allText = parent.querySelectorAll('p, span, div');
                                const texts = Array.from(allText).map(el => el.textContent.trim()).filter(t => t.length > 5);
                                if (texts.length >= 2) {
                                    const front = texts[0];
                                    const back = texts.slice(1).join(' ');
                                    if (!content.flipCards.some(fc => fc.front === front)) {
                                        content.flipCards.push({
                                            id: `injected-fc-btn-${i}`,
                                            front: front,
                                            back: back
                                        });
                                    }
                                }
                            }
                        });

                        // Selector 4: Rise 360 blocks with specific structure (term/definition pairs)
                        document.querySelectorAll('[class*="blocks-flashcard"], [class*="block-flashcard"]').forEach((block, i) => {
                            const cards = block.querySelectorAll('[class*="card"]');
                            cards.forEach((card, j) => {
                                const texts = Array.from(card.querySelectorAll('p, h2, h3, h4, span')).map(el => el.textContent.trim()).filter(t => t.length > 3);
                                if (texts.length >= 1) {
                                    const front = texts[0];
                                    const back = texts.length > 1 ? texts.slice(1).join(' ') : '';
                                    if (!content.flipCards.some(fc => fc.front === front)) {
                                        content.flipCards.push({
                                            id: `injected-fc-block-${i}-${j}`,
                                            front: front,
                                            back: back
                                        });
                                    }
                                }
                            });
                        });

                        // Selector 5: Rise 360 block-flashcards (standard Rise 360 structure)
                        // Structure: .block-flashcards > ol > li.flashcard > .flashcard-side--front/.flashcard-side--back
                        document.querySelectorAll('.block-flashcards, [class*="block-flashcards"]').forEach((container, i) => {
                            container.querySelectorAll('li.flashcard, [class*="flashcard"][role="listitem"]').forEach((card, j) => {
                                const frontEl = card.querySelector('.flashcard-side--front .fr-view p, [class*="flashcard-side--front"] .fr-view p');
                                const backEl = card.querySelector('.flashcard-side--back .fr-view p, [class*="flashcard-side--back"] .fr-view p');
                                const front = frontEl?.textContent.trim() || '';
                                const back = backEl?.textContent.trim() || '';
                                if (front && !content.flipCards.some(fc => fc.front === front)) {
                                    content.flipCards.push({
                                        id: `injected-fc-rise360-${i}-${j}`,
                                        front: front,
                                        back: back
                                    });
                                }
                            });
                        });

                        // Selector 6: Fallback - find any li.flashcard even without container
                        document.querySelectorAll('li.flashcard').forEach((card, i) => {
                            const frontEl = card.querySelector('.flashcard-side--front .fr-view p');
                            const backEl = card.querySelector('.flashcard-side--back .fr-view p');
                            const front = frontEl?.textContent.trim() || '';
                            const back = backEl?.textContent.trim() || '';
                            if (front && !content.flipCards.some(fc => fc.front === front)) {
                                content.flipCards.push({
                                    id: `injected-fc-li-${i}`,
                                    front: front,
                                    back: back
                                });
                            }
                        });

                        // Get tables
                        document.querySelectorAll('table').forEach((table, i) => {
                            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
                            const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr =>
                                Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
                            );
                            if (headers.length > 0 || rows.length > 0) {
                                content.tables.push({ id: `injected-table-${i}`, headers, rows });
                            }
                        });

                        // Get lists (only filter navigation-specific items, keep most content)
                        document.querySelectorAll('ul, ol').forEach((list, i) => {
                            const items = Array.from(list.querySelectorAll(':scope > li'))
                                .map(li => li.textContent.trim())
                                .filter(text => {
                                    if (text.length < 3) return false;
                                    // Only filter exact matches for nav items, not content that contains these words
                                    const lowerText = text.toLowerCase();
                                    const navOnly = ['previous', 'next', 'close modal', 'skip', 'menu'];
                                    return !navOnly.some(nav => lowerText === nav);
                                });
                            if (items.length > 0) {
                                content.lists.push({ id: `injected-list-${i}`, items });
                            }
                        });

                        // Get knowledge checks / quiz questions
                        document.querySelectorAll('[class*="knowledge"], [class*="quiz"], [class*="question"], [class*="assessment"]').forEach((q, i) => {
                            const questionText = q.querySelector('h2, h3, h4, p, [class*="question-text"]')?.textContent.trim();

                            // Skip false positive knowledge checks (system messages, instructions)
                            if (!questionText || questionText.length < 10 || isFalsePositiveKC(questionText)) {
                                return;
                            }

                            const choices = Array.from(q.querySelectorAll('[class*="choice"], [class*="option"], [class*="answer"], li, label'))
                                .map(c => c.textContent.trim())
                                .filter(t => t.length > 0 && !shouldExcludeLabel(t));

                            // Try to find correct answer indicator
                            const correctChoice = q.querySelector('[class*="correct"], [aria-checked="true"], .selected');
                            const correctAnswer = correctChoice ? correctChoice.textContent.trim() : '';

                            // Try to find feedback
                            const feedback = q.querySelector('[class*="feedback"], [class*="explanation"]')?.textContent.trim();

                            content.knowledgeChecks.push({
                                id: `injected-kc-${i}`,
                                question: questionText,
                                choices: choices,
                                correctAnswer: correctAnswer,
                                feedback: feedback || ''
                            });
                        });

                        return content;
                    }
                });

                // Aggregate injection results
                injectedResponse = {
                    success: true,
                    data: { content: {} }
                };
                
                injectionResults.forEach(result => {
                    if (result.result) {
                        Object.keys(result.result).forEach(key => {
                            if (!injectedResponse.data.content[key]) {
                                injectedResponse.data.content[key] = [];
                            }
                            if (Array.isArray(result.result[key])) {
                                injectedResponse.data.content[key].push(...result.result[key]);
                            }
                        });
                    }
                });
            } catch (e) {
                console.log('Script injection note:', e.message);
            }

            // Combine all results
            this.currentData = this.combineResults(mainResponse, iframeResponse, allFramesResponse, injectedResponse, mainFrameMetadata);
            
            // Update UI
            this.displayResults(this.currentData);
            this.elements.copyBtn.disabled = false;
            
            const totalItems = this.currentData.statistics.totalItems;
            if (totalItems > 0) {
                this.showMessage(`Content extracted successfully! Found ${totalItems} items.`, 'success');
            } else {
                this.showMessage('No interactive content found. Try scrolling through the lesson first to load all content.', 'info');
            }

        } catch (error) {
            console.error('Scrape error:', error);
            this.showMessage('Error extracting content. Try refreshing the page.', 'error');
        } finally {
            this.elements.loading.classList.remove('active');
            this.elements.scrapeBtn.disabled = false;
        }
    }

    combineResults(...responses) {
        const combined = {
            metadata: {
                scrapedAt: new Date().toISOString(),
                url: '',
                course: '',
                lesson: '',
                path: ''
            },
            content: {
                flipCards: [],
                hotspots: [],
                knowledgeChecks: [],
                accordions: [],
                tabs: [],
                images: [],
                textBlocks: [],
                lists: [],
                tables: [],
                videos: [],
                rawText: ''
            },
            statistics: {}
        };

        // Merge all responses
        responses.forEach(response => {
            // Handle plain metadata object (from mainFrameMetadata)
            if (response && !response.success && !response.data && (response.url || response.course || response.lesson)) {
                Object.keys(response).forEach(key => {
                    if (response[key] && !combined.metadata[key]) {
                        combined.metadata[key] = response[key];
                    }
                });
                return;
            }

            if (response && response.success && response.data) {
                // Merge metadata from response.data.metadata
                if (response.data.metadata) {
                    Object.keys(response.data.metadata).forEach(key => {
                        if (response.data.metadata[key] && !combined.metadata[key]) {
                            combined.metadata[key] = response.data.metadata[key];
                        }
                    });
                }

                // Merge content
                if (response.data.content) {
                    Object.keys(response.data.content).forEach(key => {
                        // Skip metadata nested in content (we handle it separately)
                        if (key === 'metadata') {
                            // Extract metadata from content if present
                            Object.keys(response.data.content.metadata).forEach(metaKey => {
                                if (response.data.content.metadata[metaKey] && !combined.metadata[metaKey]) {
                                    combined.metadata[metaKey] = response.data.content.metadata[metaKey];
                                }
                            });
                            return;
                        }

                        if (Array.isArray(combined.content[key]) && Array.isArray(response.data.content[key])) {
                            combined.content[key].push(...response.data.content[key]);
                        } else if (response.data.content[key]) {
                            combined.content[key] = response.data.content[key];
                        }
                    });
                }
            }
        });

        // === IMPROVED DEDUPLICATION ===
        Object.keys(combined.content).forEach(key => {
            if (Array.isArray(combined.content[key])) {
                const seen = new Set();
                combined.content[key] = combined.content[key].filter(item => {
                    // Generate a content-based hash for deduplication
                    const hash = generateContentHash(item);
                    if (!hash || hash.length < 5) return false; // Skip empty items
                    if (seen.has(hash)) return false;
                    seen.add(hash);
                    return true;
                });
            }
        });

        // === ADDITIONAL CLEANUP ===

        // Merge all hotspot points into a single deduplicated hotspot
        const allHotspotPoints = [];
        const seenPointHashes = new Set();
        combined.content.hotspots.forEach(hotspot => {
            if (hotspot.points && Array.isArray(hotspot.points)) {
                hotspot.points.forEach(point => {
                    // Create hash from meaningful content
                    const meaningfulContent = (point.title || '') + '|' + (point.description || point.rawLabel || '').substring(0, 100);
                    if (meaningfulContent.length > 5 && !seenPointHashes.has(meaningfulContent)) {
                        seenPointHashes.add(meaningfulContent);
                        allHotspotPoints.push({
                            ...point,
                            index: allHotspotPoints.length
                        });
                    }
                });
            }
        });

        // Replace hotspots array with single deduplicated hotspot
        if (allHotspotPoints.length > 0) {
            combined.content.hotspots = [{
                id: 'hotspots-combined',
                points: allHotspotPoints
            }];
        } else {
            combined.content.hotspots = [];
        }

        // Remove duplicate text blocks with same content
        const textSeen = new Set();
        combined.content.textBlocks = combined.content.textBlocks.filter(block => {
            const contentHash = (block.content || '').substring(0, 100);
            if (textSeen.has(contentHash)) return false;
            textSeen.add(contentHash);
            return true;
        });

        // Remove duplicate list items
        const listSeen = new Set();
        combined.content.lists = combined.content.lists.filter(list => {
            const listHash = (list.items || []).join('|').substring(0, 150);
            if (listSeen.has(listHash)) return false;
            listSeen.add(listHash);
            return true;
        });

        // Remove false positive and duplicate knowledge checks
        const kcSeen = new Set();
        combined.content.knowledgeChecks = combined.content.knowledgeChecks.filter(kc => {
            if (!kc.question || kc.question.length < 10) return false;
            // Filter false positives
            const lower = kc.question.toLowerCase();
            if (FALSE_POSITIVE_KC.some(fp => lower.includes(fp))) return false;
            // Deduplicate
            const kcHash = kc.question.substring(0, 100);
            if (kcSeen.has(kcHash)) return false;
            kcSeen.add(kcHash);
            return true;
        });

        // Calculate statistics
        combined.statistics = {
            flipCards: combined.content.flipCards.length,
            hotspots: combined.content.hotspots.length,
            knowledgeChecks: combined.content.knowledgeChecks.length,
            accordions: combined.content.accordions.length,
            tabs: combined.content.tabs.length,
            images: combined.content.images.length,
            textBlocks: combined.content.textBlocks.length,
            lists: combined.content.lists.length,
            tables: combined.content.tables.length,
            videos: combined.content.videos.length,
            totalItems: 0
        };

        combined.statistics.totalItems = Object.values(combined.statistics)
            .filter(v => typeof v === 'number')
            .reduce((a, b) => a + b, 0);

        return combined;
    }

    displayResults(data) {
        // Update summary list
        const items = [];
        const stats = data.statistics;

        if (stats.flipCards > 0) items.push({ type: 'Flip Cards', count: stats.flipCards });
        if (stats.hotspots > 0) items.push({ type: 'Hotspots', count: stats.hotspots });
        if (stats.knowledgeChecks > 0) items.push({ type: 'Knowledge Checks', count: stats.knowledgeChecks });
        if (stats.accordions > 0) items.push({ type: 'Accordions', count: stats.accordions });
        if (stats.tabs > 0) items.push({ type: 'Tab Sections', count: stats.tabs });
        if (stats.images > 0) items.push({ type: 'Images', count: stats.images });
        if (stats.textBlocks > 0) items.push({ type: 'Text Blocks', count: stats.textBlocks });
        if (stats.lists > 0) items.push({ type: 'Lists', count: stats.lists });
        if (stats.tables > 0) items.push({ type: 'Tables', count: stats.tables });
        if (stats.videos > 0) items.push({ type: 'Videos', count: stats.videos });

        if (items.length === 0) {
            this.elements.resultsList.innerHTML = '<li><span class="type">No interactive content found</span></li>';
        } else {
            this.elements.resultsList.innerHTML = items.map(item => 
                `<li><span class="type">${item.type}</span><span class="count">${item.count}</span></li>`
            ).join('');
        }

        this.elements.totalCount.textContent = `${stats.totalItems} items`;

        // Update JSON output
        this.elements.jsonOutput.textContent = JSON.stringify(data, null, 2);
    }

    switchTab(tabName) {
        this.elements.tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        this.elements.summaryTab.classList.toggle('hidden', tabName !== 'summary');
        this.elements.jsonTab.classList.toggle('hidden', tabName !== 'json');
    }

    async copyToClipboard() {
        if (!this.currentData) {
            this.showMessage('No data to copy. Scrape content first.', 'error');
            return;
        }

        try {
            const jsonStr = JSON.stringify(this.currentData, null, 2);
            await navigator.clipboard.writeText(jsonStr);
            this.showMessage('JSON copied to clipboard!', 'success');
            
            // Visual feedback
            const originalText = this.elements.copyBtn.innerHTML;
            this.elements.copyBtn.innerHTML = '<span class="icon">✓</span> Copied!';
            setTimeout(() => {
                this.elements.copyBtn.innerHTML = originalText;
            }, 2000);
        } catch (error) {
            console.error('Copy error:', error);
            this.showMessage('Failed to copy. Try selecting and copying manually.', 'error');
        }
    }
}

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', () => {
    // Set version in header
    const versionEl = document.getElementById('version');
    if (versionEl) {
        versionEl.textContent = `v${VERSION}`;
    }

    new CeligoUScraper();
});
