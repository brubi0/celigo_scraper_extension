/**
 * Celigo U Scraper - Iframe Content Script
 * Runs inside SCORM content frames
 * Extracts interactive learning elements from Rise 360 / Articulate content
 */

(function() {
    'use strict';

    /**
     * Detect if we're in an Articulate Rise/Storyline course
     */
    function detectContentType() {
        const isRise = document.querySelector('[class*="rise"]') || 
                       document.querySelector('.blocks') ||
                       window.__rise_content;
        
        const isStoryline = document.querySelector('[class*="storyline"]') ||
                           window.GetPlayer;
        
        return {
            isRise: !!isRise,
            isStoryline: !!isStoryline,
            isArticulate: !!isRise || !!isStoryline
        };
    }

    /**
     * Wait for content to load (Rise 360 loads dynamically)
     */
    function waitForContent(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                const el = document.querySelector(selector);
                if (el) {
                    obs.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    /**
     * Extract Rise 360 specific content
     */
    function extractRiseContent() {
        const content = {
            flipCards: [],
            hotspots: [],
            knowledgeChecks: [],
            accordions: [],
            tabs: [],
            process: [],
            timeline: [],
            labeledGraphic: [],
            sorting: [],
            scenario: [],
            textBlocks: [],
            lists: [],
            images: [],
            videos: []
        };

        console.log('Celigo U Scraper: Starting Rise 360 extraction...');

        // Rise 360 Block Types - Updated selectors based on actual DOM

        // 1. Flip Cards
        document.querySelectorAll('.blocks-flip-card, [class*="flip-card"], [data-block-type="flip-card"], .block-flipcard, [class*="flipCard"]').forEach((card, i) => {
            const frontSide = card.querySelector('[class*="front"], [class*="Front"]');
            const backSide = card.querySelector('[class*="back"], [class*="Back"]');
            
            content.flipCards.push({
                id: `rise-flip-${i}`,
                front: {
                    title: frontSide?.querySelector('h2, h3, [class*="title"], [class*="heading"]')?.textContent.trim() || '',
                    content: frontSide?.querySelector('p, [class*="content"], [class*="text"]')?.textContent.trim() || ''
                },
                back: {
                    title: backSide?.querySelector('h2, h3, [class*="title"], [class*="heading"]')?.textContent.trim() || '',
                    content: backSide?.querySelector('p, [class*="content"], [class*="text"]')?.textContent.trim() || ''
                },
                source: 'rise360'
            });
        });
        console.log(`Celigo U Scraper: Found ${content.flipCards.length} flip cards`);

        // 2. Labeled Graphic / Hotspots - UPDATED SELECTORS
        document.querySelectorAll('.labeled-graphic-canvas, [class*="labeled-graphic"], .block-labeled-graphic, [class*="labeledGraphic"]').forEach((lg, i) => {
            console.log('Celigo U Scraper: Found labeled graphic container');
            const hotspotData = [];
            
            // Look for hotspot items with various class patterns
            const markers = lg.querySelectorAll(
                '.labeled-graphic-canvas__item, ' +
                '[class*="labeled-graphic"][class*="item"], ' +
                '[class*="marker"], [class*="hotspot"], [class*="pin"], ' +
                'button[class*="labeled"], [role="button"]'
            );
            
            console.log(`Celigo U Scraper: Found ${markers.length} markers in labeled graphic`);
            
            markers.forEach((marker, j) => {
                // Try multiple ways to get content
                const ariaLabel = marker.getAttribute('aria-label');
                const title = marker.getAttribute('title');
                const dataLabel = marker.getAttribute('data-label');
                const innerText = marker.textContent.trim();
                
                // Look for associated content panel/popover
                const contentPanel = marker.querySelector('[class*="content"], [class*="panel"], [class*="body"]');
                const panelText = contentPanel?.textContent.trim();
                
                hotspotData.push({
                    label: ariaLabel || title || dataLabel || `Point ${j + 1}`,
                    content: panelText || innerText || '',
                    index: j
                });
            });

            // Also look for content in separate elements (Rise often separates markers from content)
            lg.querySelectorAll('[class*="bounds"], [class*="content-panel"], [class*="info-panel"]').forEach((panel, k) => {
                const title = panel.querySelector('h2, h3, h4, [class*="title"], [class*="heading"]')?.textContent.trim();
                const body = panel.querySelector('p, [class*="body"], [class*="description"]')?.textContent.trim();
                
                if ((title || body) && !hotspotData.some(h => h.content === body)) {
                    hotspotData.push({
                        label: title || `Info ${k + 1}`,
                        content: body || '',
                        index: k
                    });
                }
            });

            if (hotspotData.length > 0) {
                content.hotspots.push({
                    id: `rise-labeled-${i}`,
                    title: lg.querySelector('h2, h3')?.textContent.trim() || 'Labeled Graphic',
                    points: hotspotData,
                    source: 'rise360'
                });
            }
        });
        console.log(`Celigo U Scraper: Found ${content.hotspots.length} hotspot groups`);

        // 3. Knowledge Check / Quiz
        document.querySelectorAll('.blocks-knowledge-check, [class*="knowledge"], [class*="quiz"], [data-block-type*="quiz"]').forEach((kc, i) => {
            const questionEl = kc.querySelector('[class*="question"], [class*="stem"], h2, h3');
            const question = questionEl?.textContent.trim();
            
            const choices = [];
            kc.querySelectorAll('[class*="choice"], [class*="option"], [class*="answer"], [role="radio"], [role="checkbox"]').forEach((choice, j) => {
                const text = choice.textContent.trim();
                const isCorrect = choice.classList.contains('correct') ||
                                  choice.getAttribute('data-correct') === 'true' ||
                                  choice.querySelector('[class*="correct-icon"]');
                
                if (text) {
                    choices.push({
                        text: text,
                        isCorrect: !!isCorrect,
                        index: j
                    });
                }
            });

            const feedback = kc.querySelector('[class*="feedback"]')?.textContent.trim();

            if (question) {
                content.knowledgeChecks.push({
                    id: `rise-kc-${i}`,
                    question: question,
                    choices: choices,
                    feedback: feedback || '',
                    source: 'rise360'
                });
            }
        });

        // 4. Accordion
        document.querySelectorAll('.blocks-accordion, [class*="accordion"], [data-block-type="accordion"]').forEach((acc, i) => {
            const items = [];
            
            acc.querySelectorAll('[class*="accordion-item"], [class*="item"], details').forEach((item, j) => {
                const header = item.querySelector('[class*="header"], [class*="title"], summary, button')?.textContent.trim();
                const body = item.querySelector('[class*="content"], [class*="body"], [class*="panel"]')?.textContent.trim();
                
                if (header) {
                    items.push({
                        header: header,
                        content: body || ''
                    });
                }
            });

            if (items.length > 0) {
                content.accordions.push({
                    id: `rise-accordion-${i}`,
                    title: acc.querySelector('h2')?.textContent.trim() || '',
                    items: items,
                    source: 'rise360'
                });
            }
        });

        // 5. Tabs
        document.querySelectorAll('.blocks-tabs, [class*="tabs-block"], [data-block-type="tabs"]').forEach((tabBlock, i) => {
            const tabs = [];
            
            const tabButtons = tabBlock.querySelectorAll('[role="tab"], [class*="tab-button"], [class*="nav-link"]');
            const tabPanels = tabBlock.querySelectorAll('[role="tabpanel"], [class*="tab-pane"], [class*="tab-content"]');
            
            tabButtons.forEach((btn, j) => {
                const label = btn.textContent.trim();
                const panel = tabPanels[j] || tabBlock.querySelector(`[aria-labelledby="${btn.id}"]`);
                const panelContent = panel?.textContent.trim() || '';
                
                tabs.push({
                    label: label,
                    content: panelContent
                });
            });

            if (tabs.length > 0) {
                content.tabs.push({
                    id: `rise-tabs-${i}`,
                    tabs: tabs,
                    source: 'rise360'
                });
            }
        });

        // 6. Process/Steps
        document.querySelectorAll('.blocks-process, [class*="process"], [class*="steps"], [data-block-type="process"]').forEach((process, i) => {
            const steps = [];
            
            process.querySelectorAll('[class*="step"], [class*="item"]').forEach((step, j) => {
                const number = step.querySelector('[class*="number"]')?.textContent.trim() || (j + 1).toString();
                const title = step.querySelector('h3, h4, [class*="title"]')?.textContent.trim();
                const description = step.querySelector('p, [class*="description"]')?.textContent.trim();
                
                if (title || description) {
                    steps.push({
                        number: number,
                        title: title || '',
                        description: description || ''
                    });
                }
            });

            if (steps.length > 0) {
                content.process.push({
                    id: `rise-process-${i}`,
                    title: process.querySelector('h2')?.textContent.trim() || '',
                    steps: steps,
                    source: 'rise360'
                });
            }
        });

        // 7. Timeline
        document.querySelectorAll('.blocks-timeline, [class*="timeline"], [data-block-type="timeline"]').forEach((tl, i) => {
            const events = [];
            
            tl.querySelectorAll('[class*="event"], [class*="item"]').forEach((event, j) => {
                const date = event.querySelector('[class*="date"], [class*="time"]')?.textContent.trim();
                const title = event.querySelector('h3, h4, [class*="title"]')?.textContent.trim();
                const description = event.querySelector('p, [class*="description"]')?.textContent.trim();
                
                if (title || description) {
                    events.push({
                        date: date || '',
                        title: title || '',
                        description: description || ''
                    });
                }
            });

            if (events.length > 0) {
                content.timeline.push({
                    id: `rise-timeline-${i}`,
                    events: events,
                    source: 'rise360'
                });
            }
        });

        // 8. Sorting Activity
        document.querySelectorAll('.blocks-sorting, [class*="sorting"], [data-block-type="sorting"]').forEach((sort, i) => {
            const categories = [];
            const items = [];
            
            sort.querySelectorAll('[class*="category"]').forEach(cat => {
                categories.push(cat.textContent.trim());
            });
            
            sort.querySelectorAll('[class*="draggable"], [class*="item"]').forEach(item => {
                const text = item.textContent.trim();
                const correctCategory = item.getAttribute('data-category') || '';
                if (text) {
                    items.push({ text, correctCategory });
                }
            });

            if (categories.length > 0 || items.length > 0) {
                content.sorting.push({
                    id: `rise-sorting-${i}`,
                    categories: categories,
                    items: items,
                    source: 'rise360'
                });
            }
        });

        // 9. Text Blocks
        document.querySelectorAll('.blocks-text, [class*="text-block"], p').forEach((text, i) => {
            const content_text = text.textContent.trim();
            if (content_text && content_text.length > 50) {
                content.textBlocks.push({
                    id: `rise-text-${i}`,
                    content: content_text,
                    source: 'rise360'
                });
            }
        });

        // 10. Lists
        document.querySelectorAll('.blocks-list, ul, ol').forEach((list, i) => {
            const items = Array.from(list.querySelectorAll(':scope > li'))
                .map(li => li.textContent.trim())
                .filter(t => t.length > 0);
            
            if (items.length > 1) {
                content.lists.push({
                    id: `rise-list-${i}`,
                    items: items,
                    ordered: list.tagName === 'OL',
                    source: 'rise360'
                });
            }
        });

        // 11. Images
        document.querySelectorAll('img').forEach((img, i) => {
            if (img.naturalWidth > 100 || img.width > 100) {
                const caption = img.closest('figure')?.querySelector('figcaption')?.textContent.trim();
                content.images.push({
                    id: `rise-img-${i}`,
                    src: img.src,
                    alt: img.alt || '',
                    caption: caption || '',
                    source: 'rise360'
                });
            }
        });

        // 12. Videos
        document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]').forEach((vid, i) => {
            content.videos.push({
                id: `rise-video-${i}`,
                src: vid.src || vid.querySelector('source')?.src || '',
                type: vid.tagName.toLowerCase(),
                source: 'rise360'
            });
        });

        // 13. FALLBACK: Extract ALL structured content we can find
        console.log('Celigo U Scraper: Running comprehensive fallback extraction...');
        
        // Get all elements with data-block-id (Rise 360 blocks)
        document.querySelectorAll('[data-block-id]').forEach((block, i) => {
            const blockType = block.getAttribute('data-block-type') || block.className;
            const blockText = block.textContent.trim();
            
            if (blockText && blockText.length > 20 && !content.textBlocks.some(t => t.content === blockText)) {
                content.textBlocks.push({
                    id: `block-${i}`,
                    blockType: blockType,
                    content: blockText.substring(0, 2000), // Limit length
                    source: 'rise360-block'
                });
            }
        });

        // Get all headings with their following content
        document.querySelectorAll('h1, h2, h3, h4').forEach((heading, i) => {
            const headingText = heading.textContent.trim();
            const nextSibling = heading.nextElementSibling;
            const siblingText = nextSibling?.textContent.trim() || '';
            
            if (headingText && !content.textBlocks.some(t => t.content.includes(headingText))) {
                content.textBlocks.push({
                    id: `heading-${i}`,
                    heading: headingText,
                    content: siblingText.substring(0, 1000),
                    source: 'rise360-heading'
                });
            }
        });

        // Get any elements that look like interactive items
        document.querySelectorAll('[role="button"], [aria-expanded], [aria-haspopup], button').forEach((el, i) => {
            const label = el.getAttribute('aria-label') || el.textContent.trim();
            if (label && label.length > 2 && label.length < 200) {
                // Check if this looks like a content button (not navigation)
                if (!label.match(/^(close|next|previous|back|menu|skip|submit)$/i)) {
                    if (!content.hotspots.some(h => h.points?.some(p => p.label === label))) {
                        content.hotspots.push({
                            id: `interactive-${i}`,
                            title: 'Interactive Element',
                            points: [{ label: label, content: '' }],
                            source: 'rise360-interactive'
                        });
                    }
                }
            }
        });

        console.log('Celigo U Scraper: Extraction complete', {
            flipCards: content.flipCards.length,
            hotspots: content.hotspots.length,
            knowledgeChecks: content.knowledgeChecks.length,
            accordions: content.accordions.length,
            tabs: content.tabs.length,
            textBlocks: content.textBlocks.length,
            lists: content.lists.length,
            images: content.images.length
        });

        return content;
    }

    /**
     * Generic content extraction for non-Rise content
     */
    function extractGenericContent() {
        const content = {
            flipCards: [],
            hotspots: [],
            knowledgeChecks: [],
            accordions: [],
            tabs: [],
            textBlocks: [],
            lists: [],
            tables: [],
            images: [],
            videos: []
        };

        // Look for common interactive element patterns
        
        // Flip cards
        document.querySelectorAll('[class*="flip"], [data-type="flip"]').forEach((el, i) => {
            const front = el.querySelector('[class*="front"]')?.textContent.trim();
            const back = el.querySelector('[class*="back"]')?.textContent.trim();
            if (front || back) {
                content.flipCards.push({ id: `generic-flip-${i}`, front: front || '', back: back || '' });
            }
        });

        // Hotspots
        document.querySelectorAll('[class*="hotspot"], [class*="marker"]').forEach((el, i) => {
            const text = el.textContent.trim() || el.getAttribute('title') || el.getAttribute('aria-label');
            if (text) {
                content.hotspots.push({ id: `generic-hotspot-${i}`, content: text });
            }
        });

        // Questions
        document.querySelectorAll('[class*="question"], [class*="quiz"]').forEach((el, i) => {
            const question = el.querySelector('h2, h3, p')?.textContent.trim();
            if (question) {
                content.knowledgeChecks.push({ id: `generic-kc-${i}`, question: question, choices: [] });
            }
        });

        // Text content
        document.querySelectorAll('p, .content').forEach((el, i) => {
            const text = el.textContent.trim();
            if (text && text.length > 50) {
                content.textBlocks.push({ id: `generic-text-${i}`, content: text });
            }
        });

        // Tables
        document.querySelectorAll('table').forEach((table, i) => {
            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
            const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => 
                Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
            );
            if (headers.length > 0 || rows.length > 0) {
                content.tables.push({ id: `generic-table-${i}`, headers, rows });
            }
        });

        return content;
    }

    /**
     * Main extraction function
     */
    function extractAllContent() {
        const contentType = detectContentType();
        
        if (contentType.isRise) {
            console.log('Celigo U Scraper: Detected Rise 360 content');
            return extractRiseContent();
        } else if (contentType.isStoryline) {
            console.log('Celigo U Scraper: Detected Storyline content');
            return extractGenericContent();
        } else {
            console.log('Celigo U Scraper: Using generic extraction');
            return extractGenericContent();
        }
    }

    /**
     * Listen for messages from parent/popup
     */
    window.addEventListener('message', (event) => {
        if (event.data && event.data.action === 'extractContent') {
            const content = extractAllContent();
            window.parent.postMessage({
                action: 'contentExtracted',
                content: content
            }, '*');
        }
    });

    // Also handle chrome runtime messages
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'scrapeIframeContent') {
                const content = extractAllContent();
                sendResponse({ success: true, data: { content } });
            }
            return true;
        });
    }

    // Auto-extract on load and expose globally
    window.celigoUScraper = {
        extract: extractAllContent,
        detectType: detectContentType
    };

    console.log('Celigo U Scraper: Iframe content script loaded');
})();
